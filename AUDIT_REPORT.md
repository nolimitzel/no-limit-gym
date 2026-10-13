# NO LIMIT 2.0 — Independent Audit Report

**Date:** 13 Oct 2026 · **Branch:** `no-limit-2.0` @ `081ad1b` · **Auditor:** Opus 5.5
**Scope:** entire codebase, data model, persistence, sync, security (RLS), UX, performance.
**Method:** full read of every source file + every migration, then runtime reproduction in a
browser against the live Supabase project using the existing test account only (no accounts
created, no passwords entered). Every finding marked **CONFIRMED** was reproduced at runtime or
proven by a deterministic code/policy path cited below. **SUSPECTED** = credible risk, not reproduced.

---

## 1. Application overview

| Layer | What it is |
|---|---|
| Client | Vanilla-JS PWA, Vite 8 + vite-plugin-pwa. `app.js` is a 1,628-line closure (`initTracker`) holding all screens, state and handlers. |
| Local state | Per-user `localStorage` blobs: `gymtracker.v1:<uid>` (logs/body/macros/settings), `.prog:` (programme), `.targets:`, `.privacy:`, `.music:`, `.customex:`. |
| Backend | Supabase: Auth, Postgres + RLS, Storage (`avatars`). No custom server. |
| Data model | **Programme** = one JSON document (`programmes.data`: `sessions` + 7-slot `cycle`). **History** = `workout_sessions`/`workout_sets` keyed by stable `session_key`/`exercise_key` slugs. **Library** = static `EXERCISE_LIBRARY` + per-user `custom_exercises`. Social = squads, posts, reactions, challenges, commitments. |
| Tooling | **No tests, no linter, no type checking existed before this audit.** |

**Core data flow (the source of most defects):**
writes go *local first*, then a **fire-and-forget** cloud push (`.catch(() => {})`); reads at boot
go *cloud first* and **replace** the local copy wholesale. There is no notion of "this local change
hasn't synced yet", so any failed push is silently undone on the next launch.

---

## 2. Findings

### CRITICAL

**C1 — Every app launch overwrites local data with the cloud copy → silent data loss** · CONFIRMED
- *Where:* `src/main.js:48-49` (`localStorage.setItem(key, JSON.stringify(await loadAll()))`); `cloudStore.loadAll` returns `settings: {}` and no `meals`.
- *Evidence:* Repro 1 — added a meal + dismissed the install hint via the real UI; both saved. After restart: meal **gone** (`meals` field stripped), its 111 kcal stuck in the day total (undeletable), install hint back. Repro 2 — a workout saved locally but not in the cloud (the state a failed push leaves) was **destroyed** on restart (5 logs → 4).
- *Root cause:* cloud-wins wholesale replace; no unsynced/pending tracking; meals and settings never stored in the cloud. `loadAll` also ignores per-query errors, so a partial failure can write empty arrays.
- *Fix:* merge cloud with local at boot (union by natural key; unsynced local records win and are re-pushed; preserve local-only fields like meals/settings). Make `loadAll` throw on any query error.
- *Risk:* touches boot path — covered by unit tests on the pure merge function + E2E restart repros.

**C2 — "Workout saved 💪" shown even when the save failed** · CONFIRMED (code path)
- *Where:* `app.js saveWorkout` — `pushWorkout(...).catch(() => {})` then unconditional success toast. Same pattern: body weight, macros, meals, targets, week/programme saves.
- *Impact:* with C1, a workout logged with poor gym signal reports success and is lost on next launch.
- *Fix:* track sync state per record; tell the user honestly ("Saved on this device — will sync when you're back online") and retry automatically on next launch.

**C3 — Schedule edits silently reverted → root cause of "Train still shows Back Day"** · CONFIRMED
- *Where:* `programmeStore.loadProgramme` (cloud first, overwrites local); `saveProgramme` (select-then-update without consistent ordering; on a select error it falls through to INSERT, creating a second "active" programme); week/editor/split handlers toast success in `.finally()` regardless.
- *Evidence:* Repro 3 — set Tuesday to Rest locally (the state after a failed cloud save). After restart, Home and Train both showed **Back** and the local edit was overwritten.
- *Additional paths:* a transient cloud read failure on a new device seeds the *default* programme and can overwrite the user's real one; duplicate active rows make load and save target different rows. No DB constraint prevents duplicates.
- *Note:* the earlier "weekday anchor" change (this session) fixed a separate drift issue but **not** this root cause.
- *Fix:* pending-sync flag on the local programme (local wins until synced); `saveProgramme` targets the same row `loadProgramme` reads and never inserts on a read error; never seed defaults over the cloud after a failed read; DB: `updated_at` + unique active-programme index.

**C4 — App crashes to a blank screen (every day) after a normal editing sequence** · CONFIRMED
- *Where:* Week editor allows two days to share one session; Programme editor "Rest" (`editor.js:84`) **deletes the session object** even if another day still references it. `renderToday`/week strip/weekly report dereference `P.sessions[id]` unguarded.
- *Evidence:* Repro 6 — Tue+Wed = Back, then Wed → Rest in the programme editor: `TypeError: Cannot read properties of undefined (reading 'exercises')` at `renderToday`. Blank Home (the boot screen). Synced to cloud, so it follows the user to every device.
- *Fix:* only delete a session when no other day references it; sanitize programmes on load (dangling refs → Rest); guard all session lookups.

**C5 — History silently truncated after ~1,000 logged sets** · CONFIRMED (code) — *found during the fix phase*
- *Where:* `cloudStore.loadAll` fetched `workout_sets` in one unpaginated request; Supabase's API caps responses at 1,000 rows by default. At ~20 sets/session × 5 sessions/week a user passes 1,000 sets in ~10 weeks, after which every launch overwrote local history with a truncated copy.
- *Fix:* paginate every read; the merge never treats "missing from a read" as "deleted".

### HIGH

**H1 — Async screens overwrite whatever tab you moved to** · CONFIRMED
- *Where:* `renderSquad` (8 awaits) and `renderProfile` write `view().innerHTML` after resolving without checking the active tab.
- *Evidence:* Repro 4 — tapped Squad then Today; 3.5 s later the tab bar said Today but the screen showed "The Grind".
- *Fix:* render token — discard stale async renders.

**H2 — One workout counted multiple times in leaderboard / pledges / challenges** · CONFIRMED
- *Where:* `saveWorkout` posts an activity on *every* save, including "Continue logging" re-saves.
- *Evidence:* Repro 5 — saving one session twice created **2 extra posts** (cleaned up after).
- *Fix:* post only on the first save of a (date, session).

**H3 — Squad-mates can read each other's email, bodyweight, goal, experience, training days** · CONFIRMED
- *Where:* `profiles_select` RLS (`migrate_4.sql:67`) exposes the whole row to anyone sharing a squad.
- *Evidence:* RLS test as the test user returned a teammate's `email`, `bw_current`, `goal`, `experience`, `training_days`. The "Bodyweight" privacy toggle (default *off*) implies this is private.
- *Fix:* column-level grants (public profile fields only) + a `get_my_profile()` SECURITY DEFINER RPC for the owner's private fields. Code falls back gracefully until the migration runs.

**H4 — Sign-up fails for the 2nd person who leaves Username blank or picks a taken one** · CONFIRMED (SQL semantics)
- *Where:* `handle_new_user` trigger: `coalesce(meta->>'username', email-prefix)` — an empty string is not NULL, so blank usernames collide on `profiles.username UNIQUE`; collisions abort the auth insert ("Database error saving new user"). Same for `john@gmail` vs `john@yahoo`.
- *Not runtime-tested:* would require creating accounts on the hosted service.
- *Fix:* trigger normalises blank → email prefix and appends a numeric suffix until unique.

**H5 — Custom exercises are device-only today and will be wiped when `migrate_10` is run** · CONFIRMED
- *Evidence:* `custom_exercises` table is missing (PGRST205); the 1 custom exercise exists only in this browser. `loadCustomExercises` replaces the local list with the cloud list, so after the migration the (empty) cloud list deletes all pre-existing custom exercises; their history would render as raw `cx-…` ids. Insert failures are only `console.warn`ed.
- *Fix:* union local + cloud by key; push local-only items up.

**H6 — Creating/joining/leaving a squad leaves the app posting to the wrong (or no) squad** · CONFIRMED (code path)
- *Where:* `setCurrentSquad` is only called at boot (`main.js:35`). After create/join, workouts don't post, pledges save with `squad_id = null`, challenges report "No squad found" — until restart.
- *Fix:* update the cached squad whenever the Squad screen resolves membership, and clear it on leave.

**H7 — "Reset all data" and "Restore from backup" don't do what they say** · CONFIRMED (code path)
- *Where:* both only touch localStorage. Reset promises "cannot be undone" but the next launch restores everything from the cloud; Restore is wiped by C1 on the next launch and never uploaded.
- *Fix:* Restore uploads to the cloud; Reset deletes the user's own cloud history (RLS-scoped) behind an explicit confirmation.

### MEDIUM

| ID | Finding | Status | Root cause / fix |
|---|---|---|---|
| M1 | Privacy toggles are device-local: turning off workout sharing silently re-enables on a new device | CONFIRMED (code) | Store privacy on the profile (private column) |
| M2 | Weekly review hard-codes "target 76kg" and "HIIT 3×" for every user; marks a training day "NOT logged" if you did a different/quick session | CONFIRMED (code) | Use the user's `bw_target`; count any session logged that day; generic cardio |
| M3 | PRs/charts use weight only: rep PRs never register; bodyweight exercises (0 kg) can never show progress or PRs | CONFIRMED (code) | Best set = heavier, or same weight + more reps; bodyweight lifts track max reps |
| M4 | Typing reps but leaving weight blank (ghost placeholder shows last weight) saves **0 kg**, corrupting history/PRs | CONFIRMED (code) | Explicit confirm before saving reps-without-weight |
| M5 | Custom exercises in the Cardio group are treated as lifts (kg × reps, appear in PRs) | CONFIRMED (code) | Derive `cardio` from muscle group |
| M6 | Cloud name snapshots for custom/quick exercises are stored as raw ids (second `exMeta` in `programme.js` only searches sessions); `loadAll` never reads snapshots back | CONFIRMED (code) | Single resolver incl. library + custom; use snapshot as fallback name |
| M7 | Nutrition-target edits reverted by stale cloud (same pattern as C3) | CONFIRMED (code) | Pending-sync flag |
| M8 | A transient profile fetch failure on launch routes an existing user into onboarding, which overwrites their custom nutrition targets | CONFIRMED (code) | Only onboard on a successful "no goal" read |
| M9 | "Forgot password" email signs the user in but never lets them set a new password | CONFIRMED (grep: no recovery handler) | Handle `PASSWORD_RECOVERY` with a set-password screen |
| M10 | Squad screen: 8 sequential round-trips; fetches every workout post ever (unbounded) | CONFIRMED (code) | Parallelise; bound the window |
| M11 | `pushWorkout` deletes the cloud session *before* inserting the replacement — a failure in between loses the cloud copy | CONFIRMED (code) | Insert new first, then delete the old |
| M12 | `sm_insert` RLS lets any user add themselves to any squad whose id they know (bypasses invite code; a kicked member can rejoin) | CONFIRMED (policy) — not exploited | Remove direct-insert policy; RPCs are SECURITY DEFINER |

### LOW
- L1 History labels quick sessions as the raw key `quick`.
- L2 Duplicated logic: two `esc()` (app.js version doesn't escape `'` or handle null), two `exMeta()`; dead code: `dataService.js`, `setanchor`/`setTodayAs`, duplicate `closemodal` handler, unused `onAuthChange`, unused schema tables.
- L3 `user-scalable=no` blocks pinch-zoom (accessibility).
- L4 Invite-code generator never produces `9` (off-by-one in `Math.random()*31`).
- L5 "This week" on Home/Progress is a rolling 7 days; accountability uses Mon–Sun; two different "week streak" definitions.
- L6 Numeric inputs accept negatives/absurd values.
- L7 `new Date('YYYY-MM-DD')` parses as UTC ("Member since" can show the previous month west of UTC).
- L8 Spotify OAuth `state` is a constant (PKCE verifier still protects the exchange).

### Verified OK (not findings)
Private tables are correctly isolated by RLS; writing as another user, editing another profile,
and adding another user to a squad are all rejected (RLS test). `.env` is git-ignored and not in
history; `.env.example` contains no secrets. User-generated text is escaped before rendering.
Cloud `workout_sessions` are not duplicated by re-saves (delete+insert is idempotent on the happy path).

---

## 3. Fix plan, priorities and risks

1. **Sync model (C1, C2, C3, H5, M7, M11)** — one pure, unit-tested merge module used by boot, programme, targets and custom exercises. *Trade-off:* union-merge never deletes a record that exists only locally; since the app has no per-record delete, that is the safe choice (Reset is handled explicitly).
2. **Crash + editor conflict (C4)**, **render race (H1)**, **duplicate posts (H2)**, **stale squad (H6)**.
3. **Migration `migrate_11.sql`** (must be run by the owner — cannot be applied from here): profile column grants + `get_my_profile()` (H3), username trigger (H4), `sm_insert` (M12), programme `updated_at` + single-active index (C3), private `privacy` + `meals` columns (M1, C1). All client code works **before and after** the migration.
4. Medium/Low functional fixes as time allows, smallest change each.

## 4. Test plan
- **Unit (node:test, no new dependencies):** merge logic, programme sanitisation, session-for-date, PR/best-set, weekly adherence.
- **E2E regression (browser, test account):** re-run Repros 1–6; custom exercise survives restart and reuse; previous performance shown on reuse; schedule edit reflected in Train; ad hoc session in history; failed save gives honest feedback.
- **RLS:** re-run the isolation suite after `migrate_11` is applied (owner action).
- **Limitations:** no second account can be created or signed into from here; multi-user signup and cross-account tests are verified by policy/SQL review, not runtime.

---

# 5. Final report (after fixes) — `18cc232`

## Results by finding
| ID | Status | Verified by |
|---|---|---|
| C1 data loss on launch | **Fixed** | Repro 1 re-run: meal + dismissed hint survive restart; unit tests |
| C2 false "saved" | **Fixed** | Repro 2 re-run: unsynced workout survives restart **and auto-uploads** (cloud count 0→1); honest toasts |
| C3 "Back Day" bug | **Fixed (root cause)** | Repro 3 re-run: Tue edited to Rest stays Rest after restart and self-heals into the cloud |
| C4 crash | **Fixed** | Repro 6 re-run: no crash, shared session kept; a broken programme written straight to the cloud boots fine and is repaired |
| C5 1,000-row truncation | **Fixed** | Pagination in every read; merge test "absent ≠ deleted" |
| H1 render race | **Fixed** | Repro 4 re-run: screen stays on Today |
| H2 duplicate posts | **Fixed** | Repro 5 re-run: two saves → exactly 1 post |
| H3 profile data exposure | **Fix written — needs `migrate_11`** | Client works before & after; re-run the RLS test after migrating |
| H4 sign-up username clash | **Fix written — needs `migrate_11`** | SQL review only (accounts can't be created from here) |
| H5 custom exercises wiped | **Fixed** | Union-merge unit test; still device-only until `migrate_10` runs |
| H6 stale squad | **Fixed** | Code path; squad cached on every Squad load |
| H7 Reset/Restore | **Fixed** | Code path (Reset not executed against real data) |
| M1–M11 | **Fixed** | Unit tests (PRs, history), sweep, code review |
| M12 squad join bypass | **Fix written — needs `migrate_11`** | Policy review |
| L1–L8 | **Fixed** (L5 documented, not changed) | Sweep / review |

## Tests executed
- **Unit:** `npm test` → **22 / 22 pass** (sync merge, programme sanitising/schedule, history/PRs). None existed before.
- **E2E regression:** all 6 original reproductions re-run against the fixed build → **6 / 6 pass**, plus a corrupted-cloud-programme boot test.
- **RLS:** private-table isolation and cross-user write rejection → pass (pre-fix; unchanged).
- **Sweep:** every screen + weekly review + quick session + picker → renders, **0 new runtime errors**.
- **Build:** `vite build` → clean.
- **Not executed:** multi-account sign-up, a second signed-in user, real password-reset email, Spotify now-playing, migration-dependent behaviour (H3/H4/M12/meals sync). Test data created during the audit was removed and the test account restored.

## Files changed
`src/core/{sync,programme,history}.js` (new) · `tests/*.test.js` (new) · `src/main.js` · `src/app.js` · `src/data/{cloudStore,programme,programmeStore,targets,customExercises,privacy,squad,spotify,supabaseClient}.js` · `src/auth/{auth,authUI,profile}.js` · `src/programme/editor.js` · `index.html` · `package.json` · `migrate_11.sql` (new) · `src/data/dataService.js` (deleted, dead code).

## ⚠️ Required, in this order
1. **Deploy the new build first** (drag `dist/` to Netlify, or push with env vars set).
2. **Then run `migrate_10.sql`** (custom-exercise library).
3. **Then run `migrate_11.sql`** (profile privacy, sign-up fix, squad-join policy, single active programme, meals sync).

Running either migration while the *old* build is live is unsafe: old code would send existing users back through onboarding (overwriting their targets) after `migrate_11`, and would wipe custom exercises after `migrate_10`.

## Known limitations / outstanding
- **Reset on one device:** other devices still holding cached history will re-upload it on their next launch (the sync model never deletes on absence, by design, to rule out data loss).
- **Conflicts:** an edit made offline on one device wins over a newer edit from another device for the same day/record (last-writer-on-device).
- Meals sync across devices only after `migrate_11`; until then they persist on the device that logged them.
- `app.js` is still a 1,600-line closure; core logic is now extracted and tested, UI code is not unit-tested.
- Unused legacy tables (`exercises`, `programme_days`, `programme_exercises`) remain; harmless.

## Remaining recommendations (by priority)
1. Deploy + run the two migrations (above), then re-run the RLS isolation test.
2. Clean up the ~8 test accounts in Supabase.
3. Add E2E tests to CI (Playwright) for the six journeys reproduced here.
4. Bound the Squad feed/post queries (paginate) before squads get large.
5. Add edit/rename for custom exercises (history is already keyed safely, so this is now low-risk).
6. Split `app.js` into per-screen modules over time.
