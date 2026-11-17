-- Day of the month a goal is due. Null means the last day of the month.
alter table public.categories
  add column goal_due_day smallint check (goal_due_day between 1 and 31);

-- A fresh start copies categories column by column, so it has to carry the new one too.
do $$
declare
  v_definition text;
  v_patched text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fresh_start_budget';

  v_patched := replace(
    replace(v_definition, 'goal_needs_whole_amount, goal_created_month', 'goal_needs_whole_amount, goal_due_day, goal_created_month'),
    'r.goal_needs_whole_amount,', 'r.goal_needs_whole_amount, r.goal_due_day,'
  );
  if v_patched = v_definition or v_patched not like '%r.goal_due_day%' then
    raise exception 'fresh_start_budget no longer matches the expected category copy';
  end if;
  execute v_patched;
end;
$$;
