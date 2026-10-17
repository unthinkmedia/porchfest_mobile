import { validateGuide } from "./validate.mjs";
import { isArtistAct } from "../core.mjs";

export function scheduledProfiles(guide) {
  const profiles = new Map(guide.artists.map(artist => [artist.id, artist]));
  const scheduled = new Map();
  for (const set of guide.sets) {
    if (!isArtistAct(set.artistId)) continue;
    if (!scheduled.has(set.artistId)) {
      scheduled.set(set.artistId, profiles.get(set.artistId) ?? {
        id: set.artistId,
        name: set.name,
        genre: set.name.includes("Got Talent") ? "Community showcase" : "Genre to be announced",
        tipUrl: null,
        links: [],
      });
    }
  }
  return [...scheduled.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function updateArtist(latest, original, artistId, fields) {
  if (!isArtistAct(artistId)) {
    throw new Error("This community agenda entry is not editable in the artist desk. Use Agenda & porches instead.");
  }
  const before = original.artists.find(artist => artist.id === artistId);
  const current = latest.artists.find(artist => artist.id === artistId);
  const setsFor = guide => guide.sets.filter(set => set.artistId === artistId);
  if (!setsFor(original).length || !setsFor(latest).length) {
    throw new Error("This artist is no longer on the agenda. Reload the artist list before editing.");
  }
  if (JSON.stringify(before) !== JSON.stringify(current)
    || JSON.stringify(setsFor(original)) !== JSON.stringify(setsFor(latest))) {
    throw new Error("This artist was changed by another editor. Your draft is still here. Reload the artist list to review the latest version before saving.");
  }
  const result = structuredClone(latest);
  let artist = result.artists.find(item => item.id === artistId);
  if (!artist) {
    artist = { ...scheduledProfiles(original).find(item => item.id === artistId) };
    result.artists.push(artist);
  }
  artist.name = fields.name.trim();
  artist.genre = fields.genre.trim();
  artist.tipUrl = fields.tipUrl.trim() || null;
  artist.links = fields.links.split(/\r?\n/).map(link => link.trim()).filter(Boolean);
  if (!before || artist.name !== before.name) {
    for (const set of result.sets) {
      if (set.artistId === artistId) set.name = artist.name;
    }
  }
  return validateGuide(result);
}

export function encodeGuide(guide) {
  const bytes = new TextEncoder().encode(`${JSON.stringify(guide, null, 2)}\n`);
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""));
}

export function decodeGuide(content) {
  const bytes = Uint8Array.from(atob(content.replace(/\s/g, "")), character => character.charCodeAt(0));
  return validateGuide(JSON.parse(new TextDecoder().decode(bytes)));
}
