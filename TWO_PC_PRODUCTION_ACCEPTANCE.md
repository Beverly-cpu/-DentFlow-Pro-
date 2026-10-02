# DentFlow two-PC production acceptance

Run this only with non-patient test data against the production-like HTTPS API and private S3 configuration. Record the case ID, clinic IDs, batch IDs and timestamps in the acceptance evidence. Do not place passwords, tokens, signatures from real patients, or AWS credentials in this document.

## Gate 0 — infrastructure

- [ ] PC-A and PC-B use the same `https://` DENTFLOW_SERVER_URL.
- [ ] `scripts/production-preflight.sh` passes on the API runtime.
- [ ] `scripts/s3-private-smoke-test.sh` passes.
- [ ] `scripts/api-production-smoke-test.sh` passes.
- [ ] Both Electron clients are in central/remote mode, not local SQLite business mode.

Stop acceptance if any gate fails.

## Test identities and stock

Use two clinics when available: Clinic-1 and Clinic-2. Use Assistant-A/Admin-A on PC-A, assigned Doctor-B on PC-B, and Doctor-C for negative authorization checks.

Stage two batches with the same specification/REF but different LOT values:

- Batch A: REF TEST-REF-01 / LOT LOT-A
- Batch B: REF TEST-REF-01 / LOT LOT-B

Record opening on-hand quantities before testing.

## A — login, session and clinic isolation

- [ ] PC-A signs in and selects Clinic-1.
- [ ] PC-B signs in as Doctor-B and selects Clinic-1.
- [ ] Logging out PC-A does not log out PC-B.
- [ ] An account authorized for both clinics switches Clinic-1 -> Clinic-2 -> Clinic-1 without re-login.
- [ ] Clinic-1-only account cannot read Clinic-2 patients, implant cases, inventory or clinical assets.
- [ ] Doctor-C cannot read Doctor-B-only implant case when doctor ownership applies.

Evidence: screenshots of current clinic/role and denied access response. PASS requires server-side denial, not only hidden UI.

## B — cross-PC case/version protection

- [ ] PC-A creates test patient/case and assigns Doctor-B.
- [ ] PC-B refreshes and sees the same central case.
- [ ] Record case version N on both PCs.
- [ ] PC-A performs one valid mutation.
- [ ] Without refreshing, PC-B attempts a stale mutation from version N.
- [ ] PC-B receives version conflict; PC-A data is not overwritten.

## C — explicit REF/LOT reservation

- [ ] PC-A opens ordering for the case.
- [ ] Both LOT-A and LOT-B are separately selectable for the same specification/REF.
- [ ] Reserve LOT-A.
- [ ] LOT-B is not silently substituted or reserved.
- [ ] Reservation does not decrement on-hand stock.
- [ ] Pre-pick cancellation releases the reservation exactly once.

## D — confirmed pick and immutable cost

- [ ] Reserve again and confirm pick item-by-item.
- [ ] Pick screen displays exact REF, LOT and quantity.
- [ ] On-hand decreases exactly once at confirmed pick.
- [ ] Retry/reload does not decrement a second time.
- [ ] Case detail displays the server-captured picked historical unit cost.
- [ ] Assigned Doctor-B can see implant/kit/healing consumable picked cost.
- [ ] Doctor-B is not given inventory opening/reconciliation accounting cost access.

## E — picked cancellation before surgery

- [ ] With case status 已取出待手術, choose pre-surgery cancellation.
- [ ] UI requires every picked REF/LOT checkbox.
- [ ] UI requires cancellation reason.
- [ ] Missing one item prevents submission.
- [ ] Full confirmation atomically changes case to cancelled and restores each picked quantity exactly once.
- [ ] Retry does not restock twice.
- [ ] Audit identifies actor, reason and returned items.

## F — surgery, usage and partial return

Use a new test case and pick its stock.

- [ ] Mark surgery complete; no additional inventory decrement occurs.
- [ ] Classify every picked reservation's actual usage.
- [ ] Instrument remains fully returnable; unused sealed consumables become expected returns.
- [ ] Perform a partial return smaller than outstanding quantity.
- [ ] Only that quantity is restored to on-hand.
- [ ] Remaining outstanding quantity stays visible.
- [ ] Return the remainder; total restored quantity equals confirmed returns only.
- [ ] Duplicate/retry does not restock twice.

## G — REF/LOT photo and private storage

- [ ] Upload required REF/LOT photo for each used non-instrument reservation.
- [ ] Upload required instrument photo for each instrument plan item.
- [ ] Client rejects PNG/JPEG files above 10 MB.
- [ ] API reports uploaded only after private storage read-back verification.
- [ ] Usage record renders each REF/LOT photo next to its matching REF/LOT.
- [ ] Doctor signature is rendered in the same clinical-proof section after signing.
- [ ] Doctor-B can read authorized assets through the API.
- [ ] Doctor-C/other-clinic account is denied.
- [ ] Anonymous S3 GetObject is denied; no public S3 URL is used by Electron.

## H — doctor signature and closure

Use the physical signature pad planned for production.

- [ ] Empty signature cannot be submitted.
- [ ] Test short stroke, long stroke, curves, fast/slow signing, clear and re-sign.
- [ ] No pointer offset, scaling error, missing strokes or stale cleared ink.
- [ ] Assistant/Admin cannot submit doctor_signature.
- [ ] Doctor-C cannot sign Doctor-B's case.
- [ ] Assigned Doctor-B signs only after required usage/returns/photos are complete.
- [ ] Signature is bound to the current case version.
- [ ] Mutating the case after signing prevents old signature from authorizing a later version.
- [ ] Missing photo, usage, return or valid signature prevents formal close.
- [ ] Formal close creates immutable closure snapshot and status 已結案.
- [ ] Closed case rejects further clinical mutation.

## I — uncertain-network recovery

For each mutation below, interrupt connectivity after submit at least once. The exact moment may vary; the required invariant is that an unresolved local journal is recovered with the same requestId/payload/version.

- [ ] Order/reservation: restart Electron, restore network, recover; no duplicate reservation.
- [ ] Confirmed pick: recover; inventory decrements once.
- [ ] Surgery complete: recover; state transition occurs once.
- [ ] Usage classification: recover; usage event occurs once.
- [ ] Partial/full return: recover; inventory restocks once.
- [ ] Picked cancellation: recover; cancellation/restock occurs once.
- [ ] Clinical photo: recover exact encrypted pending request; no duplicate asset mutation.
- [ ] Doctor signature: recover exact encrypted pending request.
- [ ] Formal close: recover exact encrypted pending request; one closure only.
- [ ] While a pending encrypted mutation exists, UI does not allow a different request to overwrite it.
- [ ] Deterministic 400/403/404/409 failures do not leave a permanently blocked pending journal.

## J — simultaneous reconnect

- [ ] Open the same case on both PCs, then disconnect both.
- [ ] Reconnect both.
- [ ] PC-A submits a valid mutation first.
- [ ] PC-B submits its stale mutation.
- [ ] PC-A succeeds; PC-B receives version conflict.
- [ ] No last-write-wins overwrite, duplicate inventory event, duplicate return, duplicate signature or duplicate closure exists.

## Release decision

Production acceptance is PASS only when every applicable checkbox above passes and evidence is retained. Any failure involving authorization, duplicate decrement/restock, stale-version overwrite, public asset access, wrong REF/LOT, signature ownership, closure prerequisites or same-request recovery is release-blocking.

Record:

- API build/commit:
- Electron build/commit:
- Clinic-1 / Clinic-2 test IDs:
- Test case IDs:
- PC-A operator:
- PC-B doctor:
- Signature pad model:
- Started:
- Completed:
- Reviewer:
- Final result: PASS / FAIL
