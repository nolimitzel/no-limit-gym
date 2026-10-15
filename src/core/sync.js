/* Pure local⇄cloud merge logic (no I/O, unit-tested in tests/sync.test.js).

   Model: every local record carries `synced`:
     true      — last known to match the cloud
     false     — changed on this device, not yet confirmed by the cloud (pending)
     undefined — legacy record from before sync tracking existed
   Rules:
     • cloud is authoritative for records this device already synced
     • a local record missing from the cloud is KEPT and re-pushed — absence is
       never treated as deletion, because a partial/truncated read must not be
       able to destroy history (the app has no per-record delete)
     • pending records always win and are queued for re-push (never lost)
     • legacy records equal to their cloud copy become synced; otherwise pending
     • fields the cloud doesn't store (e.g. meals) are preserved from local */

export function mergeRecords(local = [], cloud = [], keyOf, { same = () => false, preserve = [] } = {}) {
  const merged = new Map();
  for (const c of cloud) merged.set(keyOf(c), { ...c, synced: true });
  const pending = [];
  for (const l of local) {
    const k = keyOf(l);
    const c = merged.get(k);
    const legacyInSync = l.synced === undefined && c && same(l, c);
    if (c && (l.synced === true || legacyInSync)) {
      for (const f of preserve) if (c[f] === undefined && l[f] !== undefined) c[f] = l[f];
      continue;
    }
    merged.set(k, { ...(c || {}), ...l, synced: false });  // local change wins
    pending.push(k);
  }
  return { records: [...merged.values()], pending };
}

// canonical form of a log's entries so key order / number types don't matter
function canonEntries(entries = {}) {
  return JSON.stringify(Object.keys(entries).sort().map(k =>
    [k, (entries[k] || []).map(s => [Number(s.w) || 0, Number(s.r) || 0])]));
}
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
const MACROS = ["kcal", "protein", "carbs", "fats"];

export const logKey = (l) => l.date + "|" + l.session;

export function mergeDB(local = {}, cloud = {}) {
  // workout state the cloud doesn't store (finished / posted / timing) stays from this device
  const logs = mergeRecords(local.logs, cloud.logs, logKey,
    { same: (a, b) => canonEntries(a.entries) === canonEntries(b.entries), preserve: ["done", "posted", "startedAt", "finishedAt"] });
  const body = mergeRecords(local.body, cloud.body, (b) => b.date,
    { same: (a, b) => Number(a.weight) === Number(b.weight) });
  const macros = mergeRecords(local.macros, cloud.macros, (m) => m.date, {
    same: (a, b) => MACROS.every(k => (Number(a[k]) || 0) === (Number(b[k]) || 0)),
    preserve: ["meals"],
  });
  return {
    logs: logs.records.sort(byDate),
    body: body.records.sort(byDate),
    macros: macros.records.sort(byDate),
    names: { ...(local.names || {}), ...(cloud.names || {}) },   // exercise name snapshots
    settings: { ...(local.settings || {}) },                       // device settings never live in the cloud
  };
}

// Custom-exercise library: union by key; local-only items are pending upload.
export function mergeCustom(local = [], cloud = []) {
  return mergeRecords(local, cloud, (c) => c.key,
    { same: (a, b) => a.name === b.name && a.group === b.group });
}
