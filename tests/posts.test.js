import { test } from "node:test";
import assert from "node:assert/strict";
import { missingPosts } from "../src/core/posts.js";

const nameOf = (k) => ({ chest: "Chest", "chest+triceps": "Chest + Triceps", back: "Back" }[k] || k);
const since = "2026-10-06";
const logs = [
  { date: "2026-10-13", session: "chest", entries: { a: [{ w: 30, r: 8 }] } },              // posted the old way
  { date: "2026-10-15", session: "chest+triceps", entries: { a: [{ w: 30, r: 8 }] }, done: false }, // never finished
  { date: "2026-10-16", session: "back", entries: { b: [{ w: 50, r: 10 }] }, done: true, posted: true }, // "posted" but the insert failed
  { date: "2026-10-17", session: "back", entries: {} },                                     // opened, nothing logged
  { date: "2026-09-20", session: "chest", entries: { a: [{ w: 25, r: 8 }] } },              // too old to backfill
];

test("finds workouts the squad never saw: unfinished, failed post — not empty or old ones", () => {
  const posts = [{ created_at: "2026-10-13T18:05:00Z", data: { title: "Chest" } }];
  const miss = missingPosts(logs, posts, { since, nameOf });
  assert.deepEqual(miss.map((l) => l.date + " " + l.session), ["2026-10-15 chest+triceps", "2026-10-16 back"]);
});

test("a workout already posted (new exact key) is never posted twice", () => {
  const posts = [
    { created_at: "2026-10-13T18:05:00Z", data: { title: "Chest" } },
    { created_at: "2026-10-20T09:00:00Z", data: { title: "Chest + Triceps", date: "2026-10-15", key: "chest+triceps" } },
    { created_at: "2026-10-20T09:00:01Z", data: { title: "Back", date: "2026-10-16", key: "back" } },
  ];
  assert.equal(missingPosts(logs, posts, { since, nameOf }).length, 0);
});

test("two different workouts on the same day each need their own post", () => {
  const two = [
    { date: "2026-10-18", session: "chest", entries: { a: [{ w: 1, r: 1 }] } },
    { date: "2026-10-18", session: "back", entries: { b: [{ w: 1, r: 1 }] } },
  ];
  const posts = [{ created_at: "2026-10-18T10:00:00Z", data: { title: "Chest", date: "2026-10-18", key: "chest" } }];
  assert.deepEqual(missingPosts(two, posts, { since, nameOf }).map((l) => l.session), ["back"]);
});
