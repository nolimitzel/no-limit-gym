import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeDB, mergeCustom, mergeRecords } from "../src/core/sync.js";

const log = (date, session, entries, extra = {}) => ({ date, session, entries, ...extra });

test("C1: a workout saved locally but never pushed survives a launch (regression: Repro 2)", () => {
  const local = { logs: [log("2026-10-13", "back", { "barbell-row": [{ w: 99, r: 1 }] }, { synced: false })] };
  const cloud = { logs: [] };
  const out = mergeDB(local, cloud);
  assert.equal(out.logs.length, 1);
  assert.equal(out.logs[0].synced, false, "must stay pending so it is re-pushed");
});

test("C1: meals are preserved when the cloud copy has only totals (regression: Repro 1)", () => {
  const local = { macros: [{ date: "2026-10-13", kcal: 111, protein: 11, carbs: 0, fats: 0, synced: true,
    meals: [{ name: "Breakfast", kcal: 111, protein: 11 }] }] };
  const cloud = { macros: [{ date: "2026-10-13", kcal: 111, protein: 11, carbs: 0, fats: 0 }] };
  const out = mergeDB(local, cloud);
  assert.deepEqual(out.macros[0].meals, [{ name: "Breakfast", kcal: 111, protein: 11 }]);
});

test("C1: device settings are never wiped by the cloud (regression: install hint returned)", () => {
  const out = mergeDB({ settings: { hideInstall: true } }, { settings: {} });
  assert.equal(out.settings.hideInstall, true);
});

test("legacy record identical to the cloud becomes synced (no push storm)", () => {
  const e = { "barbell-row": [{ w: 60, r: 8 }], "pull-up": [{ w: 0, r: 10 }] };
  const eReordered = { "pull-up": [{ w: "0", r: "10" }], "barbell-row": [{ w: 60, r: 8 }] };
  const r = mergeRecords([log("2026-10-01", "back", e)], [log("2026-10-01", "back", eReordered)],
    (l) => l.date + "|" + l.session, { same: (a, b) => JSON.stringify(Object.keys(a.entries).sort()) === JSON.stringify(Object.keys(b.entries).sort()) });
  assert.equal(r.pending.length, 0);
});

test("legacy record that differs from the cloud is kept and queued (never silently discarded)", () => {
  const out = mergeDB({ logs: [log("2026-10-01", "back", { "barbell-row": [{ w: 62.5, r: 8 }] })] },
                      { logs: [log("2026-10-01", "back", { "barbell-row": [{ w: 60, r: 8 }] })] });
  assert.equal(out.logs[0].entries["barbell-row"][0].w, 62.5);
  assert.equal(out.logs[0].synced, false);
});

test("C5: a synced record absent from a (possibly truncated) cloud read is kept and re-pushed, never deleted", () => {
  const out = mergeDB({ logs: [log("2026-10-01", "back", { x: [{ w: 1, r: 1 }] }, { synced: true })] }, { logs: [] });
  assert.equal(out.logs.length, 1);
  assert.equal(out.logs[0].synced, false);
});

test("cloud is authoritative for already-synced records (multi-device update)", () => {
  const out = mergeDB({ body: [{ date: "2026-10-01", weight: 72, synced: true }] },
                      { body: [{ date: "2026-10-01", weight: 73 }] });
  assert.equal(out.body[0].weight, 73);
  assert.equal(out.body[0].synced, true);
});

test("H5: custom exercises created before migrate_10 survive an empty cloud library", () => {
  const local = [{ key: "cx-1", name: "Test Cable Fly", group: "Chest" }];
  const r = mergeCustom(local, []);
  assert.equal(r.records.length, 1);
  assert.deepEqual(r.pending, ["cx-1"]);
});

test("merged output is sorted by date", () => {
  const out = mergeDB({ logs: [log("2026-10-05", "a", {}, { synced: false })] },
                      { logs: [log("2026-10-01", "b", {})] });
  assert.deepEqual(out.logs.map((l) => l.date), ["2026-10-01", "2026-10-05"]);
});
