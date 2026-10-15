import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "./worker.mjs";

const env = {
  SITE_ORIGIN: "https://unthinkmedia.github.io",
  REPOSITORY: "unthinkmedia/porchfest_mobile",
  ADMIN_LOGINS: "unthinkmedia",
  GITHUB_CLIENT_ID: "test-client-id",
  GITHUB_CLIENT_SECRET: "test-client-secret",
};
const base = "https://porchfest-github-auth.example.workers.dev";
const begin = () => handleRequest(new Request(`${base}/auth?provider=github&site_id=unthinkmedia.github.io`), env);

async function session() {
  const response = await begin();
  const target = new URL(response.headers.get("Location"));
  const cookie = response.headers.get("Set-Cookie").split(";")[0];
  return {
    cookie, target,
    request: new Request(`${base}/callback?code=test-code&state=${target.searchParams.get("state")}`, {
      headers: { Cookie: cookie },
    }),
  };
}

function upstream({ login = "unthinkmedia", push = true, tokenError = false } = {}) {
  const calls = [];
  return {
    calls,
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url === "https://github.com/login/oauth/access_token") {
        return Response.json(tokenError ? { error: "bad_verification_code" } : { access_token: "test-access-token" });
      }
      if (url === "https://api.github.com/user") return Response.json({ login });
      if (url === "https://api.github.com/repos/unthinkmedia/porchfest_mobile") {
        return Response.json({ permissions: { push } });
      }
      throw new Error(`Unexpected upstream request: ${url}`);
    },
  };
}

test("auth only accepts the configured site and uses secure, short-lived state and PKCE", async () => {
  const { cookie, target } = await session();
  assert.equal(target.origin, "https://github.com");
  assert.equal(target.searchParams.get("scope"), "public_repo");
  assert.equal(target.searchParams.get("redirect_uri"), `${base}/callback`);
  assert.equal(target.searchParams.get("code_challenge_method"), "S256");
  const verifier = cookie.split(".")[1];
  const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
  assert.equal(target.searchParams.get("code_challenge"), challenge);
  const response = await begin();
  for (const attribute of ["Secure", "HttpOnly", "SameSite=Lax", "Max-Age=600", "Path=/"]) {
    assert.ok(response.headers.get("Set-Cookie").includes(attribute));
  }
  const denied = await handleRequest(new Request(`${base}/auth?provider=github&site_id=attacker.example`), env);
  assert.equal(denied.status, 400);
  assert.equal(denied.headers.get("Location"), null);
});

test("missing or mismatched state cannot reach token exchange", async () => {
  const mock = upstream();
  const { cookie } = await session();
  for (const headers of [{}, { Cookie: cookie }]) {
    const response = await handleRequest(new Request(`${base}/callback?code=test-code&state=wrong`, { headers }), env, mock.fetch);
    const html = await response.text();
    assert.ok(html.includes("session expired or did not match"));
    assert.ok(!html.includes("test-access-token"));
    assert.ok(response.headers.get("Set-Cookie").includes("Max-Age=0"));
  }
  assert.equal(mock.calls.length, 0);
});

test("successful sign-in checks account and repo access before returning a token to a fixed origin", async () => {
  const { request, cookie } = await session();
  const mock = upstream();
  const response = await handleRequest(request, env, mock.fetch);
  const html = await response.text();
  assert.equal(mock.calls.length, 3);
  const form = mock.calls[0].options.body;
  assert.equal(form.get("client_secret"), env.GITHUB_CLIENT_SECRET);
  assert.equal(form.get("code_verifier"), cookie.split(".")[1]);
  assert.ok(html.includes("test-access-token"));
  assert.ok(html.includes('const target = "https://unthinkmedia.github.io"'));
  assert.ok(html.includes("event.source !== window.opener"));
  assert.ok(html.includes("event.origin !== target"));
  assert.ok(html.includes("event.data !=="));
  assert.ok(!html.includes(env.GITHUB_CLIENT_SECRET));
  assert.ok(!html.includes("postMessage(\"*\""));
  assert.match(response.headers.get("Content-Security-Policy"), /script-src 'nonce-[\w-]+'/);
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("unapproved accounts and users without repo write access receive no token", async () => {
  for (const options of [{ login: "another-user" }, { push: false }]) {
    const { request } = await session();
    const mock = upstream(options);
    const response = await handleRequest(request, env, mock.fetch);
    const html = await response.text();
    assert.ok(html.includes("authorization:github:error:"));
    assert.ok(!html.includes("test-access-token"));
  }
});

test("cancellation, invalid codes, and upstream errors fail explicitly", async () => {
  const { request } = await session();
  const response = await handleRequest(request, env, upstream({ tokenError: true }).fetch);
  assert.ok((await response.text()).includes("GitHub rejected"));
  const { target, cookie } = await session();
  const denied = await handleRequest(new Request(
    `${base}/callback?error=access_denied&state=${target.searchParams.get("state")}`,
    { headers: { Cookie: cookie } },
  ), env);
  assert.ok((await denied.text()).includes("canceled or denied"));
});

test("fail closed on missing configuration and unsupported routes or methods", async () => {
  assert.equal((await handleRequest(new Request(`${base}/health`), {})).status, 503);
  assert.equal((await handleRequest(new Request(`${base}/auth`, { method: "POST" }), env)).status, 405);
  assert.equal((await handleRequest(new Request(`${base}/anything`), env)).status, 404);
  assert.equal((await handleRequest(new Request("http://localhost/auth"), env)).status, 400);
  assert.equal((await handleRequest(new Request(`${base}/health`), env)).status, 200);
});
