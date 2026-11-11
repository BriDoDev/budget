# YNAB web app internals (reverse engineering notes)

Static analysis of the YNAB web client served at `app.ynab.com`, captured on
2026-11-11 from a signed-in session of the repository owner. The goal was to
learn the data model and the budgeting math so this app can reproduce the
behavior with its own database. No YNAB source code is copied here; formulas
are restated in our own notation and implemented independently in
`src/lib/budget-engine`.

Each finding is labeled:

- **Observed**: read directly from the shipped JavaScript.
- **Inferred**: a conclusion supported by observed code, not proven end to end.
- **Unknown**: not resolved in this pass.

## 1. Client architecture

| Finding | Evidence | Label |
|---|---|---|
| UI is an Ember app (Embroider build, Vite/Rolldown chunks) under `/assets/ynab_web/`. | Script tags `@embroider/virtual/vendor.js`, `assets/main-*.js`, `rolldown-runtime-*.js` | Observed |
| Budget logic lives in a large shared library compiled from Kotlin to JavaScript (`wrapper-*.js`, ~8 MB). | Kotlin/JS runtime symbols (`CompletableDeferredImpl`, `DeferredCoroutine`, `hashCode`/`equals` data classes with `toString()` like `Calculations(balance=…)`) | Observed |
| The client keeps a local entity store and recomputes calculations on the device ("device knowledge"). | `performCalculations`, `calculationsDeviceKnowledge`, `incrementDeviceKnowledge()` in `wrapper-*.js` | Observed |

## 2. Network protocol

| Finding | Evidence | Label |
|---|---|---|
| Internal API is RPC style: `POST https://app.ynab.com/api/v1/catalog` with an `operation_name` (sent as query string and/or body). | Network log of the signed-in page; `operation_name=${e.operation_name}` template in the bundle | Observed |
| Operations include `loginUser`, `syncCatalogData` (user, budgets list, settings), `syncBudgetData` (budget entities) and `getChangedBudgetEntities`. | String literals in the bundle; first request `?operation_name=loginUser` | Observed |
| Sync is incremental: each entity carries `is_tombstone` and the client tracks server/device knowledge counters, sending only changed entities. | `is_tombstone` in every serializer, `deviceKnowledge`, `getChangedBudgetEntities` | Observed |
| `GET /api/v2/user` returns the current user profile. | Network log | Observed |
| The internal API is undocumented and session-cookie based. This app does **not** call it; imports use the official API (`https://api.ynab.com/v1/plans/{plan_id}`). | Design decision | — |

## 3. Entity model

The budget payload is keyed by wire names that map to client models
(`be_` = budget entity, `ce_` = catalog entity, `fe_` = family entity):

| Wire key | Client model | Notable fields |
|---|---|---|
| `be_accounts` | account | `account_type`, `on_budget`, `is_closed`, `sortable_index`, `last_reconciled_at`, debt fields |
| `be_account_calculations` | accountCalculation | `cleared_balance`, `uncleared_balance`, `transaction_count`, warning/error counts |
| `be_monthly_account_calculations` | monthlyAccountCalculation | `month`, `rolling_balance`, debt interest/escrow paid |
| `be_master_categories` | masterCategory (category group) | `internal_name`, `deletable`, `is_hidden`, `sortable_index` |
| `be_subcategories` | subCategory | `entities_master_category_id`, `entities_account_id` (credit card link), `internal_name`, `type`, goal fields (`goal_type`, `goal_target_amount`, `goal_created_on`, …) |
| `be_monthly_budgets` | monthlyBudget | `month`, `note` |
| `be_monthly_subcategory_budgets` | monthlySubCategoryBudget | `entities_monthly_budget_id`, `entities_subcategory_id`, `budgeted` (the assignment), `goal_snoozed_at` |
| `be_monthly_budget_calculations` | monthlyBudgetCalculation | `immediate_income`, `budgeted`, `cash_outflows`, `credit_outflows`, `balance`, `over_spent`, `available_to_budget`, `uncategorized_*`, `additional_to_be_budgeted`, `age_of_money` |
| `be_monthly_subcategory_budget_calculations` | monthlySubCategoryBudgetCalculation | `cash_outflows`, `positive_cash_outflows`, `credit_outflows`, `balance`, `budgeted_cash_outflows`, `budgeted_credit_outflows`, `unbudgeted_cash_outflows`, `unbudgeted_credit_outflows`, `balance_previous_month`, previous-month and average stats, goal progress |
| `be_transactions` | transaction | `entities_account_id`, `entities_payee_id`, `entities_subcategory_id`, `date`, `amount`, `cash_amount`, `credit_amount`, `credit_amount_adjusted`, `entities_scheduled_transaction_id` |
| `be_subtransactions` | subTransaction | per-split `amount`, `cash_amount`, `credit_amount`, `subcategory_credit_amount_preceding`, transfer ids |
| `be_scheduled_transactions` / `be_scheduled_subtransactions` | scheduledTransaction / scheduledSubTransaction | `frequency`, `upcoming_instances` |
| `be_money_movements` / `be_money_movement_groups` | moneyMovement / moneyMovementGroup | `from_`/`to_entities_monthly_subcategory_budget_id`, `amount`, `performed_by_user_id` (audit log of "move money") |
| `be_payees`, `be_payee_locations`, `be_payee_rename_conditions` | payee… | rename rules: `operator`, `operand` |
| `be_account_mappings` | accountMapping | direct-import bank mappings |
| `be_settings`, `be_budget`, `be_expected_income`, `be_onboarding_*`, `be_transaction_images` | misc | — |
| `fe_family`, `fe_family_members` | family, familyMember | `family_role`, `owned_budget_ids`, `shared_budget_ids` (YNAB Together sharing) |
| `ce_users`, `ce_user_budgets`, `ce_user_settings` | user… | catalog of the signed-in user |

All amounts are integer **milliunits**; the client rounds through
`roundMilliDollars` before persisting. (Observed)

**Mapping to this app** (`supabase/migrations`): `master categories → category_groups`,
`subcategories → categories`, `monthly subcategory budgets → month_assignments`,
`fe_family → households`. Calculation entities are not stored; they are
derived on read by the engine.

## 4. Budget math

### Category balance per month (Observed)

From the monthly subcategory calculator (`calculateBalance`,
`calculateBudgetedCashCreditOutflows`):

```
carryover  = previous.balance > 0 ? previous.balance : 0
balance    = carryover + budgeted + cash_outflows + credit_outflows
funded     = balance - cash_outflows - credit_outflows        (= carryover + budgeted)
unbudgeted_cash_outflows   = min(funded + cash, 0)
unbudgeted_credit_outflows = min(-(funded + cash), credit, 0) + max(funded + cash, 0)
```

A negative balance never rolls into the next month.

### Overspending (Observed)

```
cash_overspent   = min(max(unbudgeted_cash_outflows,   balance), 0)
credit_overspent = min(max(unbudgeted_credit_outflows, balance), 0)
```

### Ready to Assign (Observed)

From `MonthlyCalculations::performCalculations` and the budget header model:

```
available_to_budget[m] = available_to_budget[m-1] + over_spent[m-1]
                       + immediate_income[m] + additional_to_be_budgeted[m]
                       - budgeted[m]

budgeted_in_future[m]  = Σ budgeted of every month after m
funded_in_future[m]    = (available_to_budget[m] <= 0 || budgeted_in_future[m] <= 0)
                           ? 0 : min(available_to_budget[m], budgeted_in_future[m])
ready_to_assign[m]     = available_to_budget[m] - funded_in_future[m]
```

### Composition of the monthly aggregates (Inferred)

- `over_spent[m]` is the sum of **cash** overspending of the month, so it reduces
  the next month's Ready to Assign. Credit overspending becomes card debt instead.
  Supported by the cash/credit split above and by `hasCashOverspending` driving
  the warning in the budget header; the SQL aggregation itself was not located.
- `immediate_income[m]` is the sum of inflows categorized to the internal
  "Inflow: Ready to Assign" category with a date in month `m`.
- `budgeted[m]` is the sum of assignments of all non-internal categories.

### Not implemented yet (Unknown / next slices)

- **Credit card payment funding**: when spending on a card is covered by a
  category (`budgeted_credit_outflows`), YNAB moves that amount into the card's
  payment category (`subcategory_credit_amount_preceding`, `credit_amount_adjusted`).
  The engine currently treats payment categories like regular envelopes.
- `additional_to_be_budgeted` (only present on credit-card payment
  calculations) is treated as 0.
- Goals/targets (`calculateGoals`, `goalEffectiveTargetAmount`, cadences),
  scheduled transactions and `age_of_money`.
- Uncategorized outflows (`uncategorized_cash_outflows`) are ignored.
