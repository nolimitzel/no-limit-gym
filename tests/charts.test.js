import { test } from "node:test";
import assert from "node:assert/strict";
import { countTicks, columnChart, lineChart } from "../src/ui/charts.js";

test("countTicks always reaches the top value with whole numbers (QA D1)", () => {
  for (let top = 0; top <= 30; top++) {
    const t = countTicks(top);
    assert.equal(t[0], 0);
    assert.ok(t[t.length - 1] >= Math.max(1, top), `top ${top} → ${t}`);
    assert.ok(t.every(Number.isInteger));
    assert.ok(t.length <= 6);
  }
  assert.deepEqual(countTicks(7), [0, 2, 4, 6, 8]);
});

test("column chart keeps bars and the goal line inside the plot", () => {
  const bars = Array.from({ length: 12 }, (_, i) => ({ y: i === 11 ? 7 : 3, label: "w" + i, current: i === 11, tip: ["x"] }));
  const svg = columnChart(bars, { goal: 7, goalLabel: "Goal 7" });
  const ys = [...svg.matchAll(/ y1="([\d.]+)"/g)].map((m) => +m[1]);
  assert.ok(ys.every((y) => y >= 16 - 0.01), "nothing above the plot top");   // pT = 16
  const paths = [...svg.matchAll(/ V([\d.]+) Q/g)].map((m) => +m[1]);
  assert.ok(paths.every((y) => y >= 16), "bar tops inside the plot");
});

test("a flat line gets no stray 'best' marker; fewer than 2 points draws nothing", () => {
  const flat = lineChart([{ y: 5, label: "a", tip: [] }, { y: 5, label: "b", tip: [] }, { y: 5, label: "c", tip: [] }], { markMax: true });
  assert.ok(!flat.includes(">best<"));
  assert.equal(lineChart([{ y: 1, label: "a", tip: [] }]), "");
});

test("labels are escaped inside the chart and its data attribute", () => {
  const out = lineChart([{ y: 1, label: '<b>"x"&', tip: ['<img src=x>'] }, { y: 2, label: "b", tip: [] }]);
  assert.ok(!out.includes("<b>\"x\""));
  assert.ok(!out.includes("<img"));
});
