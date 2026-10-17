import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventClock, scheduleState, formatTime, mapUrl, paymentLink, isArtistAct } from "../core.mjs";

const data = JSON.parse(readFileSync(new URL("../data.json", import.meta.url)));
const at = value => scheduleState(data, new Date(value));

test("only community agenda entries are excluded from artist tipping and editing", () => {
  assert.equal(isArtistAct("announcements-rutherford-s-got-talent"), false);
  assert.equal(isArtistAct("rutherford-s-got-talent"), false);
  for (const id of ["bob-stritch", "the-hungry-end", "juke-jams"]) {
    assert.equal(isArtistAct(id), true);
  }
});

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

test("HTTPS payment links support multiple services and label only exact known hosts", () => {
  for (const [url, service] of [
    ["https://venmo.com/porchfest-artist", "Venmo"],
    ["https://www.venmo.com/porchfest-artist", "Venmo"],
    ["https://account.venmo.com/u/porchfest-artist", "Venmo"],
    ["https://cash.app/$example-artist", "Cash App"],
    ["https://paypal.me/example-artist", "PayPal"],
    ["https://www.paypal.com/donate/?hosted_button_id=EXAMPLE", "PayPal"],
    ["https://enroll.zellepay.com/qr-codes?data=EXAMPLE", "Zelle"],
    ["https://www.zelle.com/qr-codes?data=EXAMPLE", "Zelle"],
    ["https://artist.example/tip", null],
    ["https://venmo.com.evil.example/artist", null],
    ["https://constructor/tip", null],
  ]) {
    assert.deepEqual(paymentLink(url), { url, service });
  }
  for (const value of [null, "", 42, "not a URL", "javascript:alert(1)", "mailto:artist@example.com",
    "tel:+15555550123", "http://venmo.com/a", "https://user:pass@cash.app/$artist",
    "https://venmo.com/", "https://cash.app/"]) {
    assert.equal(paymentLink(value), null);
  }
});

test("published data uses an explicit public-field allowlist", () => {
  assert.equal(data.porches.length, 8);
  assert.equal(data.sets.length, 25);
  assert.ok(data.artists.length > 0);
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
