/* Pure workout-history queries (no I/O, unit-tested in tests/history.test.js).
   History = logs: [{ date:'YYYY-MM-DD', session, entries: { exerciseKey: [{w, r}] } }]
   Everything is keyed by the exercise's stable key, so it works across any
   schedule, session or week — the routine can change, the lift's history doesn't. */

const num = (v) => Number(v) || 0;

// heavier set wins; at equal weight, more reps wins (a rep PR is still a PR)
export function betterSet(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  if (num(b.w) !== num(a.w)) return num(b.w) > num(a.w) ? b : a;
  return num(b.r) > num(a.r) ? b : a;
}
export function bestSet(sets = []) {
  return sets.reduce((m, s) => betterSet(m, s), null);
}

// all-time best set for an exercise (bodyweight sets count via reps)
export function prFor(logs, exId, beforeDate) {
  let best = null;
  for (const l of logs) {
    if (beforeDate && !(l.date < beforeDate)) continue;
    for (const s of (l.entries && l.entries[exId]) || []) {
      if (num(s.w) > 0 || num(s.r) > 0) best = betterSet(best, s);
    }
  }
  return best;
}

// most recent session's sets for an exercise, strictly before a date (any session)
export function lastSetsFor(logs, exId, beforeDate) {
  let best = null;
  for (const l of logs) {
    const sets = l.entries && l.entries[exId];
    if (!sets || !sets.length) continue;
    if (beforeDate && !(l.date < beforeDate)) continue;
    if (!best || l.date > best.date) best = { date: l.date, sets };
  }
  return best;
}

// per-session top set + volume, oldest → newest (for charts)
export function allSetsFor(logs, exId) {
  return logs
    .filter((l) => l.entries && l.entries[exId] && l.entries[exId].length)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((l) => ({
      date: l.date,
      top: bestSet(l.entries[exId]),
      vol: l.entries[exId].reduce((t, s) => t + num(s.w) * num(s.r), 0),
    }));
}

// every occurrence of an exercise, newest first — the per-exercise history page
export function exerciseSessions(logs, exId) {
  return logs
    .filter((l) => l.entries && l.entries[exId] && l.entries[exId].length)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((l) => ({ date: l.date, session: l.session, sets: l.entries[exId], best: bestSet(l.entries[exId]) }));
}

// whole days between two local 'YYYY-MM-DD' dates (b - a)
export function daysBetween(a, b) {
  const p = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86400000);
}

/* Suggested rest between sets, from the exercise's rep target: heavy, low-rep
   work (bottom of range ≤ 6) needs ~3 min, moderate (≤ 10) ~2 min, high-rep
   isolation 90 s. Matches the plan's training rules. */
export function restSecondsFor(reps) {
  const low = parseInt(String(reps || "").match(/\d+/)?.[0] || "", 10);
  if (!low) return 90;
  return low <= 6 ? 180 : low <= 10 ? 120 : 90;
}

// true when every logged set for the exercise has no weight (push-ups, pull-ups…)
export function isBodyweightHistory(logs, exId) {
  let any = false;
  for (const l of logs) for (const s of (l.entries && l.entries[exId]) || []) {
    any = true;
    if (num(s.w) > 0) return false;
  }
  return any;
}
