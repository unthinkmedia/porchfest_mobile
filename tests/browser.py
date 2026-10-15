"""Run with the webapp-testing with_server.py helper and Python Playwright."""

import os
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("PORCHFEST_TEST_URL", "http://127.0.0.1:8765")
ARTIFACTS = Path(os.environ.get("PORCHFEST_ARTIFACTS", "/tmp"))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel=os.environ.get("PORCHFEST_BROWSER_CHANNEL"))
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1, reduced_motion="reduce")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.clock.install(time=datetime.fromisoformat("2026-10-15T12:00:00+00:00"))
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    page.get_by_role("heading", name="Who's playing now").wait_for()
    expect(page.get_by_text("The porches are warming up.")).to_be_visible()
    assert page.locator(".live-pill").count() == 0
    assert page.get_by_role("link", name="Map to Felician").count() == 1
    page.screenshot(path=str(ARTIFACTS / "porchfest-home-mobile.png"), full_page=True, animations="disabled")

    for width in [320, 390, 768, 1280]:
        page.set_viewport_size({"width": width, "height": 844})
        for route in ["home", "agenda", "artists", "support"]:
            page.goto(f"{BASE}/#{route}")
            page.wait_for_load_state("networkidle")
            expect(page.locator(f'[data-page="{route}"]')).to_have_attribute("aria-current", "page")
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), (width, route)
            assert page.locator("h1").count() == 1
    page.goto(f"{BASE}/#agenda")
    expect(page.locator(".set-card")).to_have_count(25)
    assert page.locator(".walk-break").count() == 4
    assert page.get_by_text("Genre to be announced", exact=True).count() == 3
    assert page.get_by_text("Hard Rock - Performing Acoustic", exact=True).is_visible()
    for link in page.locator(".map-link").all():
        assert "Rutherford" in link.get_attribute("href")

    page.goto(f"{BASE}/#artists")
    expect(page.locator(".artist-card")).to_have_count(21)
    expect(page.locator("#artist-count")).to_have_text("21 artist profiles")
    schedule = page.request.get(f"{BASE}/data.json").json()
    scheduled_ids = {entry["artistId"] for entry in schedule["sets"]}
    expected_ids = {artist["id"] for artist in schedule["artists"] if artist["id"] in scheduled_ids}
    actual_ids = set(page.locator(".artist-card").evaluate_all(
        "(cards) => cards.map(card => card.dataset.artist)"
    ))
    assert actual_ids == expected_ids
    search = page.get_by_label("Find an artist or genre")
    search.fill("7th Street")
    expect(page.locator(".artist-card:visible")).to_have_count(0)
    expect(page.locator("#artist-count")).to_have_text("0 artist profiles")
    expect(page.locator("#no-artists")).to_be_visible()
    search.fill("")
    expect(page.locator(".artist-card:visible")).to_have_count(21)
    search.fill("rhodora")
    assert page.locator(".artist-card:visible").count() == 1
    assert page.get_by_role("status").inner_text() == "1 artist profile"
    page.clock.fast_forward(31000)
    assert search.input_value() == "rhodora"
    search.fill("unlikely-search-no-matches")
    assert page.locator("#no-artists").is_visible()
    search.fill("folk")
    assert page.locator(".artist-card:visible").count() > 0

    page.clock.set_fixed_time(datetime.fromisoformat("2026-10-17T17:10:00+00:00"))
    page.goto(f"{BASE}/#home")
    expect(page.locator(".live-pill")).to_have_count(2)
    assert page.locator(".is-live").filter(has_text="this just kim").count() == 1
    assert page.locator(".is-live").filter(has_text="Joe Frame").count() == 1
    page.set_viewport_size({"width": 390, "height": 844})
    page.screenshot(path=str(ARTIFACTS / "porchfest-live-mobile.png"), full_page=True, animations="disabled")
    page.get_by_role("link", name="Donate / tip an artist").click()
    expect(page.get_by_role("heading", name="Show the current artists some love")).to_be_visible()
    assert page.locator(".is-live .jar-note").count() == 2
    assert page.locator(".is-live a[href*='venmo.com']").count() == 0
    expect(page.get_by_role("link", name="Tip Juke Jams on Venmo")).to_have_attribute(
        "href", "https://venmo.com/jukejams"
    )

    page.clock.set_fixed_time(datetime.fromisoformat("2026-10-17T16:50:00+00:00"))
    page.goto(f"{BASE}/#home")
    expect(page.locator(".live-pill")).to_have_count(0)
    expect(page.get_by_text("A little break between sets.")).to_be_visible()
    page.clock.set_fixed_time(datetime.fromisoformat("2026-10-18T01:30:00+00:00"))
    page.clock.fast_forward(30_000)
    expect(page.get_by_text("Thanks for listening.")).to_be_visible()
    assert page.locator(".set-card").count() == 0

    def with_venmo(route):
        response = route.fetch()
        data = response.json()
        next(artist for artist in data["artists"] if artist["id"] == "this-just-kim")["tipUrl"] = "https://venmo.com/example-artist"
        route.fulfill(response=response, json=data)

    page.route("**/data.json", with_venmo)
    page.clock.set_fixed_time(datetime.fromisoformat("2026-10-17T17:10:00+00:00"))
    page.goto(f"{BASE}/#support")
    page.reload()
    expect(page.get_by_role("link", name="Tip this just Kim on Venmo")).to_have_count(2)
    page.unroute("**/data.json")
    page.route("**/data.json", lambda route: route.fulfill(status=503, body="Unavailable"))
    page.goto(BASE)
    page.reload()
    expect(page.get_by_role("alert")).to_be_visible()
    expect(page.get_by_role("button", name="Try again")).to_be_visible()
    assert not errors, errors
    browser.close()
    print("Browser checks passed: responsive layouts, all routes, time states, maps, search, tipping, and loading errors.")
