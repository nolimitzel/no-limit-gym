import { test } from "node:test";
import assert from "node:assert/strict";
import { weekdayPos, sanitizeProgramme, sessionForDate, isSessionReferenced, weeklyGoal, comboKey, comboParts, homeSessionFor } from "../src/core/programme.js";

const S = (n) => ({ name: n, full: n, sub: "", exercises: [] });

test("weekdayPos: Mon=0 … Sun=6 from local dates", () => {
  assert.equal(weekdayPos("2026-10-12"), 0); // Monday
  assert.equal(weekdayPos("2026-10-13"), 1); // Tuesday
  assert.equal(weekdayPos("2026-10-18"), 6); // Sunday
  assert.equal(weekdayPos("2026-03-29"), 6); // UK DST change day, still Sunday
});

test("C4: a day pointing at a deleted session becomes rest instead of crashing (regression: Repro 6)", () => {
  const broken = { sessions: { core: S("Core") },
    cycle: [{ type: "train", session: "core" }, { type: "train", session: "back" }, { type: "rest" },
            { type: "rest" }, { type: "rest" }, { type: "rest" }, { type: "rest" }] };
  const { programme, changed } = sanitizeProgramme(broken);
  assert.equal(changed, true);
  assert.deepEqual(programme.cycle[1], { type: "rest" });
  assert.equal(sessionForDate(programme, "2026-10-13"), null);
});

test("sanitize pads/truncates the cycle to 7 and repairs sessions without exercises", () => {
  const { programme } = sanitizeProgramme({ sessions: { a: { name: "A" } }, cycle: [{ type: "train", session: "a" }] });
  assert.equal(programme.cycle.length, 7);
  assert.ok(Array.isArray(programme.sessions.a.exercises));
});

test("a healthy programme is left unchanged", () => {
  const ok = { sessions: { a: S("A") }, cycle: Array.from({ length: 7 }, (_, i) => i ? { type: "rest" } : { type: "train", session: "a" }) };
  assert.equal(sanitizeProgramme(ok).changed, false);
});

test("C3: the Train/Home session for a date follows the saved schedule", () => {
  const prog = { sessions: { back: S("Back"), core: S("Core") },
    cycle: [{ type: "train", session: "core" }, { type: "rest" }, { type: "train", session: "back" },
            { type: "rest" }, { type: "rest" }, { type: "rest" }, { type: "rest" }] };
  assert.equal(sessionForDate(prog, "2026-10-13"), null);   // Tue edited to rest → not Back
  assert.equal(sessionForDate(prog, "2026-10-14"), "back");
});

test("C4: a session shared by two days is still referenced after removing one day", () => {
  const cycle = [{ type: "rest" }, { type: "train", session: "back" }, { type: "train", session: "back" }];
  assert.equal(isSessionReferenced(cycle, "back", 2), true);
  assert.equal(isSessionReferenced([{ type: "train", session: "back" }], "back", 0), false);
});

const REST7 = Array.from({ length: 7 }, () => ({ type: "rest" }));

test("flexible: an all-rest schedule is valid (user picks on the day)", () => {
  const { programme, changed } = sanitizeProgramme({ sessions: { chest: S("Chest") }, cycle: REST7, goal: 3 });
  assert.equal(changed, false);
  assert.equal(sessionForDate(programme, "2026-10-14"), null);
});

test("weekly goal: own goal wins, else scheduled days, else onboarding count, else 3", () => {
  assert.equal(weeklyGoal({ goal: 2, cycle: REST7 }), 2);
  const three = REST7.map((c, i) => (i < 3 ? { type: "train", session: "a" } : c));
  assert.equal(weeklyGoal({ cycle: three }), 3);
  assert.equal(weeklyGoal({ cycle: REST7 }, 5), 5);
  assert.equal(weeklyGoal({ cycle: REST7 }), 3);
  assert.equal(weeklyGoal({ goal: 9, cycle: REST7 }), 3);   // out of range ignored
});

test("sanitize drops an invalid goal", () => {
  const { programme, changed } = sanitizeProgramme({ sessions: {}, cycle: REST7, goal: "lots" });
  assert.equal(changed, true);
  assert.equal(programme.goal, undefined);
});

test("combined sessions round-trip; a single session keeps its plain key", () => {
  assert.equal(comboKey(["chest", "triceps"]), "chest+triceps");
  assert.equal(comboKey(["back"]), "back");
  assert.deepEqual(comboParts("chest+triceps"), ["chest", "triceps"]);
  assert.deepEqual(comboParts("quick"), ["quick"]);
});

test("an exercise picked in a combined workout is remembered under the right session", () => {
  const prog = { sessions: {
    chest: { ...S("Chest"), exercises: [{ id: "flat-db-press", target: "Chest" }] },
    triceps: { ...S("Triceps"), exercises: [] },
    push: { ...S("Push"), exercises: [{ id: "x", target: "Shoulders" }] } } };
  assert.equal(homeSessionFor(prog, ["chest", "triceps"], "flat-db-press", "Chest"), "chest");
  assert.equal(homeSessionFor(prog, ["chest", "triceps"], "skull-crushers", "Triceps"), "triceps");
  assert.equal(homeSessionFor(prog, ["chest", "push"], "arnold-press", "Shoulders"), "push");
  assert.equal(homeSessionFor(prog, ["chest", "triceps"], "plank", "Core"), "chest");
});
