import { editorConfig } from "./config.mjs";
import { validateGuide } from "./validate.mjs";
import { formatTime, paymentLink } from "../core.mjs";

const status = document.querySelector("#admin-status");
const message = document.querySelector("#admin-message");

async function startEditor() {
  const response = await fetch("./settings.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to read editor settings (${response.status}).`);
  const { authBaseUrl } = await response.json();
  if (!authBaseUrl) {
    message.textContent = "The editor is installed, but GitHub sign-in is not connected yet. An organizer must deploy the authentication Worker and configure its URL before publishing is available.";
    return;
  }
  const origin = new URL(authBaseUrl);
  if (origin.protocol !== "https:" || origin.origin !== authBaseUrl) {
    throw new Error("The authentication URL must be a bare HTTPS origin without a trailing slash.");
  }
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "./vendor/decap-cms.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("The CMS library could not load. Please reload to try again."));
    document.head.append(script);
  });
  const cms = window.CMS;
  cms.registerEventListener({
    name: "preSave",
    handler: ({ entry }) => {
      const data = entry.get("data");
      const normalized = validateGuide(data.toJS());
      return data.clear().merge(normalized);
    },
  });
  cms.registerPreviewStyle(new URL("../styles.css", location.href).href);
  cms.registerPreviewTemplate("guide", ({ entry }) => {
    const data = entry.get("data").toJS();
    const h = window.h;
    return h("main", { style: { padding: "24px" } },
      h("p", { className: "eyebrow" }, "UNPUBLISHED PREVIEW / ALL TIMES EASTERN"),
      h("h1", {}, "Your festival guide."),
      h("p", {}, "Publishing commits this guide to GitHub. The public site updates after Pages finishes deploying."),
      ...(data.sets ?? []).map(set => {
        const artist = (data.artists ?? []).find(item => item.id === set.artistId);
        const porch = (data.porches ?? []).find(item => item.id === set.porchId);
        const tip = paymentLink(artist?.tipUrl);
        return h("article", { key: set.id, className: "set-card", style: { marginBottom: "16px" } },
          h("p", { className: "time" }, `${formatTime(set.start)} – ${formatTime(set.end)}`),
          h("h3", {}, set.name), h("p", {}, porch?.name ?? "Choose a porch"),
          h("p", { className: "genre" }, artist?.genre ?? "Genre to be announced"),
          h("p", {}, tip ? `${tip.service ?? "Digital tip"}: ${tip.url}` : "Tip jar at the porch"),
        );
      }),
    );
  });
  cms.init({ config: { ...editorConfig(authBaseUrl), load_config_file: false } });
  status.hidden = true;
}

startEditor().catch(error => {
  console.error("Organizer editor could not start:", error);
  status.setAttribute("role", "alert");
  message.textContent = error.message;
});
