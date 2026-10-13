import { test } from "node:test";
import assert from "node:assert/strict";
import { prFor, lastSetsFor, bestSet, allSetsFor, isBodyweightHistory } from "../src/core/history.js";

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
