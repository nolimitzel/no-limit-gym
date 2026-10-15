/* Pure nutrition maths (no I/O, unit-tested in tests/nutrition.test.js).
   Foods are per 100 g; a meal is [{ key, g }]; logging a meal at a portion
   (½, 1, 1½ …) scales every gram. Results are rounded to whole numbers the way
   a person would log them. */

const r0 = (n) => Math.round(Number(n) || 0);

// macros for `g` grams of a food (per-100 g values)
export function foodMacros(food, g) {
  const k = (Number(g) || 0) / 100;
  return { kcal: food.kcal * k, protein: food.p * k, carbs: food.c * k, fats: food.f * k };
}

// totals for a list of { key, g } using a resolver key → food
export function mealTotals(items, resolve, portion = 1) {
  const t = { kcal: 0, protein: 0, carbs: 0, fats: 0 };
  for (const it of items || []) {
    const food = resolve(it.key);
    if (!food) continue;
    const m = foodMacros(food, (Number(it.g) || 0) * portion);
    t.kcal += m.kcal; t.protein += m.protein; t.carbs += m.carbs; t.fats += m.fats;
  }
  return { kcal: r0(t.kcal), protein: r0(t.protein), carbs: r0(t.carbs), fats: r0(t.fats) };
}

export const PORTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const portionLabel = (p) => ({ 0.5: "½", 0.75: "¾", 1: "1×", 1.25: "1¼", 1.5: "1½", 2: "2×" }[p] || p + "×");

// supplement consistency over a set of days: { key: daysTaken }
export function suppAdherence(macros, days, stack) {
  const out = Object.fromEntries((stack || []).map((k) => [k, 0]));
  for (const d of days) {
    const rec = (macros || []).find((m) => m.date === d);
    for (const k of (rec && rec.supps) || []) if (k in out) out[k]++;
  }
  return out;
}
