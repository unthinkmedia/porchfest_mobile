import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventClock, scheduleState, formatTime, mapUrl, venmoUrl } from "../core.mjs";

const data = JSON.parse(readFileSync(new URL("../data.json", import.meta.url)));
const at = value => scheduleState(data, new Date(value));

test("before festival day, show the first set without pretending it is live", () => {
  const state = at("2026-10-15T17:10:00Z");
  assert.equal(state.before, true);
  assert.equal(state.current.length, 0);
  assert.equal(state.next.length, 1);
  assert.equal(state.next[0].name, "Sianna & The Rosebuds");
  assert.equal(state.next[0].start, 660);
});

test("use the event's timezone, including midnight and visitors outside New Jersey", () => {
  assert.deepEqual(eventClock(new Date("2026-10-17T02:00:00Z"), data.event), {
    date: "2026-10-16", minute: 1320,
  });
  assert.equal(at("2026-10-17T04:00:00Z").clock.minute, 0);
  assert.equal(at("2026-10-17T14:59:00Z").current.length, 0);
  assert.equal(at("2026-10-17T15:00:00Z").current.length, 1);
});

test("show simultaneous sets and every porch in the next time slot", () => {
  const state = at("2026-10-17T17:10:00Z");
  assert.deepEqual(state.current.map(set => set.name), ["this just kim", "Joe Frame - solo guitar"]);
  assert.equal(state.next.length, 2);
  assert.ok(state.next.every(set => set.start === 825));
});

test("set end is exclusive; walk-over breaks never show stale performances", () => {
  const state = at("2026-10-17T16:50:00Z");
  assert.equal(state.current.length, 0);
  assert.equal(state.next.length, 2);
  assert.equal(state.next[0].start, 785);
  const nextSlot = at("2026-10-17T17:45:00Z");
  assert.ok(nextSlot.current.some(set => set.name === "Rory D'Lasnow"));
  assert.ok(nextSlot.current.every(set => set.start === 825));
});

test("after the last set and on later days, no sets are live or upcoming", () => {
  for (const date of ["2026-10-18T01:30:00Z", "2026-10-18T17:10:00Z"]) {
    const state = at(date);
    assert.equal(state.finished, true);
    assert.equal(state.current.length, 0);
    assert.equal(state.next.length, 0);
  }
});

test("format noon and evening times correctly and scope maps to Rutherford", () => {
  assert.equal(formatTime(660), "11:00 AM");
  assert.equal(formatTime(740), "12:20 PM");
  assert.equal(formatTime(1290), "9:30 PM");
  for (const porch of data.porches) {
    const url = new URL(mapUrl(porch));
    assert.equal(url.searchParams.get("api"), "1");
    assert.ok(url.searchParams.get("query").endsWith("Rutherford, NJ"));
    assert.ok(url.searchParams.get("query").includes(porch.name === "Felician" ? "Felician University" : porch.name));
  }
});

test("only real HTTPS Venmo hosts become tip links", () => {
  assert.equal(venmoUrl("https://venmo.com/porchfest-artist"), "https://venmo.com/porchfest-artist");
  for (const value of [null, "", "not a URL", "javascript:alert(1)", "https://venmo.com.evil.example/a", "http://venmo.com/a"]) {
    assert.equal(venmoUrl(value), null);
  }
});

test("published data uses an explicit public-field allowlist", () => {
  assert.equal(data.porches.length, 8);
  assert.equal(data.sets.length, 25);
  assert.equal(data.artists.length, 43);
  const ids = new Set(data.artists.map(artist => artist.id));
  assert.equal(ids.size, data.artists.length);
  assert.equal(new Set(data.sets.map(set => set.id)).size, data.sets.length);
  for (const artist of data.artists) {
    assert.deepEqual(Object.keys(artist).sort(), ["genre", "id", "links", "name", "tipUrl"]);
    assert.ok(!artist.name.includes("(Duplicate)"));
    assert.ok(!artist.name.includes("(PA)"));
    assert.notEqual(artist.name.toLowerCase(), "test");
    assert.notEqual(artist.genre.toLowerCase(), "male");
    for (const link of artist.links) assert.match(link, /^https?:\/\//);
  }
  for (const set of data.sets) {
    assert.ok(data.porches.some(porch => porch.id === set.porchId));
    assert.ok(set.start < set.end);
    assert.ok(set.start >= 660 && set.end <= 1290);
  }
  assert.ok(!JSON.stringify(data).match(/@(?:gmail|comcast|outlook)\./i));
});
