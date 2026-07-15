# Plan 006: Make backup restore atomic and stop it from silently wiping chores

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 310da15..HEAD -- server/src/routes/backup.ts server/src/services/users.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `310da15`, 2026-07-15

## Why this matters

`POST /api/backup/restore` applies settings and users in two **separate**
transactions, and `replaceAllUsers` does `DELETE FROM users` then re-inserts.
Two concrete failures follow on a family's real device:

1. **Partial restore**: if a user insert fails (constraint/FK), settings are
   already committed but users are not — the panel is left half-restored with
   no rollback.
2. **Silent chore wipe**: `chores.user_id` and `reward_redemptions.user_id`
   are `ON DELETE CASCADE` on `users`. Restoring a backup onto a house whose
   user IDs differ from the backup's deletes **all chores, chore completions,
   and reward redemptions** as a side effect of the user delete — data the
   backup never even contained, gone without warning.

This is a config-restore action a non-technical family member runs after an
SD-card reimage; it should never destroy the chore chart or leave a
half-applied state.

## Current state

- `server/src/routes/backup.ts:28-33` — the restore route:

  ```ts
  backupRouter.post('/restore', (req, res) => {
    const backup = BackupSchema.parse(req.body);
    patchSettings(backup.settings);      // transaction #1
    replaceAllUsers(backup.users);       // transaction #2 (DELETE + re-insert)
    res.json({ ok: true, restoredUsers: backup.users.length });
  });
  ```

- `server/src/services/users.ts:87-98` — `replaceAllUsers`:

  ```ts
  export function replaceAllUsers(users: User[]): void {
    const db = getDb();
    const insert = db.prepare('INSERT INTO users (id, name, color, avatar, is_admin, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    db.transaction(() => {
      db.prepare('DELETE FROM users').run();
      for (const u of users) insert.run(u.id, u.name, u.color, u.avatar, u.isAdmin ? 1 : 0, u.sortOrder);
    })();
  }
  ```

- `server/src/services/settings.ts:31-43` — `patchSettings` is itself a
  transaction (upsert per key). It can be called *inside* an outer
  transaction safely (better-sqlite3 does not support nested `BEGIN`, but a
  `db.transaction()` invoked while already inside a transaction runs as a
  **savepoint** — verified behavior of better-sqlite3; calling
  `patchSettings` from within an outer `db.transaction` works).
- Schema cascades that make the wipe possible
  (`server/src/db/migrate.ts`): `chores.user_id ... ON DELETE CASCADE`
  (line 78), `reward_redemptions.user_id ... ON DELETE CASCADE` (line 97),
  `task_completions`/`chore_completions` cascade off their parent tables.
  `chore_completions.user_id` is a plain column (no FK), so completions
  vanish via the `chores` cascade, not directly.
- Existing test: `server/src/phase1.test.ts:113-134` restores into a *fresh*
  DB, so it never exercises the cascade-on-existing-data path. Keep it
  passing; add the missing cases.

## Design decision baked into this plan

The safe, minimal fix is: **(a)** run the whole restore in one transaction so
it is all-or-nothing, and **(b)** replace users by **upsert keyed on `id`**
instead of delete-all, and delete only the users that are truly absent from
the backup — so a user whose ID is unchanged is never deleted, and its
cascaded chores/rewards survive. Users present in the backup but with new IDs
still replace old ones; genuinely-removed users are deleted (and their
cascade fires, which is correct — that user is gone on purpose).

This preserves the documented "config restore" intent while eliminating the
incidental data loss for the common case (restoring onto the same house).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` (repo root) | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Server tests | `npm test --workspace server` | all pass |
| All tests | `npm test` | all pass |

If server tests fail at import with `NODE_MODULE_VERSION ...
better_sqlite3.node`, run `npm rebuild better-sqlite3` once (Node 20/22).

## Repo conventions that apply

- TS strict, ESM, `.js` import suffixes on the server.
- `db.transaction(() => { ... })()` is the transaction idiom (see
  `settings.ts`, `users.ts`, `lists.ts`).
- `getDb()` returns the singleton better-sqlite3 handle; `foreign_keys` is
  ON (`openDb`/`openTestDb` set `PRAGMA foreign_keys = ON`).
- Tests: supertest integration + `openTestDb`/`closeDb`; pattern in
  `phase1.test.ts`.

## Scope

**In scope**:

- `server/src/services/users.ts` (add an upsert-based replace; keep or
  deprecate `replaceAllUsers` — see Step 1)
- `server/src/routes/backup.ts` (wrap restore in one transaction)
- `server/src/phase1.test.ts` OR a new `server/src/backup.restore.test.ts`
  (create the new file to keep the change isolated)

**Out of scope**:

- Growing the backup payload beyond settings + users (that is a separate
  design item — DIR-01 in `plans/README.md` backlog; do NOT expand the
  schema here).
- Changing the schema cascades in `migrate.ts` — the fix is at the
  application layer; migrations are append-only.
- `BackupSchema` in `shared/` — unchanged.

## Git workflow

- Branch: `advisor/006-atomic-restore`
- Commit style: short imperative summary (match `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add an id-preserving `restoreUsers` to `users.ts`

Add a new exported function (leave `replaceAllUsers` in place for now unless
`grep -rn "replaceAllUsers" server/src` shows the only caller is
`backup.ts`; if so, you may replace it — check first):

```ts
export function restoreUsers(users: User[]): void {
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO users (id, name, color, avatar, is_admin, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, color = excluded.color, avatar = excluded.avatar,
       is_admin = excluded.is_admin, sort_order = excluded.sort_order`,
  );
  db.transaction(() => {
    const keep = new Set(users.map((u) => u.id));
    const existing = db.prepare('SELECT id FROM users').all() as { id: string }[];
    for (const row of existing) {
      if (!keep.has(row.id)) db.prepare('DELETE FROM users WHERE id = ?').run(row.id);
    }
    for (const u of users) {
      upsert.run(u.id, u.name, u.color, u.avatar, u.isAdmin ? 1 : 0, u.sortOrder);
    }
  })();
}
```

Users whose IDs match are updated in place (no delete → no cascade). Only
users absent from the backup are deleted (their cascade is intentional).

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Make the restore route atomic

In `server/src/routes/backup.ts`, wrap both writes in one transaction and use
`restoreUsers`:

```ts
import { getDb } from '../db/index.js';
import { restoreUsers } from '../services/users.js';
...
backupRouter.post('/restore', (req, res) => {
  const backup = BackupSchema.parse(req.body);
  getDb().transaction(() => {
    patchSettings(backup.settings);   // runs as a savepoint inside this txn
    restoreUsers(backup.users);
  })();
  res.json({ ok: true, restoredUsers: backup.users.length });
});
```

If any write throws, the whole transaction rolls back — no partial restore.
(`BackupSchema.parse` stays outside the transaction so a malformed body still
returns 400 before any DB work.)

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Tests

Create `server/src/backup.restore.test.ts` (supertest + in-memory DB). Cases:

1. **Restore onto same-ID users preserves chores**: create a user U via
   `POST /api/users`; create a chore for U via `POST /api/chores`
   (inspect `server/src/routes/chores.ts` / `ChoreCreateSchema` for the exact
   body — needs `userId`, `title`, `schedule`, and an `anchorKey`/date field;
   read the schema to get it right). `GET /api/backup`. Then `POST
   /api/backup/restore` with that backup. Assert `GET /api/chores` still
   returns the chore (it must NOT have been cascade-deleted).
2. **Restore with a removed user deletes that user and its chores**: two
   users A, B, each with a chore. Take a backup, then delete B locally isn't
   needed — instead restore a *modified* backup whose `users` array omits B.
   Assert B is gone and B's chore is gone, while A and A's chore remain.
3. **Atomicity**: force the users portion to fail mid-restore and assert
   settings were NOT applied. Simplest deterministic trigger: craft a restore
   body that passes `BackupSchema` but whose users array contains a duplicate
   `id` (two objects, same UUID) — the second `upsert` on a duplicate within
   one transaction still succeeds (ON CONFLICT), so that won't fail. Instead,
   induce failure by mocking `restoreUsers` to throw (`vi.spyOn` the users
   module) OR by including a user object that violates a NOT NULL/STRICT
   column after schema parse — **if neither is clean, assert atomicity at the
   unit level**: call the route's transaction body directly with a throwing
   `restoreUsers` spy and assert settings are unchanged afterward. Pick the
   approach that the test harness supports cleanly; document which in a
   comment.
4. **Fresh-DB restore still works** (regression): mirror the existing
   `phase1.test.ts` round-trip — restore into a freshly `openTestDb()`'d DB,
   assert settings + users land. (If you keep this assertion in
   `phase1.test.ts`, don't duplicate it.)

**Verify**: `npm test --workspace server` → all pass, including new cases;
the existing `phase1.test.ts` backup round-trip still passes.

### Step 4: Full verification

**Verify**: `npm run typecheck` → exit 0. `npm test` → all workspaces pass.

## Test plan

Step 3 (4 cases, the first two being the data-loss regressions this plan
fixes). Pattern: `server/src/phase1.test.ts` (backup describe block) plus
`server/src/phase3.test.ts` for chore-creation request shape.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0; `npm test` exits 0
- [ ] `grep -n "getDb().transaction" server/src/routes/backup.ts` → present (single-transaction restore)
- [ ] `grep -n "restoreUsers" server/src/services/users.ts server/src/routes/backup.ts` → present in both
- [ ] A test proves a chore survives a restore of same-ID users
- [ ] `git status --porcelain` shows only in-scope files (plus `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- better-sqlite3 rejects the nested `db.transaction` (savepoint) call with
  `patchSettings` inside — if so, inline settings upserts into the outer
  transaction instead of calling `patchSettings`, and report the change.
- The chore-creation request shape can't be determined from
  `ChoreCreateSchema` / `routes/chores.ts` — read them; if still unclear,
  STOP rather than guessing the body.
- Removing `replaceAllUsers` breaks another caller (`grep` first).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Deferred (DIR-01)**: the backup payload still contains only settings +
  users. Growing it to tasks/chores/lists/meals/announcements/calendar-sources
  is a larger design item (restore semantics per domain, FK ordering) tracked
  in `plans/README.md` backlog — do NOT bundle it here.
- If backup coverage is later expanded, the single-transaction wrapper from
  Step 2 is the right insertion point (add each domain's restore inside it,
  ordered parents-before-children for FKs).
- Reviewer focus: that same-ID restore never fires a cascade, that a
  genuinely-removed user IS deleted, and that a mid-restore failure leaves the
  DB unchanged.
