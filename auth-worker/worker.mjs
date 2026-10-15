const COOKIE = "__Host-porchfest-oauth";
const GH_HEADERS = { Accept: "application/vnd.github+json", "User-Agent": "Rutherford-Porchfest-Auth" };
const securityHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000",
};
const clearCookie = `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function random() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

function config(env) {
  const origin = new URL(env.SITE_ORIGIN);
  if (origin.protocol !== "https:" || origin.origin !== env.SITE_ORIGIN
    || !/^[\w.-]+\/[\w.-]+$/.test(env.REPOSITORY ?? "")
    || !/^[A-Za-z0-9_-]+$/.test(env.GITHUB_CLIENT_ID ?? "") || !env.GITHUB_CLIENT_SECRET
    || !env.ADMIN_LOGINS?.trim()) {
    throw new Error("Authentication service configuration is incomplete.");
  }
  return {
    origin: origin.origin,
    logins: new Set(env.ADMIN_LOGINS.split(",").map(login => login.trim().toLowerCase()).filter(Boolean)),
  };
}

function text(body, status = 200, extra = {}) {
  return new Response(body, {
    status, headers: { ...securityHeaders, "Content-Type": "text/plain; charset=utf-8", ...extra },
  });
}

function resultPage(origin, result, success) {
  const nonce = random();
  const payload = JSON.stringify(`authorization:github:${success ? "success" : "error"}:${JSON.stringify(result)}`)
    .replaceAll("<", "\\u003c");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Porchfest sign-in</title><body><h1>${success ? "GitHub connected" : "Sign-in could not finish"}</h1>
<p id="status">${success ? "Returning to the organizer editor..." : "Return to the organizer editor to see the error and try again."}</p>
<script nonce="${nonce}">
const target = ${JSON.stringify(origin)};
if (window.opener) {
  const receive = event => {
    if (event.origin !== target || event.source !== window.opener || event.data !== "authorizing:github") return;
    window.removeEventListener("message", receive);
    window.opener.postMessage(${payload}, target);
  };
  window.addEventListener("message", receive);
  window.opener.postMessage("authorizing:github", target);
} else {
  document.getElementById("status").textContent = "This sign-in window must be opened from the organizer editor. Close it and try signing in again.";
}
</script></body></html>`;
  return new Response(html, {
    headers: {
      ...securityHeaders, "Content-Type": "text/html; charset=utf-8", "Set-Cookie": clearCookie,
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    },
  });
}

async function github(path, token, requestFetch) {
  const response = await requestFetch(`https://api.github.com${path}`, {
    headers: { ...GH_HEADERS, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GitHub permission check failed (${response.status}).`);
  return response.json();
}

export async function handleRequest(request, env, requestFetch = fetch) {
  const url = new URL(request.url);
  if (request.method !== "GET") return text("Method not allowed.", 405, { Allow: "GET" });
  if (url.protocol !== "https:") return text("HTTPS is required.", 400);
  if (!["/auth", "/callback", "/health"].includes(url.pathname)) return text("Not found.", 404);
  let settings;
  try {
    settings = config(env);
  } catch {
    return text("Authentication setup is incomplete. Ask the organizer to configure the Worker secrets and settings.", 503);
  }
  if (url.pathname === "/health") return text("Porchfest GitHub authentication is configured.");
  if (url.pathname === "/auth") {
    if (url.searchParams.get("provider") !== "github"
      || url.searchParams.get("site_id") !== new URL(settings.origin).host) {
      return text("Only the configured Porchfest site may start this sign-in flow.", 400);
    }
    const state = random();
    const verifier = random();
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    const target = new URL("https://github.com/login/oauth/authorize");
    target.search = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID, redirect_uri: `${url.origin}/callback`,
      scope: "public_repo", state, code_challenge: challenge, code_challenge_method: "S256",
    }).toString();
    return new Response(null, {
      status: 302, headers: {
        ...securityHeaders, Location: target.href,
        "Set-Cookie": `${COOKIE}=${state}.${verifier}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`,
      },
    });
  }
  const fail = message => resultPage(settings.origin, { message }, false);
  const cookie = (request.headers.get("Cookie") ?? "").split(";").map(value => value.trim())
    .find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const [state, verifier] = (cookie ?? "").split(".");
  if (!state || !verifier || !/^[\w-]{43}$/.test(state) || !/^[\w-]{43}$/.test(verifier)
    || state !== url.searchParams.get("state")) {
    return fail("Your sign-in session expired or did not match. Close this window and sign in again.");
  }
  if (url.searchParams.has("error")) return fail("GitHub sign-in was canceled or denied.");
  const code = url.searchParams.get("code");
  if (!code || code.length > 512) return fail("GitHub did not supply a valid sign-in code.");
  try {
    const response = await requestFetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET,
        code, state, redirect_uri: `${url.origin}/callback`, code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return fail("GitHub could not complete sign-in. Please try again.");
    const token = await response.json();
    if (!token.access_token || token.error) return fail("GitHub rejected the sign-in code. Please try again.");
    const user = await github("/user", token.access_token, requestFetch);
    if (!settings.logins.has(String(user.login).toLowerCase())) {
      return fail("This GitHub account is not an approved Porchfest organizer.");
    }
    const repository = await github(`/repos/${env.REPOSITORY}`, token.access_token, requestFetch);
    if (!repository.permissions?.push) return fail("Your GitHub account needs write access to the Porchfest repository.");
    return resultPage(settings.origin, { token: token.access_token, provider: "github" }, true);
  } catch {
    // Do not log upstream responses: they can contain tokens or sign-in codes.
    console.error("Porchfest OAuth failed during the GitHub token exchange or permission check.");
    return fail("Unable to reach GitHub or confirm repository access. Please try again.");
  }
}

export default { fetch: (request, env) => handleRequest(request, env) };
