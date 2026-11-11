-- Budgeting features: goals, scheduled transactions, household invites, YNAB
-- delta sync bookkeeping, and the functions behind writes and aggregated reads.
-- Functions are security invoker unless noted, so row level security applies.

-- Goals --------------------------------------------------------------------

alter table public.categories
  add column goal_type text
    check (goal_type in ('monthly_funding', 'needed_spending', 'target_balance', 'target_balance_by_date')),
  add column goal_target bigint,
  add column goal_target_month date check (goal_target_month is null or extract(day from goal_target_month) = 1),
  add column goal_cadence_months integer not null default 0 check (goal_cadence_months >= 0),
  add column goal_needs_whole_amount boolean not null default true,
  add column goal_created_month date check (goal_created_month is null or extract(day from goal_created_month) = 1);

-- YNAB sync ----------------------------------------------------------------

alter table public.budgets add column ynab_server_knowledge bigint;

-- Scheduled transactions ---------------------------------------------------

create table public.scheduled_transactions (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  date_first date not null,
  date_next date not null,
  frequency text not null default 'never' check (frequency in (
    'never', 'daily', 'weekly', 'everyOtherWeek', 'twiceAMonth', 'every4Weeks', 'monthly',
    'everyOtherMonth', 'every3Months', 'every4Months', 'twiceAYear', 'yearly', 'everyOtherYear'
  )),
  amount bigint not null,
  payee_id uuid references public.payees (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  memo text,
  flag_color text,
  transfer_account_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now()
);

create index scheduled_transactions_budget_next_idx on public.scheduled_transactions (budget_id, date_next);

create table public.scheduled_subtransactions (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  scheduled_transaction_id uuid not null references public.scheduled_transactions (id) on delete cascade,
  amount bigint not null,
  payee_id uuid references public.payees (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  memo text,
  transfer_account_id uuid references public.accounts (id) on delete set null
);

create index scheduled_subtransactions_parent_idx on public.scheduled_subtransactions (scheduled_transaction_id);

alter table public.scheduled_transactions enable row level security;
alter table public.scheduled_subtransactions enable row level security;

create policy "members manage scheduled transactions"
  on public.scheduled_transactions for all to authenticated
  using (public.can_access_budget(budget_id))
  with check (public.can_access_budget(budget_id));

create policy "members manage scheduled subtransactions"
  on public.scheduled_subtransactions for all to authenticated
  using (public.can_access_budget(budget_id))
  with check (public.can_access_budget(budget_id));

-- Household invites --------------------------------------------------------

create table public.household_invites (
  household_id uuid not null references public.households (id) on delete cascade,
  email text not null check (email = lower(email)),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (household_id, email)
);

alter table public.household_invites enable row level security;

create policy "members manage household invites"
  on public.household_invites for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Creates a household owned by the caller. Definer: households has no insert policy.
create function public.create_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  new_id uuid;
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(household_name), '') = '' then
    raise exception 'household name is required';
  end if;
  insert into public.households (name) values (trim(household_name)) returning id into new_id;
  insert into public.household_members (household_id, user_id, role) values (new_id, caller, 'owner');
  return new_id;
end;
$$;

-- Turns pending invites for the caller's verified e-mail into memberships.
create function public.accept_household_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_email text := lower((select auth.jwt() ->> 'email'));
  accepted integer;
begin
  if caller is null or caller_email is null then
    return 0;
  end if;
  insert into public.household_members (household_id, user_id, role)
  select i.household_id, caller, 'member'
  from public.household_invites i
  where i.email = caller_email
  on conflict do nothing;
  get diagnostics accepted = row_count;
  delete from public.household_invites where email = caller_email;
  return accepted;
end;
$$;

-- Lets the sign-in form accept invited e-mails before they have an account.
create function public.is_email_invited(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_invites i where i.email = lower(trim(candidate))
  );
$$;

-- Members with their e-mail (auth.users is not readable through the API).
create function public.household_people(target_household_id uuid)
returns table (user_id uuid, email text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, m.role
  from public.household_members m
  join auth.users u on u.id = m.user_id
  where m.household_id = target_household_id
    and public.is_household_member(target_household_id)
  order by m.created_at;
$$;

-- Budget and account setup -------------------------------------------------

create function public.create_budget(target_household_id uuid, budget_name text, currency text default 'MXN')
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_budget uuid;
  internal_group uuid;
begin
  insert into public.budgets (household_id, name, currency_iso_code)
  values (target_household_id, trim(budget_name), upper(currency))
  returning id into new_budget;

  insert into public.category_groups (budget_id, name, is_internal, sort_index)
  values (new_budget, 'Internal Master Category', true, 0)
  returning id into internal_group;

  insert into public.categories (budget_id, group_id, name, kind, sort_index) values
    (new_budget, internal_group, 'Inflow: Ready to Assign', 'income', 0),
    (new_budget, internal_group, 'Uncategorized', 'internal', 1);

  insert into public.category_groups (budget_id, name, sort_index)
  values (new_budget, 'Credit Card Payments', 1);

  return new_budget;
end;
$$;

-- Creates an account, its credit card payment category when needed, and the
-- starting balance transaction (income for cash accounts, uncategorized debt for credit).
create function public.create_account(
  p_budget_id uuid,
  p_name text,
  p_type text,
  p_on_budget boolean,
  p_starting_balance bigint,
  p_date date
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_account uuid;
  payment_group uuid;
  income_category uuid;
  starting_payee uuid;
  is_credit boolean := p_type in ('creditCard', 'lineOfCredit');
begin
  insert into public.accounts (budget_id, name, type, on_budget)
  values (p_budget_id, trim(p_name), p_type, p_on_budget)
  returning id into new_account;

  if is_credit and p_on_budget then
    select g.id into payment_group
    from public.category_groups g
    where g.budget_id = p_budget_id and g.name = 'Credit Card Payments'
    limit 1;
    if payment_group is null then
      insert into public.category_groups (budget_id, name, sort_index)
      values (p_budget_id, 'Credit Card Payments', 1)
      returning id into payment_group;
    end if;
    insert into public.categories (budget_id, group_id, name, kind, linked_account_id, sort_index)
    values (
      p_budget_id, payment_group, trim(p_name), 'credit_card_payment', new_account,
      (select coalesce(max(c.sort_index), 0) + 1 from public.categories c where c.budget_id = p_budget_id)
    );
  end if;

  if p_starting_balance <> 0 then
    select c.id into income_category
    from public.categories c
    where c.budget_id = p_budget_id and c.kind = 'income'
    limit 1;

    select p.id into starting_payee
    from public.payees p
    where p.budget_id = p_budget_id and p.name = 'Saldo inicial' and p.transfer_account_id is null
    limit 1;
    if starting_payee is null then
      insert into public.payees (budget_id, name) values (p_budget_id, 'Saldo inicial') returning id into starting_payee;
    end if;

    insert into public.transactions (budget_id, account_id, date, amount, payee_id, category_id, cleared, approved)
    values (
      p_budget_id, new_account, p_date, p_starting_balance, starting_payee,
      case when p_on_budget and not is_credit then income_category end,
      'cleared', true
    );
  end if;

  return new_account;
end;
$$;

-- Budget writes ------------------------------------------------------------

-- Moves assigned money between two categories in a month. A null side is Ready to Assign.
create function public.move_money(p_budget_id uuid, p_month date, p_from uuid, p_to uuid, p_amount bigint)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  if p_from is not distinct from p_to then
    raise exception 'source and destination must differ';
  end if;
  if p_from is not null then
    insert into public.month_assignments (budget_id, category_id, month, amount)
    values (p_budget_id, p_from, p_month, -p_amount)
    on conflict (category_id, month)
    do update set amount = public.month_assignments.amount - p_amount, updated_at = now();
  end if;
  if p_to is not null then
    insert into public.month_assignments (budget_id, category_id, month, amount)
    values (p_budget_id, p_to, p_month, p_amount)
    on conflict (category_id, month)
    do update set amount = public.month_assignments.amount + p_amount, updated_at = now();
  end if;
end;
$$;

-- Creates or updates a transaction with its splits and, for transfers, the
-- mirrored transaction in the other account. Payload keys: id, budget_id,
-- account_id, date, amount, payee_name, category_id, memo, cleared, flag_color,
-- transfer_account_id, splits [{amount, category_id, memo}].
create function public.save_transaction(p jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_id text := nullif(p ->> 'id', '');
  v_budget uuid := (p ->> 'budget_id')::uuid;
  v_account uuid := (p ->> 'account_id')::uuid;
  v_date date := (p ->> 'date')::date;
  v_amount bigint := (p ->> 'amount')::bigint;
  v_category uuid := nullif(p ->> 'category_id', '')::uuid;
  v_transfer uuid := nullif(p ->> 'transfer_account_id', '')::uuid;
  v_payee_name text := nullif(trim(p ->> 'payee_name'), '');
  v_memo text := nullif(trim(p ->> 'memo'), '');
  v_cleared text := coalesce(nullif(p ->> 'cleared', ''), 'uncleared');
  v_flag text := nullif(p ->> 'flag_color', '');
  v_splits jsonb := coalesce(p -> 'splits', '[]'::jsonb);
  v_payee uuid;
  v_mirror text;
  v_mirror_cleared text := 'uncleared';
  v_account_on_budget boolean;
  v_transfer_on_budget boolean;
  v_mirror_category uuid;
begin
  select a.on_budget into v_account_on_budget
  from public.accounts a where a.id = v_account and a.budget_id = v_budget;
  if not found then
    raise exception 'account not found';
  end if;

  if v_transfer is not null then
    if v_transfer = v_account then
      raise exception 'cannot transfer to the same account';
    end if;
    select a.on_budget into v_transfer_on_budget
    from public.accounts a where a.id = v_transfer and a.budget_id = v_budget;
    if not found then
      raise exception 'transfer account not found';
    end if;
    -- Only a transfer between a budget account and a tracking account is categorized,
    -- and the category lives on the budget side.
    if v_account_on_budget = v_transfer_on_budget then
      v_category := null;
    elsif v_transfer_on_budget then
      v_mirror_category := v_category;
      v_category := null;
    end if;
    v_splits := '[]'::jsonb;
  elsif v_payee_name is not null then
    select py.id into v_payee
    from public.payees py
    where py.budget_id = v_budget and lower(py.name) = lower(v_payee_name) and py.transfer_account_id is null
    limit 1;
    if v_payee is null then
      insert into public.payees (budget_id, name) values (v_budget, v_payee_name) returning id into v_payee;
    end if;
  end if;

  if jsonb_array_length(v_splits) > 0 then
    if (select sum((s ->> 'amount')::bigint) from jsonb_array_elements(v_splits) s) <> v_amount then
      raise exception 'split amounts must add up to the transaction amount';
    end if;
    v_category := null;
  end if;

  if v_id is null then
    insert into public.transactions (
      budget_id, account_id, date, amount, payee_id, category_id, memo, cleared, approved, flag_color, transfer_account_id
    )
    values (v_budget, v_account, v_date, v_amount, v_payee, v_category, v_memo, v_cleared, true, v_flag, v_transfer)
    returning id into v_id;
  else
    select t.transfer_transaction_id into v_mirror
    from public.transactions t where t.id = v_id and t.budget_id = v_budget;
    if not found then
      raise exception 'transaction not found';
    end if;
    if v_mirror is not null then
      select t.cleared into v_mirror_cleared from public.transactions t where t.id = v_mirror;
      delete from public.transactions where id = v_mirror and budget_id = v_budget;
    end if;
    update public.transactions set
      account_id = v_account, date = v_date, amount = v_amount, payee_id = v_payee, category_id = v_category,
      memo = v_memo, cleared = v_cleared, approved = true, flag_color = v_flag,
      transfer_account_id = v_transfer, transfer_transaction_id = null
    where id = v_id;
    delete from public.subtransactions where transaction_id = v_id;
  end if;

  insert into public.subtransactions (budget_id, transaction_id, amount, category_id, memo)
  select v_budget, v_id, (s ->> 'amount')::bigint, nullif(s ->> 'category_id', '')::uuid, nullif(trim(s ->> 'memo'), '')
  from jsonb_array_elements(v_splits) s;

  if v_transfer is not null then
    insert into public.transactions (
      budget_id, account_id, date, amount, category_id, memo, cleared, approved, flag_color,
      transfer_account_id, transfer_transaction_id
    )
    values (
      v_budget, v_transfer, v_date, -v_amount, v_mirror_category, v_memo, coalesce(v_mirror_cleared, 'uncleared'),
      true, v_flag, v_account, v_id
    )
    returning id into v_mirror;
    update public.transactions set transfer_transaction_id = v_mirror where id = v_id;
  end if;

  return v_id;
end;
$$;

create function public.delete_transaction(p_id text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_mirror text;
begin
  select t.transfer_transaction_id into v_mirror from public.transactions t where t.id = p_id;
  delete from public.transactions where id = p_id;
  if v_mirror is not null then
    delete from public.transactions where id = v_mirror;
  end if;
end;
$$;

-- Locks cleared transactions as reconciled. When the statement balance differs
-- from the cleared balance, records the difference as an adjustment first.
-- Returns the adjustment amount (0 when the balances matched).
create function public.reconcile_account(p_account_id uuid, p_statement_balance bigint, p_date date)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_budget uuid;
  v_on_budget boolean;
  v_cleared bigint;
  v_difference bigint;
  v_income uuid;
  v_payee uuid;
begin
  select a.budget_id, a.on_budget into v_budget, v_on_budget
  from public.accounts a where a.id = p_account_id;
  if not found then
    raise exception 'account not found';
  end if;

  select coalesce(sum(t.amount), 0) into v_cleared
  from public.transactions t
  where t.account_id = p_account_id and t.cleared in ('cleared', 'reconciled');

  v_difference := p_statement_balance - v_cleared;

  if v_difference <> 0 then
    select c.id into v_income
    from public.categories c where c.budget_id = v_budget and c.kind = 'income' limit 1;

    select py.id into v_payee
    from public.payees py
    where py.budget_id = v_budget and py.name = 'Ajuste de conciliación' and py.transfer_account_id is null
    limit 1;
    if v_payee is null then
      insert into public.payees (budget_id, name) values (v_budget, 'Ajuste de conciliación') returning id into v_payee;
    end if;

    insert into public.transactions (budget_id, account_id, date, amount, payee_id, category_id, cleared, approved)
    values (v_budget, p_account_id, p_date, v_difference, v_payee, case when v_on_budget then v_income end, 'cleared', true);
  end if;

  update public.transactions set cleared = 'reconciled'
  where account_id = p_account_id and cleared = 'cleared';

  return v_difference;
end;
$$;

-- Aggregated reads ---------------------------------------------------------

-- Categorized activity per category, account and month, plus credit card
-- payments (transfers in or out of a credit account). Split transactions
-- contribute their subtransactions; tracking accounts are excluded.
create function public.budget_activity(p_budget_id uuid)
returns table (kind text, category_id uuid, account_id uuid, account_type text, month date, amount bigint)
language sql
stable
set search_path = ''
as $$
  with lines as (
    select t.account_id, t.date, s.category_id, s.amount
    from public.transactions t
    join public.subtransactions s on s.transaction_id = t.id
    where t.budget_id = p_budget_id
    union all
    select t.account_id, t.date, t.category_id, t.amount
    from public.transactions t
    where t.budget_id = p_budget_id
      and not exists (select 1 from public.subtransactions s where s.transaction_id = t.id)
  )
  select 'activity'::text, l.category_id, l.account_id, a.type, date_trunc('month', l.date)::date, sum(l.amount)::bigint
  from lines l
  join public.accounts a on a.id = l.account_id
  where a.on_budget and l.category_id is not null
  group by l.category_id, l.account_id, a.type, date_trunc('month', l.date)
  union all
  select 'payment'::text, null::uuid, t.account_id, a.type, date_trunc('month', t.date)::date, sum(-t.amount)::bigint
  from public.transactions t
  join public.accounts a on a.id = t.account_id
  where t.budget_id = p_budget_id
    and a.on_budget
    and a.type in ('creditCard', 'lineOfCredit')
    and t.transfer_account_id is not null
    and t.category_id is null
  group by t.account_id, a.type, date_trunc('month', t.date);
$$;

-- Net change per account and month, split by cleared state. Summing every
-- month gives the balances; a running sum gives net worth over time.
create function public.account_month_totals(p_budget_id uuid)
returns table (account_id uuid, month date, cleared_amount bigint, uncleared_amount bigint)
language sql
stable
set search_path = ''
as $$
  select
    t.account_id,
    date_trunc('month', t.date)::date,
    coalesce(sum(t.amount) filter (where t.cleared <> 'uncleared'), 0)::bigint,
    coalesce(sum(t.amount) filter (where t.cleared = 'uncleared'), 0)::bigint
  from public.transactions t
  where t.budget_id = p_budget_id
  group by t.account_id, date_trunc('month', t.date);
$$;

-- Grants -------------------------------------------------------------------

revoke execute on function
  public.create_household(text),
  public.accept_household_invites(),
  public.household_people(uuid),
  public.create_budget(uuid, text, text),
  public.create_account(uuid, text, text, boolean, bigint, date),
  public.move_money(uuid, date, uuid, uuid, bigint),
  public.save_transaction(jsonb),
  public.delete_transaction(text),
  public.reconcile_account(uuid, bigint, date),
  public.budget_activity(uuid),
  public.account_month_totals(uuid)
from public, anon;

grant execute on function
  public.create_household(text),
  public.accept_household_invites(),
  public.household_people(uuid),
  public.create_budget(uuid, text, text),
  public.create_account(uuid, text, text, boolean, bigint, date),
  public.move_money(uuid, date, uuid, uuid, bigint),
  public.save_transaction(jsonb),
  public.delete_transaction(text),
  public.reconcile_account(uuid, bigint, date),
  public.budget_activity(uuid),
  public.account_month_totals(uuid)
to authenticated, service_role;

revoke execute on function public.is_email_invited(text) from public;
grant execute on function public.is_email_invited(text) to anon, authenticated, service_role;
