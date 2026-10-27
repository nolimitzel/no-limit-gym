/* Progress page numbers (pure, unit-tested in tests/progress.test.js).
   Dates are "YYYY-MM-DD" strings; weeks start on Monday. A workout counts once
   it has at least one set; volume is kg × reps over lifts (cardio excluded). */
import { e1rm, isBodyweightHistory } from "./history.js";

const num = (v) => Number(v) || 0;
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function mondayOf(ymd) {
  const d = parse(ymd);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return fmt(d);
}
const addDays = (ymd, n) => { const d = parse(ymd); d.setDate(d.getDate() + n); return fmt(d); };
const hasSets = (l) => Object.values(l.entries || {}).some((s) => s && s.length);

// the last `weeks` weeks ending with the week of `today`, oldest → newest
export function weeklySeries(logs, today, weeks = 12, isCardio = () => false) {
  const start = addDays(mondayOf(today), -7 * (weeks - 1));
  const out = [];
  for (let i = 0; i < weeks; i++) out.push({ week: addDays(start, 7 * i), workouts: 0, volume: 0 });
  const idx = new Map(out.map((w, i) => [w.week, i]));
  for (const l of logs || []) {
    if (!hasSets(l)) continue;
    const i = idx.get(mondayOf(l.date));
    if (i == null) continue;
    out[i].workouts++;
    for (const [id, sets] of Object.entries(l.entries)) {
      if (isCardio(id)) continue;
      for (const s of sets || []) out[i].volume += num(s.w) * num(s.r);
    }
  }
  out.forEach((w) => { w.volume = Math.round(w.volume); });
  return out;
}

// % change from a to b, rounded; null when there's no base to compare against
export function pctChange(a, b) {
  if (!a) return null;
  return Math.round(((b - a) / a) * 100);
}

// one point per session: best estimated 1-rep max (bodyweight lifts: best reps)
export function strengthSeries(logs, exId) {
  const bw = isBodyweightHistory(logs, exId);
  const pts = (logs || [])
    .filter((l) => l.entries && l.entries[exId] && l.entries[exId].length)
    .slice().sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((l) => {
      const sets = l.entries[exId];
      const best = sets.reduce((m, s) => (e1rm(s, bw) > e1rm(m, bw) ? s : m), sets[0]);
      return { date: l.date, best: { w: num(best.w), r: num(best.r) }, value: e1rm(best, bw) };
    })
    .filter((p) => p.value > 0);
  return { bodyweight: bw, points: pts };
}

// latest bodyweight vs the reading on or before `days` days earlier
export function bodyweightChange(body, days = 30) {
  const list = (body || []).filter((b) => num(b.weight) > 0).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!list.length) return null;
  const last = list[list.length - 1];
  const cutoff = addDays(last.date, -days);
  const base = [...list].reverse().find((b) => b.date <= cutoff) || (list.length > 1 ? list[0] : null);
  return {
    latest: num(last.weight),
    date: last.date,
    change: base ? Math.round((num(last.weight) - num(base.weight)) * 10) / 10 : null,
    since: base ? base.date : null,
  };
}

// this week so far vs the same days of last week (Mon → today's weekday), so a
// Tuesday isn't compared with a whole finished week
export function weekToDate(logs, today, isCardio = () => false) {
  const mon = mondayOf(today);
  const days = Math.round((parse(today) - parse(mon)) / 86400000);   // 0 = Monday
  const lastMon = addDays(mon, -7), lastEnd = addDays(lastMon, days);
  const sum = (from, to) => {
    const out = { workouts: 0, volume: 0 };
    for (const l of logs || []) {
      if (!hasSets(l) || l.date < from || l.date > to) continue;
      out.workouts++;
      for (const [id, sets] of Object.entries(l.entries)) {
        if (isCardio(id)) continue;
        for (const s of sets || []) out.volume += num(s.w) * num(s.r);
      }
    }
    out.volume = Math.round(out.volume);
    return out;
  };
  return { now: sum(mon, today), then: sum(lastMon, lastEnd), fullWeek: days === 6 };
}
