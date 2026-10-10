/* The ACTIVE programme — each user's own training structure.
   Holds the user's { sessions, cycle } and merges in the shared reference content
   (warm-up, rules, supplements, fuel, cardio, default targets) that isn't part of
   the editable programme. app.js + cloudStore read exercise metadata through here,
   so custom exercises resolve the same way built-ins do. */
import { PLAN } from "../data.js";

let active = null; // { sessions, cycle }

export function setActiveProgramme(p) {
  active = (p && p.sessions && p.cycle) ? p : null;
}

export function getActiveProgramme() {
  if (!active) return PLAN;
  // user's structure + shared reference content from the default plan
  return { ...PLAN, sessions: active.sessions, cycle: active.cycle };
}

export function exMeta(key) {
  const P = getActiveProgramme();
  for (const sid of Object.keys(P.sessions)) {
    const e = P.sessions[sid].exercises.find((x) => x.id === key);
    if (e) return e;
  }
  return null;
}
export const exName = (key) => exMeta(key)?.name || key;
export const isCardioKey = (key) => !!exMeta(key)?.cardio;
export const sessionName = (key) => getActiveProgramme().sessions[key]?.full || key;
