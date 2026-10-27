import { test } from "node:test";
import assert from "node:assert/strict";
import { mondayOf, weeklySeries, pctChange, strengthSeries, bodyweightChange, weekToDate } from "../src/core/progress.js";

test("mondayOf finds the week's Monday", () => {
  assert.equal(mondayOf("2026-10-27"), "2026-10-26");   // Tue
  assert.equal(mondayOf("2026-10-26"), "2026-10-26");   // Mon
  assert.equal(mondayOf("2026-11-01"), "2026-10-26");   // Sun
});

test("weeklySeries counts workouts with sets and lift volume per week", () => {
  const logs = [
    { date: "2026-10-27", entries: { bench: [{ w: 60, r: 8 }, { w: 60, r: 8 }], run: [{ w: 20, r: 1 }] } },
    { date: "2026-10-26", entries: { squat: [{ w: 100, r: 5 }] } },
    { date: "2026-10-20", entries: { bench: [{ w: 50, r: 10 }] } },
    { date: "2026-10-21", entries: {} },                                  // emptied workout: not counted
    { date: "2026-01-01", entries: { bench: [{ w: 1, r: 1 }] } },        // outside the window
  ];
  const s = weeklySeries(logs, "2026-10-27", 3, (id) => id === "run");
  assert.deepEqual(s.map((w) => w.week), ["2026-10-12", "2026-10-19", "2026-10-26"]);
  assert.deepEqual(s.map((w) => w.workouts), [0, 1, 2]);
  assert.deepEqual(s.map((w) => w.volume), [0, 500, 1460]);           // 960 + 500, cardio excluded
});

test("pctChange", () => {
  assert.equal(pctChange(500, 1460), 192);
  assert.equal(pctChange(100, 90), -10);
  assert.equal(pctChange(0, 50), null);
});

test("strengthSeries: best estimated max per session; bodyweight lifts use reps", () => {
  const logs = [
    { date: "2026-10-20", entries: { bench: [{ w: 60, r: 8 }, { w: 70, r: 3 }] } },
    { date: "2026-10-10", entries: { bench: [{ w: 60, r: 5 }] } },
    { date: "2026-10-15", entries: { pull: [{ w: 0, r: 8 }] } },
    { date: "2026-10-22", entries: { pull: [{ w: 0, r: 10 }, { w: 0, r: 12 }] } },
  ];
  const b = strengthSeries(logs, "bench");
  assert.equal(b.bodyweight, false);
  assert.deepEqual(b.points.map((p) => p.date), ["2026-10-10", "2026-10-20"]);
  assert.equal(b.points[1].value, 77);                                // 70×3 → 77 beats 60×8 → 76
  assert.deepEqual(b.points[1].best, { w: 70, r: 3 });
  const p = strengthSeries(logs, "pull");
  assert.equal(p.bodyweight, true);
  assert.deepEqual(p.points.map((x) => x.value), [8, 12]);
});

test("bodyweightChange compares with the reading ~30 days back", () => {
  const body = [
    { date: "2026-09-01", weight: 85 }, { date: "2026-09-25", weight: 84 },
    { date: "2026-10-20", weight: 83.4 }, { date: "2026-10-27", weight: 82.9 },
  ];
  const c = bodyweightChange(body, 30);
  assert.equal(c.latest, 82.9);
  assert.equal(c.since, "2026-09-25");
  assert.equal(c.change, -1.1);
  assert.equal(bodyweightChange([], 30), null);
  assert.equal(bodyweightChange([{ date: "2026-10-27", weight: 80 }]).change, null);
});

test("weekToDate compares with the same days of last week", () => {
  const logs = [
    { date: "2026-10-26", entries: { bench: [{ w: 60, r: 10 }] } },   // Mon this week
    { date: "2026-10-19", entries: { bench: [{ w: 50, r: 10 }] } },   // Mon last week
    { date: "2026-10-20", entries: { bench: [{ w: 50, r: 10 }] } },   // Tue last week
    { date: "2026-10-23", entries: { bench: [{ w: 99, r: 10 }] } },   // Fri last week: not compared on a Tuesday
  ];
  const t = weekToDate(logs, "2026-10-27");
  assert.deepEqual(t.now, { workouts: 1, volume: 600 });
  assert.deepEqual(t.then, { workouts: 2, volume: 1000 });
  assert.equal(t.fullWeek, false);
  assert.equal(weekToDate(logs, "2026-11-01").fullWeek, true);
});

test("week maths across a year boundary, on a Sunday, and with cardio only", () => {
  assert.equal(mondayOf("2027-01-03"), "2026-12-28");                    // Sunday → Monday of the week before
  const s = weeklySeries([{ date: "2027-01-01", entries: { run: [{ w: 30, r: 1 }] } }], "2027-01-03", 2, (id) => id === "run");
  assert.deepEqual(s.map((w) => w.week), ["2026-12-21", "2026-12-28"]);
  assert.deepEqual(s.map((w) => [w.workouts, w.volume]), [[0, 0], [1, 0]]); // cardio counts as a workout, not volume
  const t = weekToDate([{ date: "2026-12-27", entries: { b: [{ w: 10, r: 10 }] } }], "2027-01-03");
  assert.deepEqual(t.then, { workouts: 1, volume: 100 });                 // the full previous week on a Sunday
  assert.equal(t.fullWeek, true);
});

import { prsThisWeek, sessionVsLast } from "../src/core/progress.js";

test("prsThisWeek: strictly better than every earlier set; first-ever sets are baselines", () => {
  const logs = [
    { date: "2026-10-12", entries: { bench: [{ w: 60, r: 8 }], squat: [{ w: 100, r: 5 }], row: [{ w: 50, r: 10 }] } },
    { date: "2026-10-26", entries: { bench: [{ w: 62.5, r: 6 }], squat: [{ w: 100, r: 5 }], curl: [{ w: 15, r: 10 }], run: [{ w: 30, r: 1 }] } },
    { date: "2026-10-27", entries: { row: [{ w: 50, r: 12 }] } },
  ];
  const ids = prsThisWeek(logs, "2026-10-27", (id) => id === "run").map((p) => p.id).sort();
  assert.deepEqual(ids, ["bench", "row"]);             // squat matched (not a PR), curl is a first, run is cardio
});

test("sessionVsLast compares set by set and finds new bests", () => {
  const logs = [
    { date: "2026-10-20", entries: { bench: [{ w: 60, r: 8 }, { w: 60, r: 8 }, { w: 57.5, r: 7 }] } },
    { date: "2026-10-27", entries: { bench: [{ w: 62.5, r: 8 }, { w: 60, r: 8 }, { w: 55, r: 7 }, { w: 50, r: 10 }], fly: [{ w: 10, r: 12 }] } },
  ];
  const v = sessionVsLast(logs, logs[1]);
  assert.equal(v.exercises, 2);
  assert.equal(v.sets, 5);
  assert.deepEqual([v.up, v.same, v.down], [1, 1, 1]);        // set 4 and the fly have nothing to compare with
  assert.equal(v.volume, 62.5 * 8 + 480 + 385 + 500 + 120);
  assert.deepEqual(v.newBests.map((b) => b.id), ["bench"]);
  assert.deepEqual(sessionVsLast(logs, null).sets, 0);
});

test("prsThisWeek edge cases", () => {
  const logs = [
    { date: "2026-10-18", entries: { pull: [{ w: 0, r: 8 }], bench: [{ w: 60, r: 8 }] } },   // Sunday before: history
    { date: "2026-10-19", entries: { pull: [{ w: 0, r: 10 }], bench: [{ w: 65, r: 5 }] } },  // Monday: both PRs
    { date: "2026-10-21", entries: { bench: [{ w: 55, r: 8 }] } },                           // lower later session
    { date: "2026-10-23", entries: {} },                                                     // empty
    { date: "2026-10-30", entries: { squat: [{ w: 200, r: 1 }] } },                          // future: ignored
  ];
  const prs = prsThisWeek(logs, "2026-10-22");
  assert.deepEqual(prs.map((p) => p.id).sort(), ["bench", "pull"]);
  assert.deepEqual(prs.find((p) => p.id === "bench").set, { w: 65, r: 5 });   // the week's best, not the latest
  assert.deepEqual(prsThisWeek([], "2026-10-22"), []);
});

test("sessionVsLast edge cases", () => {
  const logs = [
    { date: "2026-10-20", entries: { bench: [{ w: 60, r: 8 }], run: [{ w: 20, r: 1 }] } },
    { date: "2026-10-27", entries: { bench: [{ w: 62.5, r: 8 }], run: [{ w: 25, r: 1 }], fly: [], newlift: [{ w: 20, r: 10 }] } },
    { date: "2026-10-27", entries: { bench: [{ w: 65, r: 5 }] } },               // second session the same day
    { date: "2026-11-03", entries: { bench: [{ w: 100, r: 1 }] } },              // later: never compared against
  ];
  const v = sessionVsLast(logs, logs[1], (id) => id === "run");
  assert.equal(v.exercises, 3);                                                  // empty fly skipped
  assert.equal(v.sets, 3);
  assert.deepEqual([v.up, v.same, v.down], [1, 0, 0]);                          // run and newlift: nothing to compare
  assert.equal(v.volume, 500 + 200);                                             // cardio adds no volume
  assert.deepEqual(v.newBests.map((b) => b.id), ["bench"]);                      // a first-ever lift isn't a "new best"
  const w = sessionVsLast(logs, logs[2]);                                        // same-day log compares with before today
  assert.deepEqual(w.newBests.map((b) => b.set), [{ w: 65, r: 5 }]);
});
