# Security Specification — Four Gifts Store POS (Cloud Auto-Save)

## 1. Data Invariants
1. **Strict Tenant & Owner Isolation**: Every document across `/pos_settings`, `/pos_products`, `/pos_sales`, `/pos_utang_payments`, `/pos_shifts`, `/pos_adjustments`, and `/pos_parked_carts` must have `ownerId == request.auth.uid`, and the authenticated user must have a verified email (`request.auth.token.email_verified == true`).
2. **Settings Singleton Invariant**: For `/pos_settings/{settingId}`, the document ID `settingId` must equal `request.auth.uid` as well as `incoming().ownerId == request.auth.uid`.
3. **Immutable Audit Fields**: On every update across all collections, `ownerId`, `id` (or `dayKey`), and `createdAt` must remain strictly equal to their `existing()` values, and `updatedAt` must equal `request.time`.
4. **Terminal State Locking**:
   - A `PosSale` document with `existing().status == 'VOIDED'` is in a terminal state and cannot be updated again.
5. **Bounded Line-Item Lists**: Both `PosSale.items` and `PosParkedCart.items` must be non-empty lists bounded to at most 50 line-item maps (`items.size() >= 1 && items.size() <= 50 && items[0] is map`).
6. **Zero Shadow Fields**: Every `create` and `update` must pass `isValid[Entity](incoming())` which enforces `hasAll` and `hasOnly` on the exact entity keys, and every `update` must restrict modified fields via `incoming().diff(existing()).affectedKeys().hasOnly(...)`.

---

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 — Identity Spoofing on Product Creation**:
   ```json
   {
     "collection": "pos_products",
     "id": "victim_p-1001",
     "payload": {
       "ownerId": "victim_user_uid",
       "id": "p-1001",
       "barcode": "1001",
       "name": "Spoofed Item",
       "category": "Gift",
       "costPrice": 10,
       "sellingPrice": 20,
       "stock": 50
     }
   }
   ```
2. **Payload 2 — Unverified Email Write Attempt**:
   Authenticated user with `email_verified: false` attempting to create `/pos_settings/{uid}`.
3. **Payload 3 — Shadow Field Injection ("Ghost Field") on Product Update**:
   ```json
   {
     "collection": "pos_products",
     "id": "user1_p-1001",
     "payload": {
       "isAdmin": true,
       "stock": 999
     }
   }
   ```
4. **Payload 4 — Terminal State Re-Opening on Voided Sale**:
   Updating `/pos_sales/{saleId}` where `existing().status == 'VOIDED'` back to `'COMPLETED'`.
5. **Payload 5 — Unbounded Array Exhaustion on Sale Items**:
   Creating `/pos_sales/{saleId}` with `items` containing 65 elements (`items.size() > 50`).
6. **Payload 6 — Array Element Type Poisoning on Parked Cart**:
   Creating `/pos_parked_carts/{parkedId}` where `items` is `["not-a-map"]` (`items[0]` is string instead of map).
7. **Payload 7 — Resource ID Poisoning (Path Variable Overflow)**:
   Creating `/pos_products/{productId}` where `productId` contains invalid characters (`"../../admin;drop"`).
8. **Payload 8 — Immutable `ownerId` Hijack on Update**:
   Updating `/pos_utang_payments/{paymentId}` to change `ownerId` from `user_a` to `user_b`.
9. **Payload 9 — Immutable `createdAt` Tampering on Update**:
   Updating `/pos_adjustments/{adjustmentId}` with a forged `createdAt` timestamp that differs from `existing().createdAt`.
10. **Payload 10 — Value Poisoning on Whitelisted Update Key**:
    Updating `/pos_products/{productId}` key `sellingPrice` with a string `"free"` or negative number `-500`.
11. **Payload 11 — Cross-Tenant List Scraping**:
    Running a collection `list` query on `/pos_sales` without filtering `ownerId == request.auth.uid` or reading another merchant's sales.
12. **Payload 12 — Invalid Enum Injection on Shift Status**:
    Creating `/pos_shifts/{shiftId}` with `status: "BYPASSED"` instead of `"OPEN"` or `"CLOSED"`.

---

## 3. Test Runner Reference
See `/firestore.rules.test.ts` for automated verification of the rules AST, all 7 collection match blocks, and rejection of all 12 Dirty Dozen payloads.
