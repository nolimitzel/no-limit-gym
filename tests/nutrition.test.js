import { test } from "node:test";
import assert from "node:assert/strict";
import { foodMacros, mealTotals, suppAdherence } from "../src/core/nutrition.js";
import { FOOD_LIBRARY, FOOD_CATS, libFood, STARTER_MEALS } from "../src/data/foods.js";
import { SUPP_LIBRARY, SUPP_CATS, ESSENTIALS, libSupp } from "../src/data/supplements.js";

test("food macros scale from per-100 g", () => {
  const m = foodMacros({ kcal: 165, p: 31, c: 0, f: 3.6 }, 150);
  assert.equal(Math.round(m.kcal), 248);
  assert.equal(Math.round(m.protein), 47);
});

test("a meal totals its foods, and a portion scales every gram", () => {
  const items = [{ key: "chicken-breast", g: 150 }, { key: "rice-white", g: 250 }];
  const one = mealTotals(items, libFood);
  assert.deepEqual(one, { kcal: 573, protein: 53, carbs: 70, fats: 6 });
  const half = mealTotals(items, libFood, 0.5);
  assert.equal(half.kcal, 286);
  assert.equal(mealTotals([{ key: "nope", g: 100 }], libFood).kcal, 0);   // unknown foods are skipped
});

test("supplement adherence counts ticked days for the stack only", () => {
  const macros = [{ date: "2026-10-13", supps: ["creatine", "vit-d3"] }, { date: "2026-10-14", supps: ["creatine", "ashwagandha"] }];
  assert.deepEqual(suppAdherence(macros, ["2026-10-13", "2026-10-14", "2026-10-15"], ["creatine", "vit-d3"]),
    { creatine: 2, "vit-d3": 1 });
});

test("food library is sane: unique keys, known categories, plausible energy", () => {
  const keys = FOOD_LIBRARY.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const f of FOOD_LIBRARY) {
    assert.ok(FOOD_CATS.includes(f.cat), f.key);
    assert.ok(f.portion > 0, f.key);
    // energy ≈ 4p + 4c + 9f (within a generous margin — fibre/alcohol/rounding)
    const est = 4 * f.p + 4 * f.c + 9 * f.f;
    assert.ok(Math.abs(est - f.kcal) <= Math.max(30, f.kcal * 0.2), `${f.key}: ${f.kcal} vs ~${Math.round(est)}`);
  }
  for (const m of STARTER_MEALS) for (const [k] of m.items) assert.ok(libFood(k), "starter uses unknown food " + k);
});

test("supplement library: unique keys, known categories, essentials exist", () => {
  const keys = SUPP_LIBRARY.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const s of SUPP_LIBRARY) assert.ok(SUPP_CATS.includes(s.cat), s.key);
  for (const k of ESSENTIALS) assert.ok(libSupp(k), k);
});
