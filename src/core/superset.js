/* Supersets (pure, unit-tested in tests/superset.test.js).
   A superset is two or more exercises done back to back with no rest between
   them, resting only after the last one. Today's exercise list is an ordered
   array of { id, ... }; exercises in the same superset share an `ss` id and
   always sit next to each other. Every function returns a NEW array. */

const newId = (list) => {
  const used = new Set(list.map((e) => e.ss).filter(Boolean));
  let n = 1;
  while (used.has("ss" + n)) n++;
  return "ss" + n;
};

// keep groups contiguous, keep cardio out, and drop any "superset" of one
export function normalizeSupersets(list) {
  const out = (list || []).map((e) => ({ ...e }));
  out.forEach((e) => { if (e.cardio) delete e.ss; });
  const seen = new Set();
  for (let i = 0; i < out.length; i++) {
    const id = out[i].ss;
    if (!id) continue;
    if (seen.has(id) && out[i - 1]?.ss !== id) {   // same id again further down: it's a separate group
      const fresh = newId(out);
      for (let j = i; j < out.length && out[j].ss === id; j++) out[j].ss = fresh;
    }
    seen.add(out[i].ss);
  }
  const size = {};
  out.forEach((e) => { if (e.ss) size[e.ss] = (size[e.ss] || 0) + 1; });
  out.forEach((e) => { if (e.ss && size[e.ss] < 2) delete e.ss; });
  return out;
}

// pair `otherId` with `anchorId`: it moves to just after the anchor's group and joins it
export function linkSuperset(list, anchorId, otherId) {
  if (anchorId === otherId) return normalizeSupersets(list);
  const src = normalizeSupersets(list);
  const anchor = src.find((e) => e.id === anchorId);
  const other = src.find((e) => e.id === otherId);
  if (!anchor || !other || anchor.cardio || other.cardio) return src;
  const ss = anchor.ss || newId(src);
  const rest = src.filter((e) => e.id !== otherId).map((e) => (e.id === anchorId ? { ...e, ss } : e));
  let at = rest.findIndex((e) => e.id === anchorId);
  while (at + 1 < rest.length && rest[at + 1].ss === ss) at++;   // after the group's last member
  const moved = { ...other, ss };
  return normalizeSupersets([...rest.slice(0, at + 1), moved, ...rest.slice(at + 1)]);
}

// take one exercise out of its superset (it stays in the workout, after the group)
export function unlinkSuperset(list, id) {
  const src = normalizeSupersets(list);
  const ex = src.find((e) => e.id === id);
  if (!ex || !ex.ss) return src;
  const ss = ex.ss;
  // a pair just dissolves in place; from a bigger group the exercise moves out below it
  if (src.filter((e) => e.ss === ss).length <= 2) return normalizeSupersets(src.map((e) => (e.ss === ss ? { ...e, ss: undefined } : e)));
  const rest = src.filter((e) => e.id !== id);
  let at = rest.findIndex((e) => e.ss === ss);
  if (at < 0) return normalizeSupersets(src.map((e) => (e.id === id ? { ...e, ss: undefined } : e)));
  while (at + 1 < rest.length && rest[at + 1].ss === ss) at++;
  const freed = { ...ex }; delete freed.ss;
  return normalizeSupersets([...rest.slice(0, at + 1), freed, ...rest.slice(at + 1)]);
}

// id → { letter: "A", pos: 1, size: 2, last: false } for exercises in a superset
export function supersetLabels(list) {
  const out = {};
  const letters = {};
  let next = 0;
  const groups = {};
  (list || []).forEach((e) => { if (e.ss) (groups[e.ss] ||= []).push(e.id); });
  (list || []).forEach((e) => {
    if (!e.ss) return;
    if (!(e.ss in letters)) letters[e.ss] = String.fromCharCode(65 + (next++ % 26));
    const ids = groups[e.ss];
    const pos = ids.indexOf(e.id) + 1;
    out[e.id] = { letter: letters[e.ss], pos, size: ids.length, last: pos === ids.length };
  });
  return out;
}
