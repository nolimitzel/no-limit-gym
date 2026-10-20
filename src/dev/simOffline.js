/* DEV-ONLY test switch: simulate "no signal" for the offline-relaunch test.
   localStorage["nl-sim-offline"] = "1" makes every request to Supabase fail
   like a dead connection. The Supabase clients look up window.fetch at call time,
   so this just needs to run before the first request. `import.meta.env.DEV`
   is false in production builds, so this compiles to nothing there. */
if (import.meta.env.DEV && localStorage.getItem("nl-sim-offline") === "1") {
  const real = window.fetch.bind(window);
  window.fetch = (input, init) =>
    /supabase\.co/.test(String(input && input.url ? input.url : input))
      ? Promise.reject(new TypeError("Failed to fetch"))
      : real(input, init);
  console.warn("[NO LIMIT dev] simulating offline: all Supabase requests fail");
}
