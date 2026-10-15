import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateGuide } from "../admin/validate.mjs";
import { editorConfig } from "../admin/config.mjs";

const original = JSON.parse(readFileSync(new URL("../data.json", import.meta.url)));
const changed = action => {
  const data = structuredClone(original);
  action(data);
  return data;
};

test("valid guide round-trips without losing known tipping links or other fields", () => {
  assert.deepEqual(validateGuide(original), original);
  const data = changed(d => {
    d.artists[0].tipUrl = "";
    d.artists[0].links = null;
  });
  const result = validateGuide(data);
  assert.equal(result.artists[0].tipUrl, null);
  assert.deepEqual(result.artists[0].links, []);
  assert.equal(data.artists[0].tipUrl, "");
});

test("reject unsafe or malformed tips, private fields, duplicate IDs and broken references", () => {
  const cases = [
    [d => d.artists[0].tipUrl = "http://cash.app/$artist", /HTTPS payment link/],
    [d => d.artists[0].tipUrl = "https://venmo.com/", /HTTPS payment link/],
    [d => d.artists[0].tipUrl = "https://someone:secret@venmo.com/user", /credentials/],
    [d => d.artists[0].links = ["javascript:alert(1)"], /HTTP/],
    [d => d.artists[0].contactEmail = "private@example.com", /unexpected field/],
    [d => d.artists[0].id = d.artists[1].id, /duplicate ID/],
    [d => d.sets[0].porchId = "missing-porch", /does not exist/],
    [d => d.sets[0].artistId = "typo-artist", /no profile/],
    [d => d.sets[0].end = d.sets[0].start, /end after the start/],
    [d => d.sets[0].start = 1.5, /whole minutes/],
    [d => d.event.date = "2026-10-18", /fixed/],
    [d => d.artists = [], /at least one/],
  ];
  for (const [mutate, error] of cases) assert.throws(() => validateGuide(changed(mutate)), error);
});

test("accept artist-provided payment links without changing the public schema", () => {
  for (const tipUrl of [
    "https://cash.app/$example-artist", "https://paypal.me/example-artist",
    "https://enroll.zellepay.com/qr-codes?data=EXAMPLE", "https://artist.example/tips",
  ]) {
    const data = changed(d => { d.artists[0].tipUrl = tipUrl; });
    assert.deepEqual(validateGuide(data), data);
  }
});

test("allow simultaneous porches but not overlapping sets on the same porch", () => {
  assert.doesNotThrow(() => validateGuide(original));
  const data = changed(d => {
    d.sets[1].start = d.sets[0].end - 1;
  });
  assert.throws(() => validateGuide(data), /overlaps/);
});

test("the CMS only edits the public guide on main and preserves IDs and event metadata", () => {
  const config = editorConfig("https://auth.example.workers.dev");
  assert.equal(config.backend.repo, "unthinkmedia/porchfest_mobile");
  assert.equal(config.backend.branch, "main");
  assert.equal(config.backend.auth_scope, "public_repo");
  assert.equal(config.publish_mode, "simple");
  const files = config.collections.flatMap(collection => collection.files);
  assert.deepEqual(files.map(file => file.file), ["data.json"]);
  assert.equal(files[0].format, "json");
  assert.equal(files[0].fields.find(field => field.name === "event").widget, "hidden");
});
