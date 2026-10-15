# Rutherford Porchfest

A mobile-first guide for October 17, 2026, in Rutherford, New Jersey.

**Website:** https://unthinkmedia.github.io/porchfest_mobile/

The home page follows the published set times in `America/New_York`, showing
simultaneous performances and the next time slot, with a map link for each porch.
Before festival day it shows the first set; during breaks it shows no live acts;
after the final set it shows a thank-you. The agenda, searchable artist directory,
and tipping page are linked in the bottom navigation.

Artists donate their time. Tipping uses a verified-format HTTPS Venmo link when
one has been supplied; otherwise visitors are directed to the artist's porch tip
jar. The current source contains no Venmo links. Missing genres are explicitly
marked as to be announced, not inferred. Artist submissions that are not on the
schedule are clearly labeled in the directory.

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

`data.json` is a reviewed public snapshot, not a live connection to the
registration spreadsheet. **Never commit or publish the workbook:** it contains
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

If an artist supplies a Venmo URL separately, set their `tipUrl` in `data.json`
to their exact `https://venmo.com/...` URL. Do not guess handles. Reapply separately
provided tipping links after refreshing the snapshot. Map searches use the
organizers' location names plus Rutherford, NJ; exact porch addresses have not
been independently verified.

## Checks

```sh
node --test tests/core.test.mjs
python3 -m unittest discover -s tests -p '*_test.py'
```

`tests/browser.py` uses Python Playwright against http://127.0.0.1:8765 by default
(override with `PORCHFEST_TEST_URL`). Set `PORCHFEST_BROWSER_CHANNEL=chrome`
or `msedge` to use an already-installed browser instead of bundled Chromium.
It checks phone/tablet/desktop layouts,
time-aware states, all pages, search, maps, Venmo and tip-jar behavior, and loading
errors. Set `PORCHFEST_ARTIFACTS` to choose a screenshot output directory.

## Publishing

GitHub Pages serves the repository root from the `main` branch. Update
the files and push to `main` to publish changes at the same URL (and QR code).
Keep asset URLs relative so they work under the `/porchfest_mobile/` project path.