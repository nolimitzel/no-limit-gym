import { test } from "node:test";
import assert from "node:assert/strict";
import { prFor, lastSetsFor, bestSet, allSetsFor, isBodyweightHistory,
  exerciseSessions, daysBetween, restSecondsFor, e1rm, strengthTrend, compareSet } from "../src/core/history.js";

// a routine that changes week to week: the incline press disappears for a week, then returns
const logs = [
  { date: "2026-09-28", session: "chest", entries: { "incline-db-press": [{ w: 30, r: 8 }, { w: 30, r: 7 }] } },
  { date: "2026-10-05", session: "quick", entries: { "cable-crossover": [{ w: 15, r: 12 }] } },
  { date: "2026-10-12", session: "chest-b", entries: { "incline-db-press": [{ w: 30, r: 10 }], "push-ups": [{ w: 0, r: 20 }] } },
  { date: "2026-10-13", session: "quick", entries: { "push-ups": [{ w: 0, r: 25 }] } },
];

test("previous performance is found across sessions, weeks and skipped weeks", () => {
  const last = lastSetsFor(logs, "incline-db-press", "2026-10-12");
  assert.equal(last.date, "2026-09-28");        // skipped a week, still found
  assert.equal(lastSetsFor(logs, "incline-db-press", "2026-10-13").date, "2026-10-12");
});

test("lastSetsFor excludes the same day (today's own sets aren't 'last time')", () => {
  assert.equal(lastSetsFor(logs, "push-ups", "2026-10-13").date, "2026-10-12");
});

test("M3: a rep PR at the same weight counts", () => {
  assert.deepEqual(prFor(logs, "incline-db-press"), { w: 30, r: 10 });
});

test("M3: bodyweight exercises get PRs by reps", () => {
  assert.deepEqual(prFor(logs, "push-ups"), { w: 0, r: 25 });
  assert.equal(isBodyweightHistory(logs, "push-ups"), true);
  assert.equal(isBodyweightHistory(logs, "incline-db-press"), false);
});

test("a different exercise is never counted as progress on another", () => {
  assert.equal(prFor(logs, "cable-crossover").w, 15);
  assert.equal(allSetsFor(logs, "incline-db-press").length, 2);   // only real occurrences
});

test("prFor with beforeDate gives the best set prior to a week", () => {
  assert.deepEqual(prFor(logs, "incline-db-press", "2026-10-12"), { w: 30, r: 8 });
});

test("bestSet prefers weight, then reps", () => {
  assert.deepEqual(bestSet([{ w: 20, r: 12 }, { w: 22.5, r: 6 }, { w: 22.5, r: 8 }]), { w: 22.5, r: 8 });
});

test("exercise history lists every occurrence newest first, across sessions", () => {
  const h = exerciseSessions(logs, "incline-db-press");
  assert.deepEqual(h.map((x) => [x.date, x.session]), [["2026-10-12", "chest-b"], ["2026-09-28", "chest"]]);
  assert.deepEqual(h[1].best, { w: 30, r: 8 });
  assert.equal(exerciseSessions(logs, "never-done").length, 0);
});

test("daysBetween counts whole local days, DST-safe", () => {
  assert.equal(daysBetween("2026-10-12", "2026-10-13"), 1);
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2);   // across the UK clock change
});

test("rest suggestion follows rep targets", () => {
  assert.equal(restSecondsFor("5–8"), 180);
  assert.equal(restSecondsFor("8–10"), 120);
  assert.equal(restSecondsFor("12–15"), 90);
  assert.equal(restSecondsFor("45–60s"), 90);
  assert.equal(restSecondsFor(undefined), 90);
});

test("strength score counts reps, not just weight", () => {
  assert.ok(e1rm({ w: 40, r: 10 }) > e1rm({ w: 40, r: 8 }));
  assert.equal(e1rm({ w: 100, r: 1 }), 100);
  assert.equal(e1rm({ w: 0, r: 20 }), 20);                 // bodyweight → reps
  assert.ok(e1rm({ w: 30, r: 12 }) > e1rm({ w: 32.5, r: 5 }));
});

test("strength trend: same weight, more reps reads as progress (was 'holding steady')", () => {
  const t = strengthTrend([
    { date: "2026-10-01", entries: { "incline-db-press": [{ w: 40, r: 8 }, { w: 40, r: 7 }] } },
    { date: "2026-10-08", entries: { "incline-db-press": [{ w: 40, r: 10 }] } },
  ], "incline-db-press");
  assert.equal(t.values.length, 2);
  assert.ok(t.pct > 0);
  assert.deepEqual(t.latest, { w: 40, r: 10 });
});

test("strength trend: one session has no trend yet; bodyweight trends by reps", () => {
  assert.equal(strengthTrend(logs, "cable-crossover").pct, null);
  const pu = strengthTrend(logs, "push-ups");
  assert.equal(pu.bodyweight, true);
  assert.equal(pu.pct, 25);                                // 20 → 25 reps
});

test("compareSet: progress vs the same set last session", () => {
  assert.equal(compareSet({ w: 62.5, r: 8 }, { w: 60, r: 8 }), "up");
  assert.equal(compareSet({ w: 60, r: 9 }, { w: 60, r: 8 }), "up");
  assert.equal(compareSet({ w: "60", r: "8" }, { w: 60, r: 8 }), "same");
  assert.equal(compareSet({ w: 60, r: 6 }, { w: 60, r: 8 }), "down");
  assert.equal(compareSet({ w: 55, r: 12 }, { w: 60, r: 8 }), "down");
  assert.equal(compareSet({ w: 0, r: 15 }, { w: 0, r: 12 }), "up");       // bodyweight reps
  assert.equal(compareSet({ w: 60, r: "" }, { w: 60, r: 8 }), null);
  assert.equal(compareSet(null, { w: 60, r: 8 }), null);
});
