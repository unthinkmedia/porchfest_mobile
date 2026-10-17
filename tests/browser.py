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
    expect(page.locator(".porch-art")).to_have_count(0)
    page.screenshot(path=str(ARTIFACTS / "porchfest-home-mobile.png"), full_page=True, animations="disabled")

    for width in [320, 390, 768, 1280]:
        page.set_viewport_size({"width": width, "height": 844})
        for route in ["home", "agenda", "artists", "support"]:
            page.goto(f"{BASE}/#{route}")
            page.wait_for_load_state("networkidle")
            expect(page.locator(f'[data-page="{route}"]')).to_have_attribute("aria-current", "page")
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), (width, route)
            assert page.locator("h1").count() == 1
    schedule = page.request.get(f"{BASE}/data.json").json()
    artist_genres = {artist["id"]: artist["genre"] for artist in schedule["artists"]}
    expected_missing_genres = sum(
        artist_genres.get(entry["artistId"], "Community showcase" if "Got Talent" in entry["name"] else "Genre to be announced")
        == "Genre to be announced" for entry in schedule["sets"]
    )
    page.goto(f"{BASE}/#agenda")
    expect(page.locator(".set-card")).to_have_count(25)
    assert page.locator(".walk-break").count() == 4
    expect(page.get_by_text("Genre to be announced", exact=True)).to_have_count(expected_missing_genres)
    assert page.get_by_text("Hard Rock - Performing Acoustic", exact=True).is_visible()
    for link in page.locator(".map-link").all():
        assert "Rutherford" in link.get_attribute("href")

    page.goto(f"{BASE}/#artists")
    scheduled_ids = {entry["artistId"] for entry in schedule["sets"]}
    expected_ids = {artist["id"] for artist in schedule["artists"] if artist["id"] in scheduled_ids}
    expect(page.locator(".artist-card")).to_have_count(len(expected_ids))
    expect(page.locator("#artist-count")).to_have_text(f"{len(expected_ids)} artist profiles")
    actual_ids = set(page.locator(".artist-card").evaluate_all(
        "(cards) => cards.map(card => card.dataset.artist)"
    ))
    assert actual_ids == expected_ids
    for artist in schedule["artists"]:
        if artist["id"] not in scheduled_ids:
            continue
        card = page.locator(f'.artist-card[data-artist="{artist["id"]}"]')
        if artist["tipUrl"]:
            expect(card.locator(".tip-button")).to_have_attribute("href", artist["tipUrl"])
        else:
            expect(card.locator(".tip-button")).to_have_count(0)
        expect(card.locator(".jar-note")).to_have_count(0)
    search = page.get_by_label("Find an artist or genre")
    search.fill("7th Street")
    expect(page.locator(".artist-card:visible")).to_have_count(0)
    expect(page.locator("#artist-count")).to_have_text("0 artist profiles")
    expect(page.locator("#no-artists")).to_be_visible()
    search.fill("")
    expect(page.locator(".artist-card:visible")).to_have_count(len(expected_ids))
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
    live_ids = {entry["artistId"] for entry in schedule["sets"] if entry["start"] <= 790 < entry["end"]}
    live_profiles = [artist for artist in schedule["artists"] if artist["id"] in live_ids]
    live_tip_count = sum(bool(artist["tipUrl"]) for artist in live_profiles)
    assert page.locator(".is-live").filter(has_text="this just kim").count() == 1
    assert page.locator(".is-live").filter(has_text="Joe Frame").count() == 1
    expect(page.locator("#main > section").first).to_have_class("section live-now")
    expect(page.locator(".live-now .jar-note")).to_have_count(2 - live_tip_count)
    page.set_viewport_size({"width": 390, "height": 844})
    page.screenshot(path=str(ARTIFACTS / "porchfest-live-mobile.png"), full_page=True, animations="disabled")
    page.get_by_role("link", name="Donate / tip an artist").click()
    expect(page.get_by_role("heading", name="Show the current artists some love")).to_be_visible()
    expect(page.locator(".is-live .jar-note")).to_have_count(2 - live_tip_count)
    expect(page.locator(".is-live .tip-button")).to_have_count(live_tip_count)
    expect(page.get_by_role("link", name="Tip Juke Jams on Venmo")).to_have_attribute(
        "href", "https://venmo.com/jukejams"
    )
    expect(page.get_by_role("link", name="Tip Mark P Presti Jr. on Venmo")).to_have_attribute(
        "href", "https://venmo.com/Mark-Presti-1"
    )
    expect(page.get_by_role("link", name="Tip Paul Rosevear on Venmo")).to_have_attribute(
        "href", "https://venmo.com/Paul-Rosevear"
    )

    page.clock.set_fixed_time(datetime.fromisoformat("2026-10-17T15:10:00+00:00"))
    page.goto(f"{BASE}/#home")
    live_tip = page.locator(".live-now .tip-button")
    expect(live_tip).to_have_attribute("href", "https://venmo.com/staceysianna")
    for width, height in [(320, 568), (375, 667), (390, 844), (768, 1024), (1280, 900)]:
        page.set_viewport_size({"width": width, "height": height})
        page.evaluate("window.scrollTo(0, 0)")
        expect(live_tip).to_be_visible()
        box = live_tip.bounding_box()
        nav_top = page.locator(".bottom-nav").bounding_box()["y"]
        assert box["y"] >= 0 and box["y"] + box["height"] <= nav_top, (width, height, box, nav_top)
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        assert page.locator("h1").count() == 1
    page.set_viewport_size({"width": 390, "height": 844})
    page.screenshot(path=str(ARTIFACTS / "porchfest-live-donation-above-fold.png"), animations="disabled")

    page.clock.set_fixed_time(datetime.fromisoformat("2026-10-17T16:50:00+00:00"))
    page.clock.fast_forward(30_000)
    expect(page.locator(".live-pill")).to_have_count(0)
    expect(page.get_by_text("A little break between sets.")).to_be_visible()
    expect(page.locator(".live-now")).to_have_count(0)
    expect(page.locator(".hero")).to_be_visible()
    page.clock.set_fixed_time(datetime.fromisoformat("2026-10-18T01:30:00+00:00"))
    page.clock.fast_forward(30_000)
    expect(page.get_by_text("Thanks for listening.")).to_be_visible()
    assert page.locator(".set-card").count() == 0

    page.clock.set_fixed_time(datetime.fromisoformat("2026-10-17T17:10:00+00:00"))
    for tip_url, service in [
        ("https://venmo.com/example-artist", "Venmo"),
        ("https://cash.app/$example-artist", "Cash App"),
        ("https://paypal.me/example-artist", "PayPal"),
        ("https://enroll.zellepay.com/qr-codes?data=EXAMPLE", "Zelle"),
        ("https://artist.example/tip", None),
        ("javascript:alert(1)", None),
        (None, None),
    ]:
        def with_payment(route):
            response = route.fetch()
            data = response.json()
            next(artist for artist in data["artists"] if artist["id"] == "this-just-kim")["tipUrl"] = tip_url
            route.fulfill(response=response, json=data)

        page.route("**/data.json", with_payment)
        page.goto(f"{BASE}/#support")
        page.reload()
        if tip_url and tip_url.startswith("https:"):
            label = "Tip this just Kim" + (f" on {service}" if service else "")
            links = page.get_by_role("link", name=label)
            expect(links).to_have_count(2)
            for link in links.all():
                expect(link).to_have_attribute("href", tip_url)
                expect(link).to_have_attribute("rel", "noopener noreferrer")
            for width in [320, 390]:
                page.set_viewport_size({"width": width, "height": 844})
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), (width, service)
        else:
            other_live_tips = sum(bool(artist["tipUrl"]) for artist in live_profiles if artist["id"] != "this-just-kim")
            expect(page.locator(".is-live .jar-note")).to_have_count(2 - other_live_tips)
            expect(page.locator('a[href^="javascript:"]')).to_have_count(0)
        page.goto(f"{BASE}/#artists")
        card = page.locator('.artist-card[data-artist="this-just-kim"]')
        expect(card).to_be_visible()
        if tip_url and tip_url.startswith("https:"):
            expect(card.get_by_role("link", name=label)).to_have_attribute("href", tip_url)
            expect(card.locator(".tip-button")).to_have_attribute("target", "_blank")
            expect(card.locator(".tip-button")).to_have_attribute("rel", "noopener noreferrer")
            for width in [320, 390, 768, 1280]:
                page.set_viewport_size({"width": width, "height": 844})
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), (width, service, "artists")
        else:
            expect(card.locator(".tip-button")).to_have_count(0)
        expect(card.locator(".jar-note")).to_have_count(0)
        page.unroute("**/data.json")
    community_ids = {"announcements-rutherford-s-got-talent", "rutherford-s-got-talent"}
    artist_ids = {entry["artistId"] for entry in schedule["sets"]} - community_ids
    community_sets = [entry for entry in schedule["sets"] if entry["artistId"] in community_ids]
    moments = ["2026-10-16T12:00:00+00:00", "2026-10-18T12:00:00+00:00"]
    for entry in community_sets:
        for minute in [entry["start"] - 1, entry["start"]]:
            moments.append(f"2026-10-17T{minute // 60:02}:{minute % 60:02}:00-04:00")
    for moment in moments:
        page.clock.set_fixed_time(datetime.fromisoformat(moment))
        page.goto(f"{BASE}/#support")
        page.reload()
        expect(page.locator(".tip-row")).to_have_count(len(artist_ids))
        for entry in community_sets:
            expect(page.get_by_role("heading", name=entry["name"], exact=True)).to_have_count(0)
        for artist_id in ["bob-stritch", "the-hungry-end"]:
            entry = next(entry for entry in schedule["sets"] if entry["artistId"] == artist_id)
            expect(page.locator(".tip-list").get_by_role("heading", name=entry["name"], exact=True)).to_be_visible()
    page.goto(f"{BASE}/#agenda")
    for entry in community_sets:
        expect(page.get_by_role("heading", name=entry["name"], exact=True)).to_be_visible()

    page.route("**/data.json", lambda route: route.fulfill(status=503, body="Unavailable"))
    page.goto(BASE)
    page.reload()
    expect(page.get_by_role("alert")).to_be_visible()
    expect(page.get_by_role("button", name="Try again")).to_be_visible()
    assert not errors, errors
    browser.close()
    print("Browser checks passed: responsive layouts, all routes, time states, maps, search, tipping, and loading errors.")
