# ynab-dashboard

Envelope budgeting app for a two-person household. It can start from a blank
budget or from a YNAB plan pulled through YNAB's official API, and keeps its
data in our own Supabase database. The budgeting math is reimplemented from a
reverse engineering pass of the YNAB web client: see
[docs/ynab-internals.md](docs/ynab-internals.md).

## What it does

- **Budget month**: Ready to Assign, editable assignments, moving money between
  categories, cash and credit overspending, goal progress with one-click funding.
- **Accounts**: budget and tracking accounts with cleared/uncleared balances,
  credit cards with an automatic payment category.
- **Transactions**: entry and editing with payees, transfers, splits, flags and
  cleared state; search and filters; reconciliation against the bank balance.
- **Categories and goals**: groups and categories can be created, renamed,
  hidden and reordered; four goal types.
- **Scheduled transactions**: recurring entries that are recorded or skipped
  when due.
- **Reports**: spending by category, income against expenses, net worth.
- **Household**: members sign in with a magic link; a member invites the other
  by e-mail.
- **YNAB sync** (one way, YNAB → app): full import first, then only what changed.

Not included: direct bank connections and card wallets.

## Stack

- Next.js 16 (App Router, Cache Components, `proxy.ts`), React 19, Tailwind CSS 4
- Supabase: Postgres with row level security per household, magic-link auth
- Vitest for the engine, goals, schedules, reports and importer mapping

## Layout

| Path | Purpose |
|---|---|
| `src/lib/budget-engine` | Pure budgeting math: carryover, overspending, Ready to Assign, credit card payments, goals |
| `src/lib/ynab` | Official YNAB API client, export → rows mapping, sync and parity check |
| `src/lib/budget-view.ts`, `src/lib/reports.ts`, `src/lib/schedule.ts` | Month screen, report aggregations, recurrence dates |
| `src/lib/data` | Server-only reads through the user's session (RLS applies) |
| `src/app/actions` | Server actions for every write |
| `src/app/budgets/[budgetId]` | Budget month, accounts, categories, scheduled, reports |
| `supabase/migrations` | Schema, RLS policies and SQL functions for writes and aggregated reads |
| `scripts/import-ynab.ts` | Command-line sync (uses the Supabase secret key) |

## Run it locally

Requires Docker (for the local Supabase stack), Node 24 and pnpm.

```bash
pnpm install
pnpm dlx supabase start          # applies supabase/migrations
cp .env.example .env.local       # then fill it in, see below
pnpm dev
```

`pnpm dlx supabase status -o env` prints the local `API_URL`, `PUBLISHABLE_KEY`
and `SECRET_KEY` for `.env.local`. Put your e-mail (and your partner's) in
`ALLOWED_EMAILS`. Sign-in e-mails of the local stack are delivered to Mailpit at
http://127.0.0.1:54324, not to a real inbox.

Open http://localhost:3000, sign in, then use **Hogar** to create the household
and either a blank budget or the YNAB import.

For a hosted Supabase project, apply the migrations with
`pnpm dlx supabase db push`, and in Auth → URL Configuration add
`<your app URL>/auth/confirm` to the redirect list.

## Bringing data from YNAB

1. Create a Personal Access Token in YNAB (Account Settings → Developer Settings)
   and set `YNAB_ACCESS_TOKEN` in `.env.local`.
2. Either press **Traer cambios de YNAB** on the Hogar screen, or run:

   ```bash
   pnpm import:ynab
   ```

The first run imports the whole plan and, from the command line, prints how our
Ready to Assign and category balances compare with YNAB's for the current month.
Later runs only fetch what changed since the previous one. The sync never writes
to YNAB; when the same row was edited on both sides, the YNAB version wins.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Development server |
| `pnpm test` | Unit tests |
| `pnpm typecheck` | Route type generation + `tsc` |
| `pnpm lint` | ESLint |
| `pnpm build` | Production build |
| `pnpm import:ynab` | Sync a YNAB plan into the household |

## Known gaps

- Credit card payment funding is computed per month, not per transaction, and
  was inferred rather than read from YNAB's code; check the import comparison.
- Weekly goals are approximated as a monthly amount.
- Editing a split transaction drops transfer legs inside the split.
- Categories and accounts can be hidden or closed, not deleted.
- Scheduled transactions are recorded manually; nothing runs on a timer.

Details and the list of YNAB behavior not reproduced are at the end of
`docs/ynab-internals.md`.
