# Rutherford Porchfest

A mobile-first guide for October 17, 2026, in Rutherford, New Jersey.

**Website:** https://unthinkmedia.github.io/porchfest_mobile/

The home page follows the published set times in `America/New_York`, showing
simultaneous performances and the next time slot, with a map link for each porch.
Before festival day it shows the first set; during breaks it shows no live acts;
after the final set it shows a thank-you. The agenda, searchable artist directory,
and tipping page are linked in the bottom navigation.

Artists donate their time. Tipping uses an artist-provided HTTPS payment link when
one has been supplied; otherwise visitors are directed to the artist's porch tip
jar. Juke Jams' organizer-provided Venmo is `https://venmo.com/jukejams`.
Mark P Presti Jr.'s is `https://venmo.com/Mark-Presti-1`.
Paul Rosevear's is `https://venmo.com/Paul-Rosevear`.
Missing genres are explicitly
marked as to be announced, not inferred. The artist directory, its count, and its
search results include only profiles matching an act on the current agenda.
Unscheduled submissions are not displayed.

## Poster palette

The site uses colors sampled from the Rutherford Porchfest 2026 map poster:
navy `#10284a`, burgundy `#751b24`, olive `#6c712f`, mustard gold `#b2a433`,
terracotta `#9e4130`, map gray `#f7f7f7`, and white `#ffffff`.
Compressed artwork colors are approximate. Supporting muted text, borders, and
pale olive surfaces are adapted for readable web contrast; gold is a background
accent, not small text on white. Palette tokens live in `styles.css`.

## Local development

No build step or JavaScript dependencies are required:

```sh
python3 -m http.server 8765
```

Open http://localhost:8765. Main files: `index.html`, `styles.css`, `app.mjs`,
`core.mjs`, and `data.json`. Use an HTTP server rather than opening the HTML
directly, because the guide fetches its data.

## Schedule and privacy

`data.json` is the public guide, editable through the organizer desk or GitHub.
It is not a live connection to the registration spreadsheet.
**Never commit or publish the workbook:** it contains
contact information and internal organizer notes.

To refresh from an organizer-provided XLSX export stored outside this repository:

```sh
python3 tools/import_schedule.py /absolute/path/to/private-workbook.xlsx
```

The importer reads only the schedule and artist name, genre, music/video links,
and social links. It excludes contacts, phone numbers, email addresses, equipment,
registration answers, and internal notes. It removes production/availability
annotations from names and merges duplicate profiles. Review the generated diff
before publishing, especially any newly supplied links. The import stops for
review if the schedule no longer has the expected 8 porches and 25 sets.

If an artist supplies a payment URL separately, set their `tipUrl` in `data.json`
to their exact HTTPS payment link. Do not guess handles. Reapply separately
provided tipping links after refreshing the snapshot. Map searches use the
organizers' location names plus Rutherford, NJ; exact porch addresses have not
been independently verified.

## Organizer desk

Open https://unthinkmedia.github.io/porchfest_mobile/admin/ and sign in with the
approved `unthinkmedia` GitHub account. Authentication is hosted at
`https://porchfest-github-auth.rutherford-porchfest.workers.dev`.
The free, MIT-licensed Decap CMS 3.14.1 bundle is self-hosted in
`admin/vendor/` with its license; there is no third-party CMS script at login.

The editor manages the artists (including payment/tipping URLs), public links, porches
and map search addresses, and agenda sets in `data.json`. A draft preview shows
sets with their times, locations, genres, and tipping information. The event name,
date, and timezone are fixed for this edition. For times, enter whole minutes
after midnight Eastern: 11 AM = 660; 1:45 PM = 825; 5:15 PM = 1035.

Keep existing IDs unchanged; when adding an artist or porch, give it a unique
lowercase ID and use that ID in the agenda. Missing references, duplicate IDs,
invalid or unsafe URLs, unexpected fields, and overlapping sets on the same porch
block publishing. Blank payment fields become `null`, keeping the tip-jar fallback.
Only artists on the agenda appear in the public directory.

Each artist currently has one primary payment link. Venmo, Cash App, PayPal, and
recognized Zelle domains receive service-specific button labels; other HTTPS
links receive a generic tip button. This checks URL format, not recipient ownership.
Always verify the recipient with the artist. Zelle requires an artist-provided
shareable HTTPS link; a raw phone number or email is not a link and is not
published. Never enter bank account details. Payments happen on the provider's
site or app, not on this website.

**Publish** commits to `main`; Pages usually takes about a minute to update.
Drafts and preview are not live. Avoid editing the same guide simultaneously
with another organizer, and reload before making a new edit. For rollback, revert
the relevant data commit in GitHub rather than overwriting unrelated work.

Only public information belongs in this editor. The admin URL and its code are
public; GitHub authorization, not a hidden URL, controls writing. Authorized
users retain the underlying repository permissions they have in GitHub.

### One-time Cloudflare + GitHub authentication setup

1. In `auth-worker/`, run `npm ci`, `npx wrangler login --device`, then
   `npx wrangler deploy`. Select your own Cloudflare account if prompted. This
   creates a Worker only; no database, paid plan, or custom domain is required.
   Use a free Workers plan and configure usage limits in your account as needed.
2. Copy the deployed HTTPS Worker origin (without a trailing slash).
   In GitHub **Settings > Developer settings > OAuth Apps > New OAuth App**, using
   the `unthinkmedia` account, register:
   application name **Rutherford Porchfest Organizer Desk**;
   homepage `https://unthinkmedia.github.io/porchfest_mobile/admin/`;
   authorization callback **your exact Worker origin + `/callback`**.
3. Run `npx wrangler secret put GITHUB_CLIENT_ID` and
   `npx wrangler secret put GITHUB_CLIENT_SECRET` from `auth-worker/`.
   Enter the OAuth app's values at the terminal prompts. Never put secrets,
   access tokens, or a filled `.dev.vars` file in GitHub, browser code, or chat.
   **Client ID** is the identifier labeled Client ID in the GitHub app settings,
   not the homepage or callback URL. `/health` checks configuration presence and
   format; only a real sign-in verifies that the ID and secret match the OAuth app.
   `.dev.vars.example` is a template only; local `.dev.vars` is ignored.
4. Set `authBaseUrl` in `admin/settings.json` to the deployed Worker origin,
   such as `https://porchfest-github-auth.YOUR-SUBDOMAIN.workers.dev`.
   Visit `/health` on that Worker: it must report that authentication is configured.
   Commit the public settings change and push to `main`.
5. Open `/admin/`, choose **Login with GitHub**, and sign in as `unthinkmedia`.
   Check a harmless draft change and its preview, then publish it. Confirm the
   commit in GitHub and the resulting public guide before using it at the event.

The OAuth app requests `public_repo`, GitHub's OAuth scope for writing public
repositories; this is broader than this one repository. Review the GitHub consent
screen. The Worker additionally restricts login to `ADMIN_LOGINS` (initially
`unthinkmedia`) and verifies push permission on `unthinkmedia/porchfest_mobile`.
To add an organizer, grant them GitHub repository write access, add their login
to the comma-separated `ADMIN_LOGINS` in `auth-worker/wrangler.jsonc`, and redeploy.
To remove access, remove both their repository access and their allowed login.
Revoke the OAuth app grant in GitHub to invalidate its existing tokens.

Sign-in uses random short-lived HttpOnly state cookies, PKCE, fixed callback
paths, and a fixed-origin popup handshake. The OAuth client secret stays in
Cloudflare. Decap keeps the resulting GitHub access token in browser local
storage; only use trusted organizer devices, log out when finished, and revoke
the OAuth grant if a device is lost. No tokens are placed in callback URLs or logs.
The Worker is an auth bridge, not an artist self-service service: private editing
links for individual artists are not implemented.

## Checks

```sh
node --test tests/*.test.mjs auth-worker/worker.test.mjs
python3 -m unittest discover -s tests -p '*_test.py'
```

`tests/browser.py` uses Python Playwright against http://127.0.0.1:8765 by default
(override with `PORCHFEST_TEST_URL`). Set `PORCHFEST_BROWSER_CHANNEL=chrome`
or `msedge` to use an already-installed browser instead of bundled Chromium.
It checks phone/tablet/desktop layouts,
time-aware states, all pages, search, maps, payment-service labels and tip-jar behavior, and loading
errors. Set `PORCHFEST_ARTIFACTS` to choose a screenshot output directory.
`tests/admin-browser.py` verifies the setup screen, real CMS login startup,
draft preview, lossless publishing, and invalid-draft protection using intercepted
GitHub requests and fake credentials; it never writes to the real repository.
Run it against the same local HTTP server. Worker unit tests mock GitHub; they
do not prove a real OAuth app is connected. `cd auth-worker && npx wrangler deploy
--dry-run` checks the Worker bundle without deploying resources.

## Publishing

GitHub Pages serves the repository root from the `main` branch. Update
the files and push to `main` to publish changes at the same URL (and QR code).
Keep asset URLs relative so they work under the `/porchfest_mobile/` project path.