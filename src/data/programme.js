/* The ACTIVE programme — each user's own training structure.
   Holds the user's { sessions, cycle } (always sanitised — see core/programme.js)
   and merges in the shared reference content (warm-up, rules, supplements, fuel,
   cardio, default targets) that isn't part of the editable programme.

   exMeta() is the ONE place an exercise key is resolved to its metadata, used by
   both the UI and the cloud layer: programme sessions → static library → the
   user's custom library. (Previously the cloud layer only searched sessions, so
   custom/quick exercises were snapshotted to the cloud as raw ids.) */
import { PLAN } from "../data.js";
import { sanitizeProgramme } from "../core/programme.js";
import { libExercise } from "./exerciseLibrary.js";
import { getCustomExercises } from "./customExercises.js";

let active = null; // { sessions, cycle }

export function setActiveProgramme(p) {
  active = (p && p.sessions && p.cycle) ? sanitizeProgramme(p).programme : null;
}

export function getActiveProgramme() {
  if (!active) return PLAN;
  // user's structure + shared reference content from the default plan
  return { ...PLAN, sessions: active.sessions, cycle: active.cycle };
}

export function exMeta(key) {
  const P = getActiveProgramme();
  for (const sid of Object.keys(P.sessions)) {
    const e = (P.sessions[sid].exercises || []).find((x) => x.id === key);
    if (e) return e;
  }
  const lib = libExercise(key);
  if (lib) return { id: key, name: lib.name, reps: lib.reps, sets: lib.sets, target: lib.group, ...(lib.cardio ? { cardio: true } : {}) };
  const cx = getCustomExercises().find((c) => c.key === key);
  if (cx) return { id: key, name: cx.name, reps: cx.reps, sets: cx.sets, target: cx.group, custom: true, ...(cx.group === "Cardio" ? { cardio: true } : {}) };
  return null;
}
export const exName = (key) => exMeta(key)?.name || key;
export const isCardioKey = (key) => !!exMeta(key)?.cardio;
export const sessionName = (key) =>
  key === "quick" ? "Quick session" : (getActiveProgramme().sessions[key]?.full || key);
