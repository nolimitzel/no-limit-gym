import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSupersets, linkSuperset, unlinkSuperset, supersetLabels } from "../src/core/superset.js";

const ex = (...ids) => ids.map((id) => ({ id }));
const order = (l) => l.map((e) => e.id).join(",");
const groups = (l) => l.map((e) => e.ss || "-").join(",");

test("link pairs two exercises and moves the partner next to the anchor", () => {
  const l = linkSuperset(ex("a", "b", "c", "d"), "a", "d");
  assert.equal(order(l), "a,d,b,c");
  assert.equal(groups(l), "ss1,ss1,-,-");
});

test("linking onto a group adds after its last member (tri-set)", () => {
  let l = linkSuperset(ex("a", "b", "c"), "a", "b");
  l = linkSuperset(l, "a", "c");
  assert.equal(order(l), "a,b,c");
  assert.equal(groups(l), "ss1,ss1,ss1");
  const lab = supersetLabels(l);
  assert.deepEqual(lab.c, { letter: "A", pos: 3, size: 3, last: true });
  assert.equal(lab.a.last, false);
});

test("two separate supersets get letters A and B in list order", () => {
  let l = linkSuperset(ex("a", "b", "c", "d"), "a", "b");
  l = linkSuperset(l, "c", "d");
  const lab = supersetLabels(l);
  assert.equal(lab.a.letter + lab.b.letter + lab.c.letter + lab.d.letter, "AABB");
  assert.notEqual(l[0].ss, l[2].ss);
});

test("unlink from a pair dissolves it; from a tri-set keeps the other two", () => {
  const pair = unlinkSuperset(linkSuperset(ex("a", "b"), "a", "b"), "a");
  assert.equal(groups(pair), "-,-");
  assert.equal(order(pair), "a,b");
  let tri = linkSuperset(linkSuperset(ex("a", "b", "c"), "a", "b"), "a", "c");
  tri = unlinkSuperset(tri, "b");
  assert.equal(order(tri), "a,c,b");
  assert.equal(groups(tri), "ss1,ss1,-");
});

test("normalize drops lone members and splits non-adjacent repeats", () => {
  assert.equal(groups(normalizeSupersets([{ id: "a", ss: "ss1" }, { id: "b" }])), "-,-");
  const l = normalizeSupersets([{ id: "a", ss: "x" }, { id: "b", ss: "x" }, { id: "c" }, { id: "d", ss: "x" }, { id: "e", ss: "x" }]);
  assert.equal(l[0].ss, l[1].ss);
  assert.equal(l[3].ss, l[4].ss);
  assert.notEqual(l[0].ss, l[3].ss);
  assert.equal(l[2].ss, undefined);
});

test("removing an exercise from the list leaves a valid state", () => {
  const l = linkSuperset(ex("a", "b", "c"), "a", "b");
  assert.equal(groups(normalizeSupersets(l.filter((e) => e.id !== "b"))), "-,-");
});

test("bad input is safe", () => {
  assert.equal(order(linkSuperset(ex("a"), "a", "a")), "a");
  assert.equal(order(linkSuperset(ex("a", "b"), "a", "zzz")), "a,b");
  assert.equal(order(unlinkSuperset(ex("a"), "a")), "a");
  assert.deepEqual(supersetLabels(null), {});
});
