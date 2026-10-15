import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateGuide } from "../admin/validate.mjs";
import { editorConfig } from "../admin/config.mjs";
import { scheduledProfiles, updateArtist, encodeGuide, decodeGuide } from "../admin/artists.mjs";

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

const draftFor = artist => ({
  name: artist.name, genre: artist.genre, tipUrl: artist.tipUrl ?? "", links: artist.links.join("\n"),
});

test("artist desk lists every scheduled act once, including missing profiles, without changing source records", () => {
  const snapshot = structuredClone(original);
  const profiles = scheduledProfiles(original);
  assert.equal(profiles.length, new Set(original.sets.map(set => set.artistId)).size);
  assert.deepEqual(new Set(profiles.map(artist => artist.id)), new Set(original.sets.map(set => set.artistId)));
  assert.ok(!profiles.some(artist => artist.id === "7th-street"));
  assert.deepEqual(original, snapshot);
  assert.ok(profiles.every(artist => original.sets.some(set => set.artistId === artist.id)));
  const repeated = structuredClone(original);
  repeated.sets.push(structuredClone(repeated.sets[0]));
  assert.equal(scheduledProfiles(repeated).length, profiles.length);
});

test("saving a missing profile creates it with the agenda ID and preserves unrelated edits", () => {
  const guide = changed(d => { d.artists = d.artists.filter(artist => artist.id !== "bob-stritch"); });
  const snapshot = structuredClone(guide);
  const bob = scheduledProfiles(guide).find(artist => artist.id === "bob-stritch");
  assert.deepEqual(bob, {
    id: "bob-stritch", name: "Bob Stritch", genre: "Genre to be announced", tipUrl: null, links: [],
  });
  const latest = structuredClone(guide);
  latest.artists[0].genre = "Another organizer's edit";
  const fields = { ...draftFor(bob), name: "Bob Stritch Updated", genre: "Folk", tipUrl: "https://cash.app/$example-artist" };
  const updated = updateArtist(latest, guide, bob.id, fields);
  assert.equal(updated.artists.length, guide.artists.length + 1);
  assert.deepEqual(updated.artists.at(-1), { ...bob, name: fields.name, genre: fields.genre, tipUrl: fields.tipUrl });
  assert.equal(updated.artists[0].genre, latest.artists[0].genre);
  assert.ok(updated.sets.filter(set => set.artistId === bob.id).every(set => set.name === fields.name));
  assert.deepEqual(guide, snapshot);
  const concurrent = structuredClone(guide);
  concurrent.artists.push({ ...bob, genre: "Added by another organizer" });
  assert.throws(() => updateArtist(concurrent, guide, bob.id, fields), /changed by another editor/);
  assert.throws(() => updateArtist(guide, concurrent, bob.id, fields), /changed by another editor/);
  const rescheduled = structuredClone(guide);
  rescheduled.sets.find(set => set.artistId === bob.id).start += 1;
  assert.throws(() => updateArtist(rescheduled, guide, bob.id, fields), /changed by another editor/);
});

test("saving artist details keeps IDs and all other data, and synchronizes agenda names", () => {
  const artist = original.artists.find(item => item.id === "juke-jams");
  const fields = { ...draftFor(artist), name: "Juke Jams Updated", tipUrl: "https://cash.app/$example-artist" };
  const updated = updateArtist(original, original, artist.id, fields);
  const expected = structuredClone(original);
  Object.assign(expected.artists.find(item => item.id === artist.id), { name: fields.name, tipUrl: fields.tipUrl });
  for (const set of expected.sets) if (set.artistId === artist.id) set.name = fields.name;
  assert.deepEqual(updated, expected);
  assert.equal(original.artists.find(item => item.id === artist.id).name, "Juke Jams");
});

test("concurrent unrelated edits are preserved; conflicting artist or agenda edits are rejected", () => {
  const artist = original.artists.find(item => item.id === "juke-jams");
  const fields = { ...draftFor(artist), tipUrl: "https://paypal.me/example-artist" };
  const latest = structuredClone(original);
  latest.artists[0].genre = "Updated by another organizer";
  assert.equal(updateArtist(latest, original, artist.id, fields).artists[0].genre, latest.artists[0].genre);
  latest.artists.find(item => item.id === artist.id).genre = "Conflicting genre";
  assert.throws(() => updateArtist(latest, original, artist.id, fields), /changed by another editor/);
  const rescheduled = structuredClone(original);
  rescheduled.sets.find(set => set.artistId === artist.id).start += 1;
  assert.throws(() => updateArtist(rescheduled, original, artist.id, fields), /changed by another editor/);
  const removed = structuredClone(original);
  removed.sets = removed.sets.filter(set => set.artistId !== artist.id);
  assert.throws(() => updateArtist(removed, original, artist.id, fields), /no longer on the agenda/);
});

test("artist drafts validate URLs, required fields, blank payments, and Unicode JSON encoding", () => {
  const artist = original.artists.find(item => item.id === "juke-jams");
  const fields = draftFor(artist);
  assert.throws(() => updateArtist(original, original, artist.id, { ...fields, tipUrl: "javascript:alert(1)" }), /HTTP/);
  assert.throws(() => updateArtist(original, original, artist.id, { ...fields, name: " " }), /cannot be blank/);
  const updated = updateArtist(original, original, artist.id, {
    ...fields, name: "Caf\u00e9 \ud83c\udfb5", tipUrl: "", links: "https://artist.example/music\nhttps://artist.example/social\n",
  });
  const saved = updated.artists.find(item => item.id === artist.id);
  assert.equal(saved.tipUrl, null);
  assert.equal(saved.links.length, 2);
  assert.deepEqual(decodeGuide(encodeGuide(updated)), updated);
});
