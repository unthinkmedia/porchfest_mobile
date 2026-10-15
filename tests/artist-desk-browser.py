"""Scheduled-only artist editor, with intercepted OAuth and GitHub; no real writes."""

import base64
import copy
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = "http://127.0.0.1:8765"
AUTH = "https://porchfest-auth.example.workers.dev"
original = json.loads((Path(__file__).resolve().parents[1] / "data.json").read_text())
remote = copy.deepcopy(original)
revision = 1
writes = []
write_status = 200
read_status = 200


def github(route):
    global remote, revision
    request = route.request
    path = urlparse(request.url).path
    assert request.headers.get("authorization") == "Bearer test-only-not-a-real-token"
    if read_status == -1:
        route.abort("failed")
        return
    if request.method == "PUT" and path.endswith("/contents/data.json"):
        body = request.post_data_json
        writes.append(body)
        if write_status != 200:
            route.fulfill(status=write_status, json={"message": "Simulated GitHub save failure"})
            return
        assert body["sha"] == f"revision-{revision}"
        assert body["branch"] == "main"
        remote = json.loads(base64.b64decode(body["content"]))
        revision += 1
        route.fulfill(json={"commit": {"sha": f"commit-{revision}"}, "content": {"sha": f"revision-{revision}"}})
    elif request.method != "GET":
        route.fulfill(status=404, json={"message": "Unexpected write"})
    elif read_status != 200:
        route.fulfill(status=read_status, json={"message": "Simulated GitHub read failure"})
    elif path == "/user":
        route.fulfill(json={"login": "unthinkmedia"})
    elif path == "/repos/unthinkmedia/porchfest_mobile":
        route.fulfill(json={"permissions": {"push": True}})
    elif path.endswith("/contents/data.json"):
        route.fulfill(json={
            "sha": f"revision-{revision}", "encoding": "base64",
            "content": base64.b64encode(json.dumps(remote).encode()).decode(),
        })
    else:
        route.fulfill(status=404, json={"message": "Unexpected API read"})


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="chrome")
    context = browser.new_context(viewport={"width": 1280, "height": 1000}, reduced_motion="reduce")
    context.route("https://api.github.com/**", github)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route("**/admin/settings.json", lambda route: route.fulfill(json={"authBaseUrl": None}))
    page.goto(f"{BASE}/admin/")
    expect(page.get_by_role("status").first).to_contain_text("GitHub sign-in is not connected yet")
    expect(page.get_by_role("button", name="Login with GitHub")).to_be_disabled()
    page.unroute("**/admin/settings.json")
    context.route("**/admin/settings.json", lambda route: route.fulfill(json={"authBaseUrl": AUTH}))
    context.route(f"{AUTH}/auth?*", lambda route: route.fulfill(content_type="text/html", body=f"""<!doctype html>
      <script>
      window.addEventListener("message", event => {{
        if (event.origin !== "{BASE}" || event.source !== window.opener || event.data !== "authorizing:github") return;
        window.opener.postMessage('authorization:github:success:{{"token":"test-only-not-a-real-token","provider":"github"}}', "{BASE}");
      }});
      window.opener.postMessage("authorizing:github", "{BASE}");
      </script>"""))
    page.reload()
    expect(page.get_by_role("button", name="Login with GitHub")).to_be_enabled()
    page.evaluate("""window.postMessage('authorization:github:success:{"token":"untrusted-token"}', location.origin)""")
    expect(page.locator("#workspace")).to_be_hidden()
    page.get_by_role("button", name="Login with GitHub").click()
    expect(page.locator("#workspace")).to_be_visible(timeout=15000)
    expect(page.locator("#profile-count")).to_have_text("21 artists")
    expect(page.locator(".profile-button")).to_have_count(21)
    assert not page.locator('[data-artist="7th-street"]').count()
    expect(page.locator("#artist-form")).to_be_hidden()
    page.get_by_label("Find a scheduled artist").fill("juke")
    expect(page.locator(".profile-button")).to_have_count(1)
    page.locator('[data-artist="juke-jams"]').click()
    expect(page.get_by_label("Artist name", exact=True)).to_have_value("Juke Jams")
    expect(page.get_by_label("Donation / payment link")).to_have_value("https://venmo.com/jukejams")
    expect(page.get_by_role("button", name="Save changes")).to_be_disabled()

    page.get_by_label("Artist name", exact=True).fill("Juke Jams Updated")
    page.get_by_label("Donation / payment link").fill("https://cash.app/$test-only-preview")
    page.get_by_label("Find a scheduled artist").fill("")
    page.locator('[data-artist="juke-jams"]').click()
    expect(page.get_by_label("Artist name", exact=True)).to_have_value("Juke Jams Updated")
    page.once("dialog", lambda dialog: dialog.dismiss())
    page.locator('[data-artist="rhodora"]').click()
    expect(page.get_by_label("Artist name", exact=True)).to_have_value("Juke Jams Updated")

    remote["artists"][0]["genre"] = "Unrelated concurrent edit"
    page.get_by_role("button", name="Save changes").click()
    expect(page.locator("#desk-status")).to_contain_text("Saved to GitHub")
    assert len(writes) == 1
    expected = copy.deepcopy(original)
    expected["artists"][0]["genre"] = "Unrelated concurrent edit"
    updated = next(artist for artist in expected["artists"] if artist["id"] == "juke-jams")
    updated["name"] = "Juke Jams Updated"
    updated["tipUrl"] = "https://cash.app/$test-only-preview"
    for entry in expected["sets"]:
        if entry["artistId"] == "juke-jams":
            entry["name"] = updated["name"]
    assert remote == expected, "Saving must preserve every unrelated field and synchronize agenda names."
    expect(page.locator("#artist-heading")).to_have_text("Juke Jams Updated")
    expect(page.get_by_role("button", name="Save changes")).to_be_disabled()
    expect(page.locator("#draft-status")).to_have_text("No unsaved changes")
    assert len(remote["artists"]) == 43

    for width in [320, 390, 768, 1280]:
        page.set_viewport_size({"width": width, "height": 1000})
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), width
    page.set_viewport_size({"width": 1280, "height": 1000})
    page.screenshot(path="/tmp/porchfest-artist-desk.png", full_page=True)

    page.get_by_label("Genre", exact=True).fill("Draft during a network failure")
    read_status = -1
    page.get_by_role("button", name="Save changes").click()
    expect(page.get_by_role("alert")).to_contain_text("Could not reach GitHub")
    expect(page.get_by_label("Genre", exact=True)).to_have_value("Draft during a network failure")
    assert len(writes) == 1
    read_status = 200
    page.get_by_label("Genre", exact=True).fill(updated["genre"])
    page.get_by_label("Donation / payment link").fill("http://cash.app/$unsafe")
    page.get_by_role("button", name="Save changes").click()
    expect(page.get_by_role("alert")).to_contain_text("HTTPS payment link")
    assert len(writes) == 1
    expect(page.get_by_label("Donation / payment link")).to_have_value("http://cash.app/$unsafe")

    page.get_by_label("Donation / payment link").fill("https://paypal.me/test-only-preview")
    write_status = 409
    page.get_by_role("button", name="Save changes").click()
    expect(page.get_by_role("alert")).to_contain_text("guide changed while saving")
    expect(page.get_by_label("Donation / payment link")).to_have_value("https://paypal.me/test-only-preview")
    assert len(writes) == 2
    write_status = 200
    next(artist for artist in remote["artists"] if artist["id"] == "juke-jams")["genre"] = "Conflicting artist edit"
    page.get_by_role("button", name="Save changes").click()
    expect(page.get_by_role("alert")).to_contain_text("changed by another editor")
    assert len(writes) == 2
    expect(page.get_by_label("Donation / payment link")).to_have_value("https://paypal.me/test-only-preview")

    page.once("dialog", lambda dialog: dialog.accept())
    page.get_by_role("button", name="Reload artist list").click()
    expect(page.locator("#desk-status")).to_contain_text("reloaded from GitHub")
    expect(page.get_by_label("Genre", exact=True)).to_have_value("Conflicting artist edit")
    page.get_by_label("Donation / payment link").fill("")
    page.get_by_role("button", name="Save changes").click()
    expect(page.locator("#desk-status")).to_contain_text("Saved to GitHub")
    assert next(artist for artist in remote["artists"] if artist["id"] == "juke-jams")["tipUrl"] is None
    assert len(writes) == 3
    page.get_by_label("Artist name", exact=True).fill("Discard me")
    page.once("dialog", lambda dialog: dialog.accept())
    page.get_by_role("button", name="Cancel changes").click()
    expect(page.get_by_label("Artist name", exact=True)).to_have_value("Juke Jams Updated")
    expect(page.get_by_role("button", name="Save changes")).to_be_disabled()
    page.reload()
    expect(page.locator("#workspace")).to_be_visible()
    expect(page.locator("#profile-count")).to_have_text("21 artists")
    expect(page.get_by_role("link", name="Agenda & porches")).to_have_attribute("href", "./guide.html")
    page.get_by_role("button", name="Log out", exact=True).click()
    expect(page.get_by_role("button", name="Login with GitHub")).to_be_enabled()
    expect(page.locator("#workspace")).to_be_hidden()
    page.get_by_role("button", name="Login with GitHub").click()
    expect(page.locator("#workspace")).to_be_visible()

    read_status = 401
    page.reload()
    expect(page.get_by_role("alert")).to_contain_text("sign-in expired")
    expect(page.get_by_role("button", name="Login with GitHub")).to_be_enabled()
    expect(page.locator("#workspace")).to_be_hidden()
    assert not errors, errors
    browser.close()
    print("Artist desk checks passed: OAuth, 21-only list, details, name sync, exact saves, draft protection, conflicts, auth errors, and responsive layouts.")
