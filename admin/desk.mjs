import { formatTime } from "../core.mjs";
import { scheduledProfiles, updateArtist, encodeGuide, decodeGuide } from "./artists.mjs";

const $ = selector => document.querySelector(selector);
const repository = "https://api.github.com/repos/unthinkmedia/porchfest_mobile";
const storageKey = "decap-cms-user";
const form = $("#artist-form");
const status = $("#desk-status");
const errorBox = $("#desk-error");
let authBaseUrl;
let token;
let guide;
let selectedId;
let initialFields;
let busy = false;

const fields = () => Object.fromEntries(["name", "genre", "tipUrl", "links"]
  .map(name => [name, form.elements.namedItem(name).value]));
const dirty = () => Boolean(initialFields && JSON.stringify(fields()) !== JSON.stringify(initialFields));

function showError(error) {
  console.error("Organizer desk:", error.message);
  errorBox.textContent = error.message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function updateDraft() {
  const changed = dirty();
  $("#save-artist").disabled = busy || !changed;
  $("#cancel-edit").disabled = busy || !changed;
  $("#draft-status").textContent = changed ? "Unsaved changes" : "No unsaved changes";
}

function setBusy(value) {
  busy = value;
  $("#login").disabled = busy || !authBaseUrl;
  $("#logout").disabled = busy;
  $("#reload-artists").disabled = busy;
  $("#artist-fields").disabled = busy;
  $("#guide-link").setAttribute("aria-disabled", String(busy));
  for (const button of $("#profile-list").querySelectorAll("button")) button.disabled = busy;
  updateDraft();
}

async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("Could not reach GitHub. Your draft is still here. Check your connection or browser extensions, then try again.");
  }
  if (!response.ok) {
    const messages = {
      401: "GitHub sign-in expired. Copy any unsaved changes, then log out and sign in again.",
      403: "GitHub denied access or its API limit was reached. Check repository write access and try again later.",
      404: "GitHub could not find the guide or this account cannot access the repository.",
      409: "The guide changed while saving. Your draft is still here. Try saving again; conflicting artist edits require a reload.",
      422: "GitHub rejected the save. Your draft is still here. Reload the artist list and review the latest guide.",
    };
    throw new Error(messages[response.status] ?? `GitHub request failed (${response.status}). Your draft has not been cleared.`);
  }
  return response.json();
}

async function readGuide() {
  const file = await api(`${repository}/contents/data.json?ref=main`);
  if (!file.sha || file.encoding !== "base64" || typeof file.content !== "string") {
    throw new Error("GitHub returned an unexpected guide format. No changes have been saved.");
  }
  return { data: decodeGuide(file.content), sha: file.sha };
}

function renderList() {
  const artists = scheduledProfiles(guide);
  const query = $("#artist-filter").value.trim().toLocaleLowerCase();
  $("#profile-count").textContent = `${artists.length} artists`;
  const buttons = artists.filter(artist => `${artist.name} ${artist.genre}`.toLocaleLowerCase().includes(query)).map(artist => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "profile-button";
    button.dataset.artist = artist.id;
    button.setAttribute("aria-current", String(artist.id === selectedId));
    button.disabled = busy;
    const name = document.createElement("strong");
    name.textContent = artist.name;
    const genre = document.createElement("span");
    genre.textContent = artist.genre;
    button.append(name, genre);
    button.addEventListener("click", () => {
      if (artist.id !== selectedId && canDiscard()) selectArtist(artist.id, true);
    });
    return button;
  });
  $("#profile-list").replaceChildren(...buttons);
  $("#empty-search").hidden = buttons.length > 0;
}

function selectArtist(id, focus = false) {
  const artist = scheduledProfiles(guide).find(item => item.id === id);
  if (!artist) throw new Error("Choose an artist on the current agenda.");
  clearError();
  selectedId = id;
  $("#choose-artist").hidden = true;
  form.hidden = false;
  $("#artist-heading").textContent = artist.name;
  $("#artist-slots").textContent = guide.sets.filter(set => set.artistId === id)
    .sort((a, b) => a.start - b.start)
    .map(set => `${formatTime(set.start)} - ${formatTime(set.end)} / ${guide.porches.find(porch => porch.id === set.porchId).name}`)
    .join("\n");
  const values = { name: artist.name, genre: artist.genre, tipUrl: artist.tipUrl ?? "", links: artist.links.join("\n") };
  for (const [name, value] of Object.entries(values)) form.elements.namedItem(name).value = value;
  initialFields = fields();
  renderList();
  updateDraft();
  if (focus) {
    $("#artist-heading").focus({ preventScroll: true });
    if (matchMedia("(max-width: 760px)").matches) $("#artist-heading").scrollIntoView({ block: "start" });
  }
}

function canDiscard() {
  return !dirty() || window.confirm("Discard your unsaved artist changes?");
}

async function authenticate(user) {
  if (typeof user?.token !== "string" || !user.token) throw new Error("No valid GitHub sign-in was received. Please sign in again.");
  token = user.token;
  status.textContent = "Connecting to GitHub and loading the agenda...";
  const identity = await api("https://api.github.com/user");
  if (typeof identity.login !== "string" || !identity.login) throw new Error("GitHub did not return a valid account. Please sign in again.");
  const repo = await api(repository);
  if (!repo.permissions?.push) throw new Error("This GitHub account needs write access to the Porchfest repository.");
  const loaded = await readGuide();
  localStorage.setItem(storageKey, JSON.stringify({ token, backendName: "github", login: identity.login }));
  guide = loaded.data;
  $("#sign-in").hidden = true;
  $("#workspace").hidden = false;
  $("#logout").hidden = false;
  $("#guide-link").hidden = false;
  status.textContent = `Signed in as ${identity.login}. Only artist profiles on the agenda are listed.`;
  renderList();
}

function authorize() {
  const url = new URL("/auth", authBaseUrl);
  url.search = new URLSearchParams({ provider: "github", site_id: location.hostname });
  const popup = window.open(url.href, "porchfest-github-login", "width=640,height=760");
  if (!popup) return Promise.reject(new Error("The sign-in popup was blocked. Allow popups for this site and try again."));
  return new Promise((resolve, reject) => {
    function finish(error, user) {
      window.removeEventListener("message", receive);
      clearInterval(closed);
      clearTimeout(timeout);
      popup.close();
      if (error) reject(error);
      else resolve(user);
    }
    function receive(event) {
      if (event.origin !== authBaseUrl || event.source !== popup) return;
      if (event.data === "authorizing:github") {
        popup.postMessage("authorizing:github", authBaseUrl);
        return;
      }
      if (typeof event.data !== "string") return;
      const success = "authorization:github:success:";
      const failure = "authorization:github:error:";
      if (!event.data.startsWith(success) && !event.data.startsWith(failure)) return;
      try {
        const ok = event.data.startsWith(success);
        const result = JSON.parse(event.data.slice(ok ? success.length : failure.length));
        finish(ok ? null : new Error(result.message || "GitHub sign-in failed."), result);
      } catch {
        finish(new Error("The sign-in response could not be read. Please try again."));
      }
    }
    const closed = setInterval(() => {
      if (popup.closed) finish(new Error("The sign-in window was closed. Please try again."));
    }, 500);
    const timeout = setTimeout(() => finish(new Error("Sign-in timed out. Please try again.")), 600_000);
    window.addEventListener("message", receive);
  });
}

$("#login").addEventListener("click", async () => {
  clearError();
  setBusy(true);
  status.textContent = "Complete GitHub sign-in in the popup window.";
  try {
    await authenticate(await authorize());
  } catch (error) {
    status.textContent = "Sign-in did not finish.";
    showError(error);
  } finally {
    setBusy(false);
  }
});

$("#logout").addEventListener("click", () => {
  if (!canDiscard()) return;
  try {
    localStorage.removeItem(storageKey);
  } catch {
    showError(new Error("Could not clear the saved sign-in. Clear this site's browser data to log out."));
    return;
  }
  initialFields = null;
  token = null;
  location.reload();
});

$("#guide-link").addEventListener("click", event => {
  if (busy || !canDiscard()) event.preventDefault();
  else initialFields = null;
});
$("#artist-filter").addEventListener("input", renderList);
form.addEventListener("input", updateDraft);
$("#cancel-edit").addEventListener("click", () => {
  if (canDiscard()) {
    clearError();
    selectArtist(selectedId);
  }
});

$("#reload-artists").addEventListener("click", async () => {
  if (!canDiscard()) return;
  clearError();
  setBusy(true);
  try {
    const loaded = await readGuide();
    guide = loaded.data;
    initialFields = null;
    if (scheduledProfiles(guide).some(artist => artist.id === selectedId)) selectArtist(selectedId);
    else {
      selectedId = null;
      form.hidden = true;
      $("#choose-artist").hidden = false;
      renderList();
    }
    status.textContent = "Artist list reloaded from GitHub.";
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || !dirty()) return;
  clearError();
  const draft = fields();
  const id = selectedId;
  setBusy(true);
  status.textContent = "Checking the latest guide and saving to GitHub...";
  try {
    updateArtist(guide, guide, id, draft);
    const latest = await readGuide();
    const updated = updateArtist(latest.data, guide, id, draft);
    const saved = await api(`${repository}/contents/data.json`, {
      method: "PUT",
      body: JSON.stringify({
        message: `Update ${updated.artists.find(artist => artist.id === id).name} via organizer desk`,
        content: encodeGuide(updated), sha: latest.sha, branch: "main",
      }),
    });
    if (!saved.commit?.sha || !saved.content?.sha) {
      throw new Error("GitHub did not confirm the saved revision. Your draft is still here. Reload the artist list to check before retrying.");
    }
    guide = updated;
    selectArtist(id);
    status.textContent = "Saved to GitHub. The public guide will update after GitHub Pages deploys.";
  } catch (error) {
    status.textContent = "Save did not finish. Your draft has been kept.";
    showError(error);
  } finally {
    setBusy(false);
  }
});

window.addEventListener("beforeunload", event => {
  if (dirty()) {
    event.preventDefault();
    event.returnValue = "";
  }
});

async function start() {
  const response = await fetch("./settings.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to read editor settings (${response.status}).`);
  const settings = await response.json();
  if (!settings.authBaseUrl) {
    status.textContent = "GitHub sign-in is not connected yet. An organizer must configure the authentication Worker.";
    return;
  }
  const origin = new URL(settings.authBaseUrl);
  if (origin.protocol !== "https:" || origin.origin !== settings.authBaseUrl) {
    throw new Error("The authentication URL must be a bare HTTPS origin without a trailing slash.");
  }
  authBaseUrl = origin.origin;
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    let user;
    try { user = JSON.parse(saved); } catch { throw new Error("Saved sign-in could not be read. Clear this site's saved data and sign in again."); }
    await authenticate(user);
  } else {
    status.textContent = "Ready to sign in. Use your approved organizer GitHub account.";
  }
}

setBusy(true);
start().catch(error => {
  status.textContent = "The artist desk could not connect.";
  showError(error);
}).finally(() => setBusy(false));
