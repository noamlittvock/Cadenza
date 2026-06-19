# Payment Mechanism Discovery Questions

Use this with an agent or operator who can inspect the organization's real payment
mechanism. The goal is to scope Cadenza's `payments-charges` Blueprint work,
validate the accepted D-20 single-currency default against real org data, and
identify configuration or migration requirements without guessing.

## Safe-Handling Rules

- Do not share passwords, API keys, processor secrets, bank credentials, webhook
  signing secrets, full card numbers, or raw access tokens.
- Redact personal data in examples. Use fake names/IDs or partial IDs.
- Prefer structural answers: screen names, table/export column names, workflow
  steps, statuses, and example rows with fake values.
- If the payment system has documentation, screenshots, CSV exports, or API
  schemas, summarize them and list the file/screen/API names. Do not paste secret
  values.

## Paste-To-Agent Prompt

```text
You have access to our organization's payment/billing mechanism. Please inspect
it and answer the questions below so we can scope the Cadenza finance build.

Do not disclose secrets, bank credentials, processor keys, full card numbers, or
personal data. Use redacted/fake examples. For every answer, include where you
verified it: screen name, export name, table/API name, report name, or workflow
path.

Return answers in the same section order. If something does not exist, say
"Not supported today." If behavior is unclear, say "Unknown" and describe what
would need to be checked.
```

## 1. System Boundary

1. What system or systems currently own billing, payments, receipts, and balances?
2. Which parts are manual spreadsheets, which are app screens, and which are
   payment processor/bank portals?
3. Is there a single source of truth for family balance? If yes, what is it?
4. Are historical balances migrated from an older system, or only current-year
   balances?
5. What exports can we get: charges, payments, invoices, receipts, balances,
   students, families, enrollments, refunds, deposits?

## 2. Currency Policy (D-20)

1. What currency or currencies does the organization actually use today?
2. Can one family have charges in more than one currency?
3. Can one payment be applied to charges in a different currency?
4. Are exchange rates ever recorded? If yes, where and when?
5. Are statements generated as one combined balance or one balance per currency?
6. What should Cadenza do in P0: enforce a single currency per org/family, or
   support multi-currency ledgers and statements?

## 3. Ledger Owner And Identity Matching

1. Is the balance owned by a family/household, individual student, enrollment,
   payer, or another account entity?
2. Can one family pay for multiple students?
3. Can one student have multiple paying families or split responsibility?
4. How are siblings linked for billing?
5. What identifiers are stable enough for import matching: family ID, student ID,
   email, phone, external customer ID, invoice ID?
6. Are payer contacts different from guardians? If yes, where are they stored?

## 4. Charge Lifecycle

1. How are charges created today: manually, enrollment-based, recurring tuition,
   lesson count, package, instrument rental, exam fee, concert fee, other?
2. What fields exist on a charge: description, amount, currency, due date, period,
   student, family, enrollment, program, tax/VAT, discount, notes?
3. What charge statuses exist? Example: open, partial, paid, void, cancelled,
   overdue.
4. Can charges be edited after payments are applied?
5. How are voids/cancellations handled? Are original rows retained?
6. Are recurring charges generated automatically? If yes, when and from what rule?
7. Are late fees, discounts, scholarships, or waivers separate rows or edits to a
   charge?

## 5. Payment Lifecycle

1. What payment methods are accepted: cash, bank transfer, card, check, standing
   order, Bit, PayBox, ACH, other?
2. Which methods are recorded manually and which arrive through an integration?
3. What fields exist on a payment: amount, currency, received date, method,
   reference, payer, processor transaction ID, notes, receipt number?
4. Can one payment pay multiple charges?
5. Can one charge be paid by multiple payments?
6. How are unapplied payments or account credits handled?
7. How are bounced/reversed payments handled?
8. Are receipts generated? If yes, when and by which system?

## 6. Allocation And Balance Rules

1. When a payment arrives, how is it applied to charges: oldest first, selected
   manually, invoice-specific, enrollment-specific, or left unapplied?
2. Is partial payment allowed?
3. Can payments be over the open balance? If yes, does that create credit?
4. How are adjustments represented: discount, credit, write-off, correction,
   refund, fee?
5. Are balances computed live from ledger rows, or stored as a current balance?
6. Are balance snapshots generated periodically? If yes, when?
7. What should the statement show as the running balance logic?

## 7. Invoices, Statements, Receipts, And Exports

1. Does the system issue invoices, payment requests, statements, receipts, or all
   of these?
2. What is the difference between an invoice and a charge in the current system?
3. Are invoice numbers/receipt numbers legally required or sequential?
4. Can invoices/receipts be voided or corrected? How?
5. What statement period options exist: monthly, term, school year, custom?
6. What export formats are used for accountants or bookkeepers?
7. Are PDFs stored, emailed, or regenerated on demand?

## 8. Tax, Legal, And Accounting

1. Is VAT/sales tax relevant? If yes, what rate and where is it stored?
2. Are tuition/lesson charges tax-exempt?
3. Are receipts legally required for every payment?
4. Is there a chart-of-accounts or accounting category per charge/payment?
5. Does the org export to accounting software? Which one?
6. Are there audit requirements for who created, edited, voided, or approved
   finance records?

## 9. Refunds, Deposits, And Instrument Fees

1. Are refunds recorded today? If yes, as negative payments, adjustments, or
   separate refund records?
2. Are instrument deposits collected?
3. Are deposits refundable, partially refundable, or converted into fees?
4. Are replacement/repair fees charged through the same payment system?
5. Does any deposit/refund workflow need guardian agreement/consent linkage?
6. What should be in scope for P0 versus deferred?

## 10. Permissions And Separation Of Duties

1. Who can see balances?
2. Who can create charges?
3. Who can record payments?
4. Who can void charges or payments?
5. Who can approve adjustments/write-offs/refunds?
6. Can teachers see any finance information?
7. Can families/guardians see statements or pay online today?
8. Is finance access tied to a role, a permission flag, or external system login?

## 11. Integrations And Automation

1. Is there an online payment processor? Which one?
2. Are payments imported by CSV, webhook, API, bank file, or manual entry?
3. Are processor fees recorded?
4. Are charge/payment records synced to calendar/enrollment/students?
5. Is there a webhook or callback flow for successful payments?
6. What reconciliation reports are used to match bank deposits to recorded
   payments?
7. What failure states exist: failed card, disputed payment, bounced check,
   duplicate payment, missing reference?

## 12. Migration And Data Quality

1. How many years of payment history should Cadenza import?
2. What is the minimum history needed for launch?
3. Are old balances trustworthy, or should Cadenza start from opening balances?
4. Are there duplicate families/students/payers in the existing payment data?
5. Are there negative balances or credits?
6. Are there mixed currencies in historical data?
7. What data should be imported as immutable history versus editable live ledger?

## 13. Reports Needed For P0

1. What finance reports are used weekly/monthly?
2. Required reports: open balances, overdue balances, payments received, charges
   by period, family statement, student/enrollment reconciliation, voids,
   adjustments, refunds, deposits?
3. Which reports are for admins, finance users, teachers, families, accountants?
4. What CSV/PDF exports are mandatory at launch?
5. What filters matter: family, student, program, date range, due date, status,
   payment method, collector, currency?

## 14. P0 Scope Recommendation

After answering the above, recommend the smallest safe P0 scope:

1. Which current workflow must Cadenza support first?
2. Which workflows can remain external/manual for now?
3. Which existing data must be imported before launch?
4. What should Cadenza not do in P0 because it would create finance risk?
5. What open policy decisions remain?

## Summary Output Format

End with this summary:

```text
Currency policy recommendation:
Ledger owner:
Charge creation sources:
Payment methods:
Allocation rule:
Refund/deposit P0 scope:
Required imports:
Required reports:
Roles/permissions:
Hard blockers:
Recommended P0 build:
Deferred:
```
