import { scheduleState, formatTime, mapUrl, paymentLink } from "./core.mjs";

const main = document.querySelector("#main");
let data;
let lastPage;
let lastStateKey;

const escape = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
const timeRange = set => `${formatTime(set.start)} &ndash; ${formatTime(set.end)}`;
const artistFor = set => data.artists.find(artist => artist.id === set.artistId);
const scheduledArtists = () => data.artists.filter(artist => data.sets.some(set => set.artistId === artist.id));
const porchFor = set => data.porches.find(porch => porch.id === set.porchId);
const external = (url, label, className = "") =>
  `<a class="${className}" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${label}<span class="sr-only"> (opens in a new tab)</span></a>`;
const mapLink = porch => external(mapUrl(porch), `Map to ${escape(porch.name)} <span aria-hidden="true">&#8599;</span>`, "map-link");

function tipContent(artist, showFallback = true) {
  const link = paymentLink(artist?.tipUrl);
  return link
    ? external(link.url, `Tip ${escape(artist.name)}${link.service ? ` on ${escape(link.service)}` : ""} &#8599;`, "button tip-button")
    : showFallback ? `<p class="jar-note"><span aria-hidden="true">&#9825;</span> No digital tipping link shared. Please leave a tip in the artist's jar at the porch.</p>` : "";
}

function setCard(set, live = false, tip = false) {
  const artist = artistFor(set);
  const porch = porchFor(set);
  return `<article class="set-card${live ? " is-live" : ""}">
    <div class="card-top"><span class="time">${timeRange(set)}</span>${live ? '<span class="live-pill">PLAYING NOW</span>' : ""}</div>
    <h3>${escape(set.name)}</h3>
    <p class="genre">${escape(artist?.genre ?? (set.name.includes("Got Talent") ? "Community showcase" : "Genre to be announced"))}</p>
    <div class="card-bottom"><span class="porch-name">${escape(porch.name)}</span>${mapLink(porch)}</div>
    ${tip ? tipContent(artist) : ""}
  </article>`;
}

function intro(eyebrow, title, description) {
  return `<div class="page-intro"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${description}</p></div>`;
}

function home(state) {
  const firstSetTime = formatTime(Math.min(...data.sets.map(set => set.start)));
  const status = state.finished ? "That's a wrap. What a day."
    : state.before ? "See you Saturday, October 17."
      : state.current.length ? "The neighborhood is making music."
        : "Take a breath. Find your next porch.";
  const current = state.current.length
    ? `<div class="cards">${state.current.map(set => setCard(set, true)).join("")}</div>`
    : `<div class="empty-state"><span aria-hidden="true">&#9835;</span><div><h3>${state.finished ? "Thanks for listening." : state.before ? "The porches are warming up." : "A little break between sets."}</h3>
      <p>${state.finished ? "You can still discover the artists and send a little love." : state.before ? `Music starts at ${firstSetTime} on October 17. On festival day, this spot follows the music in real time.` : "No scheduled set is playing right now. The next performances are below."}</p></div></div>`;
  return `<section class="hero">
    <div class="hero-copy"><p class="eyebrow">OCTOBER 17, 2026 &middot; RUTHERFORD, NJ</p>
      <h1>Your town.<br>Your <em>soundtrack.</em></h1>
      <p>One Saturday. ${data.porches.length} porches.<br>A whole neighborhood of good music.</p>
      <a class="button dark-button" href="#agenda">Find your next favorite &#8599;</a>
    </div>
  </section>
  <div class="day-strip"><span class="status-dot"></span><strong>${status}</strong><span class="eastern">ALL TIMES EASTERN</span></div>
  <section class="section" aria-labelledby="now-title"><div class="section-heading"><div><p class="eyebrow">FOLLOW THE MUSIC</p><h2 id="now-title">Who's playing now</h2></div><a href="#agenda" class="text-link">Full agenda &#8599;</a></div>${current}<p class="small-note">Scheduled set times, refreshed automatically. Actual performances may run differently.</p></section>
  <section class="section" aria-labelledby="next-title"><div class="section-heading"><div><p class="eyebrow">YOUR NEXT STOP</p><h2 id="next-title">${state.before ? "First up on the porches" : "Up next"}</h2></div>${state.next.length ? `<span class="next-time">${formatTime(state.next[0].start)}</span>` : ""}</div>
    ${state.next.length ? `<div class="cards">${state.next.map(set => setCard(set)).join("")}</div><p class="small-note">Tap a map link to find the porch. Map searches use the location names supplied by the organizers.</p>` : '<p class="empty-copy">That was the last set! Keep the music going in the artist directory.</p>'}</section>
  <section class="generosity"><span class="heart" aria-hidden="true">&#9825;</span><div><p class="eyebrow">FREE MUSIC. REAL GENEROSITY.</p><h2>They bring the music.<br>We bring the love.</h2><p>Every artist is donating their time. If a song makes your day, show a little appreciation: a tip in the jar, a digital tip when shared, or a follow goes a long way.</p><a class="button dark-button" href="#support">Donate / tip an artist &#9825;</a></div></section>
  <a class="directory-banner" href="#artists"><span><span class="eyebrow">TAKE THE MUSIC HOME</span><strong>Meet the artists</strong><span>Genres, music, and the links they've shared.</span></span><span aria-hidden="true">&#8599;</span></a>`;
}

function agenda(state) {
  const groups = [...new Set(data.sets.map(set => set.start))].sort((a, b) => a - b);
  const first = formatTime(groups[0]);
  const last = formatTime(Math.max(...data.sets.map(set => set.end)));
  return `${intro("THE WHOLE NEIGHBORHOOD, ONE DAY", "The full agenda.", `Saturday, October 17 &middot; ${first} &ndash; ${last}. All times Eastern. Pick a sound, find a porch, stay awhile.`)}
    <div class="notice">A free day of music, made possible by artists donating their time. Please bring a little something for the tip jars.</div>
    <div class="agenda">${groups.map((start, index) => {
      const previousEnd = index ? Math.max(...data.sets.filter(set => set.start === groups[index - 1]).map(set => set.end)) : null;
      const gap = previousEnd !== null && start - previousEnd >= 15;
      return `${gap ? `<p class="walk-break"><span aria-hidden="true">&#8594;</span> ${formatTime(previousEnd)} &ndash; ${formatTime(start)} &middot; Walk to the next porches</p>` : ""}
        <section class="agenda-group" aria-label="${formatTime(start)} performances"><h2 class="agenda-time">${formatTime(start)}</h2><div class="cards">${data.sets.filter(set => set.start === start).map(set => setCard(set, state.current.some(current => current.id === set.id))).join("")}</div></section>`;
    }).join("")}</div>`;
}

function linkLabel(url) {
  const payment = paymentLink(url);
  if (payment?.service) return payment.service;
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host.includes("instagram")) return "Instagram";
  if (host.includes("youtu")) return "Watch";
  if (host.includes("spotify")) return "Spotify";
  if (host.includes("bandcamp")) return "Bandcamp";
  if (host.includes("facebook")) return "Facebook";
  if (host.includes("tiktok")) return "TikTok";
  return host;
}

function artistCard(artist) {
  const sets = data.sets.filter(set => set.artistId === artist.id);
  return `<article class="artist-card" data-artist="${escape(artist.id)}">
    <div class="artist-monogram" aria-hidden="true">${escape(artist.name.replace(/^the /i, "").slice(0, 1))}</div>
    <div class="artist-details"><h2>${escape(artist.name)}</h2><p class="genre">${escape(artist.genre)}</p>
    <p class="artist-slot">${sets.map(set => `${formatTime(set.start)} &middot; ${escape(porchFor(set).name)}`).join("<br>")}</p>
    <div class="artist-links">${artist.links.length ? artist.links.map(url => external(url, `${escape(linkLabel(url))} &#8599;`)).join("") : '<span class="small-note">No direct music or social links shared yet.</span>'}</div>
    ${tipContent(artist, false)}
    </div></article>`;
}

function artists() {
  const lineup = scheduledArtists();
  return `${intro("DISCOVER SOMEONE GOOD", "Meet the artists.", "Meet the artists on the agenda who shared their information. Follow them, listen again, and keep the neighborhood's music going.")}
    <label class="search-label" for="artist-search">Find an artist or genre</label>
    <input id="artist-search" class="search" type="search" placeholder="Try a band name, rock, folk..." autocomplete="off">
    <p id="artist-count" class="small-note" role="status">${lineup.length} artist profile${lineup.length === 1 ? "" : "s"}</p>
    <div class="artist-grid" id="artist-list">${lineup.map(artistCard).join("")}</div>
    <p id="no-artists" class="empty-copy" hidden>No artists match that search. Try another name or genre.</p>`;
}

function support(state) {
  const featured = state.current.length ? state.current : state.next;
  return `${intro("A LITTLE LOVE GOES A LONG WAY", "Tip the talent.", "The music is free because these artists are generously donating their time. Help make it a good day for them, too.")}
    <div class="support-message"><span class="heart" aria-hidden="true">&#9825;</span><div><h2>Look for the tip jar.</h2><p>Cash at the porch is always a lovely way to say thanks. When an artist shares a digital tipping link, you'll find it here. Tips go directly to the artist, not to this website. Check the recipient in your payment app before sending.</p></div></div>
    ${featured.length ? `<section class="section"><div class="section-heading"><h2>${state.current.length ? "Show the current artists some love" : state.before ? "First artists to cheer on" : "Coming up next"}</h2></div><div class="cards">${featured.map(set => setCard(set, state.current.includes(set), true)).join("")}</div></section>` : ""}
    <section class="section"><div class="section-heading"><h2>Find an artist to thank</h2></div><p class="small-note">All scheduled acts, with digital tipping links when provided. Otherwise, visit their porch's tip jar.</p>
    <div class="tip-list">${[...new Map(data.sets.map(set => [set.artistId, set])).values()].map(set =>
      `<article class="tip-row"><div><h3>${escape(set.name)}</h3><p>${escape(porchFor(set).name)}</p></div>${tipContent(artistFor(set))}</article>`
    ).join("")}</div></section>`;
}

function wireSearch() {
  const input = document.querySelector("#artist-search");
  if (!input) return;
  input.addEventListener("input", () => {
    const query = input.value.trim().toLocaleLowerCase();
    let count = 0;
    for (const artist of scheduledArtists()) {
      const match = `${artist.name} ${artist.genre}`.toLocaleLowerCase().includes(query);
      document.querySelector(`[data-artist="${artist.id}"]`).hidden = !match;
      if (match) count++;
    }
    document.querySelector("#artist-count").textContent = `${count} artist profile${count === 1 ? "" : "s"}`;
    document.querySelector("#no-artists").hidden = count !== 0;
  });
}

function render(navigation = false) {
  const requested = location.hash.slice(1) || "home";
  const page = ["home", "agenda", "artists", "support"].includes(requested) ? requested : "home";
  // Keep search text, focus, and scroll intact while visitors browse artist profiles.
  if (!navigation && page === "artists" && lastPage === "artists") return;
  const state = scheduleState(data);
  const stateKey = JSON.stringify([page, state.before, state.finished,
    state.current.map(set => set.id), state.next.map(set => set.id)]);
  if (!navigation && stateKey === lastStateKey) return;
  main.innerHTML = { home: () => home(state), agenda: () => agenda(state), artists, support: () => support(state) }[page]();
  for (const link of document.querySelectorAll("[data-page]")) {
    if (link.dataset.page === page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  document.title = `${{ home: "Your pocket guide", agenda: "Full agenda", artists: "Artist directory", support: "Donate / tip" }[page]} | Rutherford Porchfest`;
  wireSearch();
  if (navigation) {
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  lastPage = page;
  lastStateKey = stateKey;
}

async function start() {
  try {
    const response = await fetch("./data.json");
    if (!response.ok) throw new Error(`Schedule request failed: ${response.status}`);
    data = await response.json();
    if (!data.event || !data.sets?.length || !data.porches?.length || !Array.isArray(data.artists)) {
      throw new Error("The schedule is incomplete.");
    }
    render();
    window.addEventListener("hashchange", () => render(true));
    window.setInterval(() => render(), 30_000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
  } catch (error) {
    console.error("Unable to load the festival guide:", error);
    main.innerHTML = `<section class="page-intro" role="alert"><h1>A little technical intermission.</h1><p>We couldn't load the schedule. Check your connection and reload to try again.</p><button class="button dark-button" id="retry">Try again</button></section>`;
    document.querySelector("#retry").addEventListener("click", () => location.reload());
  }
}

start();
