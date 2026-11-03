import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');

test('Firestore Rules — All blueprint collections have hardened match blocks and default deny', () => {
  const rulesText = fs.readFileSync(rulesPath, 'utf8');
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));

  assert.ok(rulesText.includes("rules_version = '2';"), 'Must use rules_version = 2');
  assert.ok(
    rulesText.includes('match /{document=**} {\n      allow read, write: if false;\n    }'),
    'Must start with default-deny catch-all'
  );

  for (const collectionPath of Object.keys(blueprint.firestore)) {
    assert.ok(
      rulesText.includes(`match ${collectionPath}`),
      `Missing match block for ${collectionPath}`
    );
  }
});

test('Firestore Rules — Dirty Dozen Payload Guard Verification', () => {
  const rulesText = fs.readFileSync(rulesPath, 'utf8');

  // 1. Identity Spoofing Guard
  assert.ok(rulesText.includes('ownerId == request.auth.uid'), 'Must enforce ownerId == request.auth.uid');

  // 2. Email Verification Guard
  assert.ok(
    rulesText.includes('request.auth.token.email_verified == true'),
    'Must enforce email_verified == true'
  );

  // 3. Shadow Field Guard (hasAll + hasOnly + affectedKeys().hasOnly)
  assert.ok(rulesText.includes('.keys().hasAll('), 'Must enforce hasAll on keys');
  assert.ok(rulesText.includes('.keys().hasOnly('), 'Must enforce hasOnly on keys');
  assert.ok(
    rulesText.includes('incoming().diff(existing()).affectedKeys().hasOnly('),
    'Must enforce affectedKeys().hasOnly on updates'
  );

  // 4. Terminal State Locking on PosSale & Action-Based Update on PosShift
  assert.ok(
    rulesText.includes("existing().status != 'VOIDED'"),
    'Must lock updates once PosSale reaches VOIDED terminal state'
  );
  assert.ok(
    rulesText.includes("incoming().diff(existing()).affectedKeys().hasOnly(['openingFloat', 'openedAt', 'updatedAt'])"),
    'Must enforce action-based update on PosShift'
  );

  // 5 & 6. Bounded Array & First-Element Map Guard on items
  assert.ok(
    rulesText.includes('data.items is list && data.items.size() >= 1 && data.items.size() <= 50 && data.items[0] is map'),
    'Must bound items array size <= 50 and verify items[0] is map'
  );

  // 7. Path Variable Hardening (isValidId)
  assert.ok(
    rulesText.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')"),
    'Must validate path IDs with regex guard'
  );

  // 8 & 9. Immutable ownerId & createdAt and Server Timestamp updatedAt
  assert.ok(
    rulesText.includes('incoming().ownerId == existing().ownerId'),
    'Must enforce immutable ownerId on update'
  );
  assert.ok(
    rulesText.includes('incoming().createdAt == existing().createdAt'),
    'Must enforce immutable createdAt on update'
  );
  assert.ok(
    rulesText.includes('incoming().updatedAt == request.time'),
    'Must enforce server timestamp request.time on updatedAt'
  );

  // 11. Query Trust Enforcer on allow list
  const listMatches = rulesText.match(/allow list:[^\n]+/g) || [];
  assert.ok(listMatches.length === 7, 'All 7 collections must have explicit allow list rules');
  for (const line of listMatches) {
    assert.ok(
      line.includes('existing().ownerId == request.auth.uid'),
      `allow list must enforce existing().ownerId == request.auth.uid: ${line}`
    );
  }
});
