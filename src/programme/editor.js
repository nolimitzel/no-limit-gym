/* Programme editor — build your own split.
   Edits a working copy of { sessions, cycle }; Save persists (local + cloud) and
   reloads so the whole app picks up the new programme. Cancel discards. */
import { getActiveProgramme } from "../data/programme.js";
import { saveProgramme } from "../data/programmeStore.js";
import { EXERCISE_LIBRARY, MUSCLE_GROUPS, toProgrammeExercise } from "../data/exerciseLibrary.js";
import { getCustomExercises, addCustomExercise } from "../data/customExercises.js";
import { cachedUser } from "../auth/auth.js";
import { esc } from "../ui/safeRender.js";
import { isSessionReferenced } from "../core/programme.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const view = () => document.getElementById("view");
let work, onCloseCb;

export function openEditor(onClose) {
  onCloseCb = onClose;
  const p = getActiveProgramme();
  work = JSON.parse(JSON.stringify({ sessions: p.sessions, cycle: p.cycle }));
  render();
}

const newDayId = () => "day-" + Math.random().toString(36).slice(2, 7);

function render() {
  let h = `<div class="ed">
    <div class="ed-top">
      <button class="ed-back" data-act="ed-back">‹ Back</button>
      <b>Edit Programme</b>
      <button class="btn sm" data-act="ed-save">Save</button>
    </div>
    <p class="ed-hint">Build each day from the library — add, reorder or remove. Changes save to your account.</p>`;

  work.cycle.forEach((c, i) => {
    if (c.type === "rest") {
      h += `<div class="ed-day rest">
        <div class="ed-day-h"><span class="ed-wd">${DAYS[i]}</span><b class="ed-rest-label">Rest day</b>
          <button class="ed-mini" data-act="ed-train" data-i="${i}">+ Training day</button></div></div>`;
      return;
    }
    const s = work.sessions[c.session] || { exercises: [] };
    // a session can be scheduled on several days; editing it changes all of them — say so
    const also = work.cycle.map((x, k) => (k !== i && x.type === "train" && x.session === c.session ? DAYS[k] : null)).filter(Boolean);
    const rows = s.exercises.map((ex, j) => `
      <div class="ed-ex">
        <span class="ed-ex-n">${esc(ex.name)}${ex.cardio ? " 🔥" : ""}</span>
        <span class="ed-ex-m">${esc(ex.sets)}×${esc(ex.reps)}</span>
        <span class="ed-ctl">
          <button data-act="ed-up" data-i="${i}" data-j="${j}">↑</button>
          <button data-act="ed-down" data-i="${i}" data-j="${j}">↓</button>
          <button data-act="ed-rm" data-i="${i}" data-j="${j}">✕</button>
        </span></div>`).join("");
    h += `<div class="ed-day">
      <div class="ed-day-h"><span class="ed-wd">${DAYS[i]}</span>
        <b class="ed-name" data-act="ed-rename" data-i="${i}">${esc(s.full || s.name || "Workout")}</b>
        <button class="ed-mini" data-act="ed-rest" data-i="${i}">Rest</button></div>
      ${also.length ? `<div class="ed-empty" style="padding:2px 0 8px">Same session as ${also.join(", ")} — changes apply to every day it's on.</div>` : ""}
      ${rows || '<div class="ed-empty">No exercises yet</div>'}
      <button class="ed-add" data-act="ed-add" data-i="${i}">+ Add exercise</button></div>`;
  });
  h += `</div>`;
  view().innerHTML = h;
  wire();
}

function daySession(i) {
  const c = work.cycle[i];
  if (c.type !== "train") return null;
  return (work.sessions[c.session] ||= { name: "Workout", full: "Workout", sub: "", exercises: [] });
}

function wire() {
  view().querySelectorAll("[data-act]").forEach((el) => {
    const act = el.dataset.act, i = +el.dataset.i, j = +el.dataset.j;
    el.addEventListener("click", () => {
      if (act === "ed-back") return onCloseCb && onCloseCb();
      if (act === "ed-save") return doSave(el);
      if (act === "ed-rm") { daySession(i).exercises.splice(j, 1); return render(); }
      if (act === "ed-up" && j > 0) { const a = daySession(i).exercises; [a[j - 1], a[j]] = [a[j], a[j - 1]]; return render(); }
      if (act === "ed-down") { const a = daySession(i).exercises; if (j < a.length - 1) { [a[j + 1], a[j]] = [a[j], a[j + 1]]; } return render(); }
      if (act === "ed-add") return openPicker(i);
      if (act === "ed-rename") {
        const s = daySession(i); const name = prompt("Workout name", s.full || s.name);
        if (name) { s.name = name; s.full = name; } return render();
      }
      if (act === "ed-rest") {
        const sid = work.cycle[i].session;
        const shared = isSessionReferenced(work.cycle, sid, i);
        if (confirm("Make " + DAYS[i] + " a rest day?" + (shared ? "" : " Its exercises will be removed."))) {
          // only delete the session if no other day still uses it — deleting a shared
          // session left other days pointing at nothing and crashed the app (AUDIT C4)
          if (!shared) delete work.sessions[sid];
          work.cycle[i] = { type: "rest" };
        } return render();
      }
      if (act === "ed-train") {
        const name = prompt("Workout name for " + DAYS[i], "Workout"); if (!name) return;
        const id = newDayId(); work.sessions[id] = { name, full: name, sub: "", exercises: [] };
        work.cycle[i] = { type: "train", session: id }; return render();
      }
    });
  });
}

async function doSave(btn) {
  btn.disabled = true; btn.textContent = "Saving…";
  const u = cachedUser();
  const r = u ? await saveProgramme(u.id, work) : { synced: true };
  // be honest: an unsynced save is kept on this device and pushed on next launch (AUDIT C2/C3)
  btn.textContent = r.synced ? "Saved ✓" : "Saved on device";
  setTimeout(() => location.reload(), r.synced ? 300 : 1200);   // reboot so the whole app uses it
}

/* ---------- library picker ---------- */
function openPicker(dayIndex) {
  const ov = document.createElement("div");
  ov.className = "ed-picker";
  ov.innerHTML = `<div class="ed-pbox">
    <div class="ed-ptop"><b>Add exercise</b><button class="ed-pclose">✕</button></div>
    <input class="ed-search" placeholder="Search your library…" autocapitalize="none">
    <div class="ed-create"><input class="ed-cin" placeholder="…or create your own" autocapitalize="words">
      <select class="ed-cgrp">${MUSCLE_GROUPS.map((g) => `<option value="${g}">${g}</option>`).join("")}</select>
      <button class="ed-cadd">Add</button></div>
    <div class="ed-plist">${pickerList("")}</div></div>`;
  document.body.appendChild(ov);

  const close = () => ov.remove();
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector(".ed-pclose").addEventListener("click", close);

  const pushToDay = (ex) => {
    const s = daySession(dayIndex);
    if (s && !s.exercises.some((x) => x.id === ex.id)) s.exercises.push(ex);
  };
  const resolve = (key) => {
    const c = getCustomExercises().find((e) => e.key === key);
    if (c) return { id: c.key, name: c.name, target: c.group, sets: c.sets, reps: c.reps, custom: true, ...(c.cardio ? { cardio: true } : {}) };
    return toProgrammeExercise(key);
  };

  // create a custom exercise: saved to the user's library AND added to this day
  const cin = ov.querySelector(".ed-cin");
  const grp = ov.querySelector(".ed-cgrp");
  const addCustom = async () => {
    const name = cin.value.trim(); if (!name) return;
    const u = cachedUser();
    try {
      const ex = await addCustomExercise(u?.id, { name, group: grp.value });
      pushToDay({ id: ex.key, name: ex.name, target: ex.group, sets: ex.sets, reps: ex.reps, custom: true, ...(ex.cardio ? { cardio: true } : {}) });
    } catch {}
    close(); render();
  };
  ov.querySelector(".ed-cadd").addEventListener("click", addCustom);
  cin.addEventListener("keydown", (e) => { if (e.key === "Enter") addCustom(); });
  const search = ov.querySelector(".ed-search");
  const list = ov.querySelector(".ed-plist");
  search.addEventListener("input", () => { list.innerHTML = pickerList(search.value.toLowerCase()); bindItems(); });

  const bindItems = () => list.querySelectorAll(".ed-pi").forEach((it) =>
    it.addEventListener("click", () => { const ex = resolve(it.dataset.k); if (ex) pushToDay(ex); close(); render(); }));
  bindItems();
}

function pickerList(q) {
  const custom = getCustomExercises();
  return MUSCLE_GROUPS.map((g) => {
    const items = [...custom.filter((e) => e.group === g), ...EXERCISE_LIBRARY.filter((e) => e.group === g)]
      .filter((e) => !q || e.name.toLowerCase().includes(q) || g.toLowerCase().includes(q));
    if (!items.length) return "";
    return `<div class="ed-pg">${g}</div>` + items.map((e) =>
      `<button class="ed-pi" data-k="${e.key}">
        <span>${esc(e.name)}${e.custom ? ` <span class="tag-yours">YOURS</span>` : ""}${e.cardio ? " 🔥" : ""}</span>
        <small>${esc(e.equipment)} · ${esc(e.sets)}×${esc(e.reps)}</small></button>`).join("");
  }).join("");
}
