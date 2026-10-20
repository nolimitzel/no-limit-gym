import { test } from "node:test";
import assert from "node:assert/strict";
import { spotifyLink } from "../src/core/playlist.js";

test("playlist link with tracking params", () => {
  const l = spotifyLink("https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP?si=abc123");
  assert.equal(l.type, "playlist");
  assert.equal(l.id, "37i9dQZF1DX76Wlfdnj7AP");
  assert.equal(l.url, "https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP");
  assert.equal(l.embed, "https://open.spotify.com/embed/playlist/37i9dQZF1DX76Wlfdnj7AP");
});

test("intl prefix, album and spotify: URI", () => {
  assert.equal(spotifyLink("https://open.spotify.com/intl-de/album/4aawyAB9vmqN3uQ7FjRGTy").type, "album");
  assert.equal(spotifyLink("spotify:playlist:37i9dQZF1DX76Wlfdnj7AP").id, "37i9dQZF1DX76Wlfdnj7AP");
});

test("non-Spotify and look-alike links are rejected", () => {
  assert.equal(spotifyLink("https://music.apple.com/gb/playlist/x/pl.123"), null);
  assert.equal(spotifyLink("https://youtube.com/playlist?list=PL123"), null);
  assert.equal(spotifyLink("https://open.spotify.com.evil.com/playlist/37i9dQZF1DX76Wlfdnj7AP"), null);
  assert.equal(spotifyLink("https://open.spotify.com/user/someone"), null);
  assert.equal(spotifyLink(""), null);
  assert.equal(spotifyLink(null), null);
});
