-- Initial schema: households share budgets; every budget table is scoped by
-- budget_id and protected with row level security through household membership.
-- Amounts are bigint milliunits (1 currency unit = 1000).

-- Households ---------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_id_idx on public.household_members (user_id);

-- Budgets ------------------------------------------------------------------

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  currency_iso_code text not null default 'MXN',
  currency_decimal_digits smallint not null default 2,
  imported_from text,
  imported_at timestamptz,
  created_at timestamptz not null default now()
);

create index budgets_household_id_idx on public.budgets (household_id);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  name text not null,
  type text not null,
  on_budget boolean not null default true,
  closed boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

create index accounts_budget_id_idx on public.accounts (budget_id);

create table public.category_groups (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  name text not null,
  hidden boolean not null default false,
  is_internal boolean not null default false,
  sort_index integer not null default 0,
  created_at timestamptz not null default now()
);

create index category_groups_budget_id_idx on public.category_groups (budget_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  group_id uuid not null references public.category_groups (id) on delete cascade,
  name text not null,
  kind text not null default 'standard'
    check (kind in ('standard', 'income', 'credit_card_payment', 'internal')),
  hidden boolean not null default false,
  note text,
  linked_account_id uuid references public.accounts (id) on delete set null,
  sort_index integer not null default 0,
  created_at timestamptz not null default now()
);

create index categories_budget_id_idx on public.categories (budget_id);
create index categories_group_id_idx on public.categories (group_id);

create table public.month_assignments (
  budget_id uuid not null references public.budgets (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (category_id, month)
);

create index month_assignments_budget_month_idx on public.month_assignments (budget_id, month);

create table public.payees (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  name text not null,
  transfer_account_id uuid references public.accounts (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index payees_budget_id_idx on public.payees (budget_id);

-- Transaction ids are text: imported YNAB ids are not guaranteed to be UUIDs.
create table public.transactions (
  id text primary key default gen_random_uuid()::text,
  budget_id uuid not null references public.budgets (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  date date not null,
  amount bigint not null,
  payee_id uuid references public.payees (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  memo text,
  cleared text not null default 'uncleared' check (cleared in ('cleared', 'uncleared', 'reconciled')),
  approved boolean not null default true,
  flag_color text,
  transfer_account_id uuid references public.accounts (id) on delete set null,
  transfer_transaction_id text,
  created_at timestamptz not null default now()
);

create index transactions_budget_date_idx on public.transactions (budget_id, date);
create index transactions_account_id_idx on public.transactions (account_id);
create index transactions_category_id_idx on public.transactions (category_id);

create table public.subtransactions (
  id text primary key default gen_random_uuid()::text,
  budget_id uuid not null references public.budgets (id) on delete cascade,
  transaction_id text not null references public.transactions (id) on delete cascade,
  amount bigint not null,
  payee_id uuid references public.payees (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  memo text,
  transfer_account_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now()
);

create index subtransactions_budget_id_idx on public.subtransactions (budget_id);
create index subtransactions_transaction_id_idx on public.subtransactions (transaction_id);

-- Access helpers -----------------------------------------------------------
-- security definer avoids recursive RLS evaluation on household_members.

create function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = target_household_id
      and m.user_id = (select auth.uid())
  );
$$;

create function public.can_access_budget(target_budget_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.budgets b
    join public.household_members m on m.household_id = b.household_id
    where b.id = target_budget_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_household_member(uuid) from public, anon;
revoke execute on function public.can_access_budget(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.can_access_budget(uuid) to authenticated;

-- Row level security -------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.budgets enable row level security;
alter table public.accounts enable row level security;
alter table public.category_groups enable row level security;
alter table public.categories enable row level security;
alter table public.month_assignments enable row level security;
alter table public.payees enable row level security;
alter table public.transactions enable row level security;
alter table public.subtransactions enable row level security;

create policy "members read their households"
  on public.households for select to authenticated
  using (public.is_household_member(id));

create policy "members update their households"
  on public.households for update to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

create policy "members read household membership"
  on public.household_members for select to authenticated
  using (public.is_household_member(household_id));

create policy "members manage household budgets"
  on public.budgets for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members manage accounts"
  on public.accounts for all to authenticated
  using (public.can_access_budget(budget_id))
  with check (public.can_access_budget(budget_id));

create policy "members manage category groups"
  on public.category_groups for all to authenticated
  using (public.can_access_budget(budget_id))
  with check (public.can_access_budget(budget_id));

create policy "members manage categories"
  on public.categories for all to authenticated
  using (public.can_access_budget(budget_id))
  with check (public.can_access_budget(budget_id));

create policy "members manage month assignments"
  on public.month_assignments for all to authenticated
  using (public.can_access_budget(budget_id))
  with check (public.can_access_budget(budget_id));

create policy "members manage payees"
  on public.payees for all to authenticated
  using (public.can_access_budget(budget_id))
  with check (public.can_access_budget(budget_id));

create policy "members manage transactions"
  on public.transactions for all to authenticated
  using (public.can_access_budget(budget_id))
  with check (public.can_access_budget(budget_id));

create policy "members manage subtransactions"
  on public.subtransactions for all to authenticated
  using (public.can_access_budget(budget_id))
  with check (public.can_access_budget(budget_id));
