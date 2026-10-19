/* DEV-ONLY test switch: simulate "no signal" for the offline-relaunch test.
   localStorage["nl-sim-offline"] = "1" makes every request to Supabase fail
   like a dead connection. Must load before the Supabase client is created (it
   captures fetch then), so main.js imports this first. `import.meta.env.DEV`
   is false in production builds, so this compiles to nothing there. */
if (import.meta.env.DEV && localStorage.getItem("nl-sim-offline") === "1") {
  const real = window.fetch.bind(window);
  window.fetch = (input, init) =>
    /supabase\.co/.test(String(input && input.url ? input.url : input))
      ? Promise.reject(new TypeError("Failed to fetch"))
      : real(input, init);
  console.warn("[NO LIMIT dev] simulating offline: all Supabase requests fail");
}
