# ynab-dashboard

Envelope budgeting app for a two-person household. Data is imported once from
YNAB through its official API and then lives in our own Supabase database.
The budgeting math is reimplemented from a reverse engineering pass of the YNAB
web client: see [docs/ynab-internals.md](docs/ynab-internals.md).

## Stack

- Next.js 16 (App Router, Cache Components, `proxy.ts`), React 19, Tailwind CSS 4
- Supabase: Postgres + row level security per household, magic-link auth
- Vitest for the budget engine and importer mapping

## Layout

| Path | Purpose |
|---|---|
| `src/lib/budget-engine` | Pure budgeting math (carryover, cash/credit overspending, Ready to Assign) |
| `src/lib/ynab` | Official YNAB API client and export → rows mapping |
| `src/lib/budget-view.ts` | Builds the month screen from stored rows |
| `src/lib/data` | Server-only data access through the user's session (RLS applies) |
| `supabase/migrations` | Schema and RLS policies |
| `scripts/import-ynab.ts` | Importer (uses the Supabase secret key) |

## Setup

1. Create a Supabase project (or run `pnpm dlx supabase start` with Docker) and apply
   `supabase/migrations/*.sql` (SQL editor or `pnpm dlx supabase db push`).
2. In Supabase Auth → URL Configuration, set the Site URL and add
   `http://localhost:3000/auth/confirm` (and your production URL) to the redirect list.
3. `cp .env.example .env.local` and fill in the Supabase keys and `ALLOWED_EMAILS`
   (both household members, owner first).
4. `pnpm install && pnpm dev`, open http://localhost:3000 and have **each** member
   request a magic link once so their user exists.
5. Create a YNAB Personal Access Token (YNAB → Account Settings → Developer Settings),
   put it in `YNAB_ACCESS_TOKEN` and run:

   ```bash
   pnpm import:ynab
   ```

   The import is idempotent: YNAB ids are reused as primary keys, so it can be re-run.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Development server |
| `pnpm test` | Unit tests |
| `pnpm typecheck` | Route type generation + `tsc` |
| `pnpm lint` | ESLint |
| `pnpm build` | Production build |
| `pnpm import:ynab` | Import a YNAB plan into the household |

## Known gaps

Credit card payment auto-funding, goals/targets, scheduled transactions and
editing (assigning money, adding transactions) are not implemented yet. See the
last section of `docs/ynab-internals.md`.
