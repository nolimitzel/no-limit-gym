/* Pure programme/schedule helpers (no I/O, unit-tested in tests/programme.test.js).
   A programme = { sessions: {id: {name, full, sub, exercises[]}}, cycle: [7 × {type, session?}] }
   The cycle is authored Mon→Sun, so a date's slot is simply its weekday. */
export const WEEK = 7;

// Mon=0 … Sun=6 for a local 'YYYY-MM-DD' date (no UTC parsing)
export function weekdayPos(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

/* Repair a programme so it can never crash the UI: exactly 7 slots, every
   training slot points at a session that exists, every session has an
   exercises array. Dangling references become rest days. */
export function sanitizeProgramme(input) {
  const p = JSON.parse(JSON.stringify(input || {}));
  let changed = false;
  if (!p.sessions || typeof p.sessions !== "object") { p.sessions = {}; changed = true; }
  for (const id of Object.keys(p.sessions)) {
    if (!p.sessions[id] || !Array.isArray(p.sessions[id].exercises)) {
      p.sessions[id] = { name: id, full: id, sub: "", ...(p.sessions[id] || {}), exercises: [] };
      changed = true;
    }
  }
  let cycle = Array.isArray(p.cycle) ? p.cycle.slice(0, WEEK) : [];
  if (!Array.isArray(p.cycle) || p.cycle.length !== WEEK) changed = true;
  while (cycle.length < WEEK) cycle.push({ type: "rest" });
  cycle = cycle.map((c) => {
    if (c && c.type === "rest") return c;
    if (c && c.type === "train" && p.sessions[c.session]) return c;
    changed = true;
    return { type: "rest" };
  });
  p.cycle = cycle;
  return { programme: p, changed };
}

// the session id scheduled for a date, or null for rest/unscheduled
export function sessionForDate(prog, ymd) {
  const c = prog.cycle[weekdayPos(ymd)];
  return c && c.type === "train" && prog.sessions[c.session] ? c.session : null;
}

// is a session still used by any OTHER day of the week?
export function isSessionReferenced(cycle, sessionId, exceptIndex = -1) {
  return cycle.some((c, i) => i !== exceptIndex && c && c.type === "train" && c.session === sessionId);
}
