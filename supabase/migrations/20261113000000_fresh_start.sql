-- Fresh start: a new budget with the structure of an existing one and no history.
-- It copies open accounts (their current balance becomes the starting balance),
-- category groups, categories with their goals, payees and scheduled
-- transactions. Transactions and assignments are not copied; the source budget
-- is left untouched as the archive.
create function public.fresh_start_budget(p_source_budget_id uuid, p_name text, p_date date)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_source public.budgets%rowtype;
  v_new uuid;
  v_month date := date_trunc('month', p_date)::date;
  -- Old id -> new id for groups, accounts and categories.
  v_map jsonb := '{}'::jsonb;
  v_new_id uuid;
  v_income uuid;
  v_starting_payee uuid;
  r record;
begin
  select * into v_source from public.budgets b where b.id = p_source_budget_id;
  if not found then
    raise exception 'budget not found';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'budget name is required';
  end if;

  insert into public.budgets (household_id, name, currency_iso_code, currency_decimal_digits)
  values (v_source.household_id, trim(p_name), v_source.currency_iso_code, v_source.currency_decimal_digits)
  returning id into v_new;

  for r in
    select * from public.category_groups g where g.budget_id = p_source_budget_id order by g.sort_index, g.id
  loop
    insert into public.category_groups (budget_id, name, hidden, is_internal, sort_index)
    values (v_new, r.name, r.hidden, r.is_internal, r.sort_index)
    returning id into v_new_id;
    v_map := v_map || jsonb_build_object(r.id::text, v_new_id);
  end loop;

  for r in
    select * from public.accounts a where a.budget_id = p_source_budget_id and not a.closed order by a.name, a.id
  loop
    insert into public.accounts (budget_id, name, type, on_budget, note)
    values (v_new, r.name, r.type, r.on_budget, r.note)
    returning id into v_new_id;
    v_map := v_map || jsonb_build_object(r.id::text, v_new_id);
  end loop;

  for r in
    select * from public.categories c where c.budget_id = p_source_budget_id order by c.sort_index, c.id
  loop
    -- Payment categories only make sense for cards that were carried over; missing ones are recreated below.
    if r.kind = 'credit_card_payment' and (r.linked_account_id is null or not v_map ? r.linked_account_id::text) then
      continue;
    end if;
    insert into public.categories (
      budget_id, group_id, name, kind, hidden, note, linked_account_id, sort_index,
      goal_type, goal_target, goal_target_month, goal_cadence_months, goal_needs_whole_amount, goal_created_month
    )
    values (
      v_new, (v_map ->> r.group_id::text)::uuid, r.name, r.kind, r.hidden, r.note,
      (v_map ->> r.linked_account_id::text)::uuid, r.sort_index,
      r.goal_type, r.goal_target, r.goal_target_month, r.goal_cadence_months, r.goal_needs_whole_amount,
      case when r.goal_type is null then null else v_month end
    )
    returning id into v_new_id;
    v_map := v_map || jsonb_build_object(r.id::text, v_new_id);
  end loop;

  -- Every carried-over card needs a payment category, even if the source had none linked.
  for r in
    select a.id, a.name
    from public.accounts a
    where a.budget_id = v_new
      and a.on_budget
      and a.type in ('creditCard', 'lineOfCredit')
      and not exists (select 1 from public.categories c where c.linked_account_id = a.id)
  loop
    select g.id into v_new_id
    from public.category_groups g
    where g.budget_id = v_new and g.name = 'Credit Card Payments'
    limit 1;
    if v_new_id is null then
      insert into public.category_groups (budget_id, name, sort_index)
      values (v_new, 'Credit Card Payments', 1)
      returning id into v_new_id;
    end if;
    insert into public.categories (budget_id, group_id, name, kind, linked_account_id, sort_index)
    values (
      v_new, v_new_id, r.name, 'credit_card_payment', r.id,
      (select coalesce(max(c.sort_index), 0) + 1 from public.categories c where c.budget_id = v_new)
    );
  end loop;

  insert into public.payees (budget_id, name, transfer_account_id)
  select v_new, p.name, (v_map ->> p.transfer_account_id::text)::uuid
  from public.payees p
  where p.budget_id = p_source_budget_id
    and (p.transfer_account_id is null or v_map ? p.transfer_account_id::text);

  -- Starting balances: cash on budget accounts is income to assign; card debt and tracking balances are not.
  select c.id into v_income
  from public.categories c
  where c.budget_id = v_new and c.kind = 'income'
  limit 1;
  if v_income is null then
    insert into public.category_groups (budget_id, name, is_internal, sort_index)
    values (v_new, 'Internal Master Category', true, 0)
    returning id into v_new_id;
    insert into public.categories (budget_id, group_id, name, kind, sort_index)
    values (v_new, v_new_id, 'Inflow: Ready to Assign', 'income', 0)
    returning id into v_income;
  end if;

  select p.id into v_starting_payee
  from public.payees p
  where p.budget_id = v_new and p.name = 'Saldo inicial' and p.transfer_account_id is null
  limit 1;
  if v_starting_payee is null then
    insert into public.payees (budget_id, name) values (v_new, 'Saldo inicial') returning id into v_starting_payee;
  end if;

  insert into public.transactions (budget_id, account_id, date, amount, payee_id, category_id, cleared, approved)
  select
    v_new, (v_map ->> a.id::text)::uuid, p_date, balances.balance, v_starting_payee,
    case when a.on_budget and a.type not in ('creditCard', 'lineOfCredit') then v_income end,
    'cleared', true
  from public.accounts a
  join lateral (
    select coalesce(sum(t.amount), 0)::bigint as balance
    from public.transactions t
    where t.account_id = a.id
  ) balances on true
  where a.budget_id = p_source_budget_id
    and not a.closed
    and balances.balance <> 0;

  for r in
    select * from public.scheduled_transactions s where s.budget_id = p_source_budget_id
  loop
    if not v_map ? r.account_id::text then
      continue;
    end if;
    insert into public.scheduled_transactions (
      budget_id, account_id, date_first, date_next, frequency, amount, payee_id, category_id, memo, flag_color,
      transfer_account_id
    )
    values (
      v_new, (v_map ->> r.account_id::text)::uuid, r.date_first, r.date_next, r.frequency, r.amount,
      (
        select np.id
        from public.payees op
        join public.payees np on np.budget_id = v_new and np.name = op.name
        where op.id = r.payee_id
        order by np.id
        limit 1
      ),
      (v_map ->> r.category_id::text)::uuid, r.memo, r.flag_color, (v_map ->> r.transfer_account_id::text)::uuid
    )
    returning id into v_new_id;

    insert into public.scheduled_subtransactions (
      budget_id, scheduled_transaction_id, amount, payee_id, category_id, memo, transfer_account_id
    )
    select
      v_new, v_new_id, s.amount,
      (
        select np.id
        from public.payees op
        join public.payees np on np.budget_id = v_new and np.name = op.name
        where op.id = s.payee_id
        order by np.id
        limit 1
      ),
      (v_map ->> s.category_id::text)::uuid, s.memo, (v_map ->> s.transfer_account_id::text)::uuid
    from public.scheduled_subtransactions s
    where s.scheduled_transaction_id = r.id;
  end loop;

  return v_new;
end;
$$;

revoke execute on function public.fresh_start_budget(uuid, text, date) from public, anon;
grant execute on function public.fresh_start_budget(uuid, text, date) to authenticated, service_role;
