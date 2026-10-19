import { test } from "node:test";
import assert from "node:assert/strict";
import { offlineBootSession } from "../src/core/boot.js";

const stored = { user: { id: "u1" }, refresh_token: "r", expires_at: 1 };
const netErr = { name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" };

test("offline relaunch with an expired token boots from the stored session", () => {
  assert.equal(offlineBootSession({ session: null, error: netErr, stored, online: true }), stored);
  assert.equal(offlineBootSession({ session: null, error: null, stored, online: false }), stored);
});

test("a live session always wins", () => {
  assert.equal(offlineBootSession({ session: { user: { id: "u1" } }, error: null, stored, online: false }), null);
});

test("a session the server rejected is never resurrected", () => {
  const revoked = { name: "AuthApiError", status: 400, message: "Invalid Refresh Token: Refresh Token Not Found" };
  assert.equal(offlineBootSession({ session: null, error: revoked, stored, online: true }), null);
});

test("signed out (nothing stored) goes to login, online or not", () => {
  assert.equal(offlineBootSession({ session: null, error: netErr, stored: null, online: false }), null);
  assert.equal(offlineBootSession({ session: null, error: netErr, stored: { user: {} }, online: false }), null);
});
