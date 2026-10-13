/* Workout editor — your workouts and their usual exercises.
   Organised by WORKOUT, not by weekday: nobody's week is fixed, so every
   workout (Chest, Back… or your own, like "Push") is editable whether or not it's
   on the optional schedule. Edits a working copy of { sessions, cycle, goal };
   Save persists (local + cloud) and reloads so the whole app picks it up. */
import { getActiveProgramme } from "../data/programme.js";
import { saveProgramme } from "../data/programmeStore.js";
import { EXERCISE_LIBRARY, MUSCLE_GROUPS, toProgrammeExercise } from "../data/exerciseLibrary.js";
import { getCustomExercises, addCustomExercise } from "../data/customExercises.js";
import { cachedUser } from "../auth/auth.js";
import { esc } from "../ui/safeRender.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const view = () => document.getElementById("view");
let work, onCloseCb;

export function openEditor(onClose) {
  onCloseCb = onClose;
  const p = getActiveProgramme();
  work = JSON.parse(JSON.stringify({ sessions: p.sessions, cycle: p.cycle, ...(p.goal ? { goal: p.goal } : {}) }));
  render();
  window.scrollTo(0, 0);
}

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "workout";
function newId(name) {
  let id = slug(name), n = 1;
  while (work.sessions[id]) id = slug(name) + "-" + (++n);
  return id;
}

function render() {
  let h = `<div class="ed">
    <div class="ed-top">
      <button class="ed-back" data-act="ed-back">‹ Back</button>
      <b>Your workouts</b>
      <button class="btn sm" data-act="ed-save">Save</button>
    </div>
    <p class="ed-hint">Each workout's usual exercises — Train loads these when you pick it, and you choose what to do on the day. Add, reorder or remove.</p>`;

  // muscle groups in their natural order, then the user's own workouts
  const rank = (id) => { const i = MUSCLE_GROUPS.findIndex((g) => g.toLowerCase() === id.toLowerCase()); return i < 0 ? 99 : i; };
  Object.keys(work.sessions).sort((a, b) => rank(a) - rank(b)).forEach((id) => {
    const s = work.sessions[id];
    const onDays = work.cycle.map((c, k) => (c.type === "train" && c.session === id ? DAYS[k] : null)).filter(Boolean);
    const rows = s.exercises.map((ex, j) => `
      <div class="ed-ex">
        <span class="ed-ex-n">${esc(ex.name)}${ex.cardio ? ' <span class="tag-yours">CARDIO</span>' : ""}</span>
        <span class="ed-ex-m">${esc(ex.sets)}×${esc(ex.reps)}</span>
        <span class="ed-ctl">
          <button data-act="ed-up" data-s="${esc(id)}" data-j="${j}" aria-label="Move up">↑</button>
          <button data-act="ed-down" data-s="${esc(id)}" data-j="${j}" aria-label="Move down">↓</button>
          <button data-act="ed-rm" data-s="${esc(id)}" data-j="${j}" aria-label="Remove">✕</button>
        </span></div>`).join("");
    h += `<div class="ed-day">
      <div class="ed-day-h"><span class="ed-wd">${onDays.length ? onDays.join(" ") : "Any day"}</span>
        <b class="ed-name" data-act="ed-rename" data-s="${esc(id)}">${esc(s.full || s.name || "Workout")}</b>
        <button class="ed-mini" data-act="ed-del" data-s="${esc(id)}">Delete</button></div>
      ${rows || '<div class="ed-empty">No usual exercises — you\'ll pick them on the day.</div>'}
      <button class="ed-add" data-act="ed-add" data-s="${esc(id)}">+ Add exercise</button></div>`;
  });
  h += `<button class="linkbtn" data-act="ed-new" style="margin-top:6px">+ New workout
      <small>E.g. "Push", "Upper body", "Glutes" — mix any exercises.</small></button></div>`;
  view().innerHTML = h;
  wire();
}

function wire() {
  view().querySelectorAll("[data-act]").forEach((el) => {
    const act = el.dataset.act, sid = el.dataset.s, j = +el.dataset.j;
    const s = sid ? work.sessions[sid] : null;
    el.addEventListener("click", () => {
      if (act === "ed-back") return onCloseCb && onCloseCb();
      if (act === "ed-save") return doSave(el);
      if (act === "ed-rm") { s.exercises.splice(j, 1); return render(); }
      if (act === "ed-up" && j > 0) { const a = s.exercises; [a[j - 1], a[j]] = [a[j], a[j - 1]]; return render(); }
      if (act === "ed-down") { const a = s.exercises; if (j < a.length - 1) { [a[j + 1], a[j]] = [a[j], a[j + 1]]; } return render(); }
      if (act === "ed-add") return openPicker(sid);
      if (act === "ed-rename") {
        const name = prompt("Workout name", s.full || s.name);
        if (name && name.trim()) { s.name = name.trim(); s.full = name.trim(); } return render();
      }
      if (act === "ed-del") {
        if (Object.keys(work.sessions).length <= 1) { alert("Keep at least one workout."); return; }
        const days = work.cycle.map((c, k) => (c.type === "train" && c.session === sid ? DAYS[k] : null)).filter(Boolean);
        if (!confirm(`Delete "${s.full || s.name}"?${days.length ? ` It comes off your schedule (${days.join(", ")}).` : ""} Workouts you've already logged are kept.`)) return;
        delete work.sessions[sid];
        // never leave a day pointing at a deleted workout (AUDIT C4)
        work.cycle = work.cycle.map((c) => (c.type === "train" && c.session === sid ? { type: "rest" } : c));
        return render();
      }
      if (act === "ed-new") {
        const name = prompt("Name your workout", ""); if (!name || !name.trim()) return;
        const id = newId(name.trim());
        work.sessions[id] = { name: name.trim(), full: name.trim(), sub: "", exercises: [] };
        render(); return openPicker(id);
      }
    });
  });
}

async function doSave(btn) {
  btn.disabled = true; btn.textContent = "Saving…";
  const u = cachedUser();
  const r = u ? await saveProgramme(u.id, work) : { synced: true };
  // be honest: an unsynced save is kept on this device and pushed on next launch (AUDIT C2/C3)
  btn.textContent = r.synced ? "Saved" : "Saved on device";
  setTimeout(() => location.reload(), r.synced ? 300 : 1200);   // reboot so the whole app uses it
}

/* ---------- library picker ---------- */
function openPicker(sessionId) {
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
    const s = work.sessions[sessionId];
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
        <span>${esc(e.name)}${e.custom ? ` <span class="tag-yours">YOURS</span>` : ""}${e.cardio ? ' <span class="tag-yours">CARDIO</span>' : ""}</span>
        <small>${esc(e.equipment)} · ${esc(e.sets)}×${esc(e.reps)}</small></button>`).join("");
  }).join("");
}
