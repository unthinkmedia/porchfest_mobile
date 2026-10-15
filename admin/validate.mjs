import { paymentLink } from "../core.mjs";

const knownUnprofiledActs = new Set([
  "bob-stritch", "the-hungry-end",
  "announcements-rutherford-s-got-talent", "rutherford-s-got-talent",
]);

function checkKeys(value, required, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  for (const key of Object.keys(value)) {
    if (!required.includes(key)) throw new Error(`${label}: unexpected field "${key}". Do not add private information.`);
  }
  for (const key of required) {
    if (!(key in value)) throw new Error(`${label}: missing "${key}".`);
  }
}

function text(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} cannot be blank.`);
}

function url(value, label) {
  if (typeof value !== "string") throw new Error(`${label} must be a URL.`);
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${label} must be a valid URL.`); }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`${label} must be an HTTP(S) link without embedded credentials.`);
  }
}

function ids(items, label) {
  if (!Array.isArray(items) || !items.length) throw new Error(`${label} must contain at least one entry.`);
  const result = new Set();
  for (const item of items) {
    if (!item || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id)) throw new Error(`${label}: use a stable lowercase ID with hyphens.`);
    if (result.has(item.id)) throw new Error(`${label}: duplicate ID "${item.id}".`);
    result.add(item.id);
  }
  return result;
}

export function validateGuide(input) {
  // Work on a copy; optional CMS fields can serialize as empty strings or null.
  const data = structuredClone(input);
  checkKeys(data, ["event", "artists", "porches", "sets"], "Guide");
  checkKeys(data.event, ["name", "date", "timeZone"], "Event");
  if (data.event.name !== "Rutherford Porchfest" || data.event.date !== "2026-10-17"
    || data.event.timeZone !== "America/New_York") {
    throw new Error("The event identity, date, and timezone are fixed for this edition of the guide.");
  }
  const artistIds = ids(data.artists, "Artists");
  const porchIds = ids(data.porches, "Porches");
  ids(data.sets, "Agenda");
  for (const artist of data.artists) {
    artist.tipUrl ||= null;
    artist.links ||= [];
    checkKeys(artist, ["id", "name", "genre", "links", "tipUrl"], `Artist ${artist.id}`);
    text(artist.name, "Artist name");
    text(artist.genre, `${artist.name}: genre`);
    if (!Array.isArray(artist.links)) throw new Error(`${artist.name}: links must be a list.`);
    for (const link of artist.links) url(link, `${artist.name}: music or social link`);
    if (artist.tipUrl !== null) {
      url(artist.tipUrl, `${artist.name}: tipping URL`);
      if (!paymentLink(artist.tipUrl)) {
        throw new Error(`${artist.name}: supply the artist's full HTTPS payment link, or leave it blank.`);
      }
    }
  }
  for (const porch of data.porches) {
    checkKeys(porch, ["id", "name", "region", "mapQuery"], `Porch ${porch.id}`);
    for (const field of ["name", "region", "mapQuery"]) text(porch[field], `Porch ${porch.id}: ${field}`);
  }
  for (const set of data.sets) {
    checkKeys(set, ["id", "artistId", "name", "porchId", "start", "end"], `Set ${set.id}`);
    text(set.name, `Set ${set.id}: name`);
    if (!artistIds.has(set.artistId) && !knownUnprofiledActs.has(set.artistId)) {
      throw new Error(`${set.name}: artist ID "${set.artistId}" has no profile. Add the artist first, or correct the ID.`);
    }
    if (!porchIds.has(set.porchId)) throw new Error(`${set.name}: porch ID "${set.porchId}" does not exist.`);
    if (!Number.isInteger(set.start) || !Number.isInteger(set.end)
      || set.start < 0 || set.end > 1440 || set.start >= set.end) {
      throw new Error(`${set.name}: times must be whole minutes after midnight, with the end after the start.`);
    }
  }
  const ordered = [...data.sets].sort((a, b) => a.start - b.start);
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length && ordered[j].start < ordered[i].end; j++) {
      if (ordered[i].porchId === ordered[j].porchId) {
        throw new Error(`${ordered[i].name} overlaps ${ordered[j].name} on the same porch.`);
      }
    }
  }
  return data;
}
