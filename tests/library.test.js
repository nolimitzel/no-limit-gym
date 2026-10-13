import { test } from "node:test";
import assert from "node:assert/strict";
import { EXERCISE_LIBRARY, MUSCLE_GROUPS, libExercise } from "../src/data/exerciseLibrary.js";

test("library: every key is unique and every exercise has a known group", () => {
  const keys = EXERCISE_LIBRARY.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length, "duplicate keys: " + keys.filter((k, i) => keys.indexOf(k) !== i));
  for (const e of EXERCISE_LIBRARY) {
    assert.ok(MUSCLE_GROUPS.includes(e.group), e.key + " has unknown group " + e.group);
    assert.ok(e.name && e.sets >= 1 && e.reps, e.key + " is incomplete");
    assert.equal(!!e.cardio, e.group === "Cardio", e.key + " cardio flag must match its group");
  }
});

test("library: the original exercise keys still resolve (logged history carries over)", () => {
  for (const k of ["incline-db-press", "barbell-row", "db-shoulder-press", "smith-squat", "tricep-pushdown", "hiit"]) assert.ok(libExercise(k), k);
});

test("library: broad enough to cover a full gym", () => {
  assert.ok(EXERCISE_LIBRARY.length >= 180);
  for (const g of MUSCLE_GROUPS) assert.ok(EXERCISE_LIBRARY.filter((e) => e.group === g).length >= 15, g);
});
