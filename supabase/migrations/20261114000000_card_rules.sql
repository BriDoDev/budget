-- Credit card rules observed when comparing an imported plan against YNAB's own figures:
-- 1. Debt booked against the income category on a card (its starting balance) is not income.
-- 2. A transfer into a card is a payment (it spends the payment category); a transfer out of
--    a card is a cash advance, reported separately because that cash becomes money to assign.
create or replace function public.budget_activity(p_budget_id uuid)
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
  ),
  card_transfers as (
    select t.account_id, a.type, date_trunc('month', t.date)::date as month, t.amount
    from public.transactions t
    join public.accounts a on a.id = t.account_id
    where t.budget_id = p_budget_id
      and a.on_budget
      and a.type in ('creditCard', 'lineOfCredit')
      and t.transfer_account_id is not null
      and t.category_id is null
  )
  select 'activity'::text, l.category_id, l.account_id, a.type, date_trunc('month', l.date)::date, sum(l.amount)::bigint
  from lines l
  join public.accounts a on a.id = l.account_id
  join public.categories c on c.id = l.category_id
  where a.on_budget
    and not (a.type in ('creditCard', 'lineOfCredit') and c.kind = 'income' and l.amount < 0)
  group by l.category_id, l.account_id, a.type, date_trunc('month', l.date)
  union all
  select 'payment'::text, null::uuid, ct.account_id, ct.type, ct.month, sum(-ct.amount)::bigint
  from card_transfers ct
  where ct.amount > 0
  group by ct.account_id, ct.type, ct.month
  union all
  select 'advance'::text, null::uuid, ct.account_id, ct.type, ct.month, sum(-ct.amount)::bigint
  from card_transfers ct
  where ct.amount < 0
  group by ct.account_id, ct.type, ct.month;
$$;
