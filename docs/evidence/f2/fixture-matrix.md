# F2 Development-Store Fixture Matrix

Use synthetic companies, contacts, emails, and orders only. Keep actual store,
company, customer, order, transaction, refund, and schedule identifiers out of
Git.

| Scenario label | Required capability | Expected contract observation | State |
|---|---|---|---|
| `standard-current-net-terms` | Standard-plan core B2B | Positive outstanding balance; schedule not due | Proved 2026-07-19 |
| `standard-overdue-unpaid` | Standard-plan core B2B | Positive outstanding balance; schedule due and overdue | Proved 2026-07-20 |
| `standard-paid` | Standard-plan core B2B | Zero outstanding balance; paid/completed state | Pending |
| `standard-refunded` | Standard-plan core B2B | Refund facts and authoritative outstanding balance agree | Pending |
| `standard-cancelled` | Standard-plan core B2B | Cancellation timestamp/state; no actionable balance | Pending |
| `standard-edited` | Standard-plan core B2B | Updated/current total facts reflect the edit | Pending |
| `standard-multi-currency` | Standard-plan core B2B | Shop and presentment Money values retain currencies | Proved 2026-07-20 |
| `standard-missing-email` | Standard-plan core B2B | Receivable remains readable; email action would fail closed | Pending |
| `plus-partial-payment` | Plus compatibility | Received/outstanding totals and schedule balances agree | Pending |
| `zero-outstanding` | Either | Zero is preserved and excluded from actionable receivables | Pending |
| `negative-outstanding` | Either | Negative merchant/customer direction is preserved | Pending |

For each scenario, execute the reusable `F2ReceivableOrderContract` operation
and record only sanitized observations in the evidence ledger. Do not copy the
response payload into the repository.
