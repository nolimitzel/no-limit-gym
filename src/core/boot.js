/* Pure boot decisions (no I/O, unit-tested in tests/boot.test.js).

   Offline relaunch: access tokens last ~1 hour. Opening the app with no signal
   after that, the auth client can't refresh the token, so getSession() returns
   no session and the app used to show the login screen — the user's workouts
   were still on the device but unreachable (and nothing new could be logged)
   until the network came back. The signed-in session is still in storage, so
   when the failure is a NETWORK failure we boot from it; the auth client
   refreshes it as soon as the connection returns. A session the server actually
   rejected (revoked / signed out) is never resurrected. */

const isNetworkError = (error) => !!error && (
  error.name === "AuthRetryableFetchError" || error.status === 0 ||
  /fetch|network|load failed|offline/i.test(error.message || ""));

export function offlineBootSession({ session, error, stored, online }) {
  if (session) return null;                                   // normal sign-in path
  if (!stored || !stored.user || !stored.user.id || !stored.refresh_token) return null;
  return !online || isNetworkError(error) ? stored : null;
}
