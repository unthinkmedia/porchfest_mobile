import base64
import json
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = "http://127.0.0.1:8765"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="chrome")
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route("**/admin/settings.json", lambda route: route.fulfill(json={"authBaseUrl": None}))
    page.goto(f"{BASE}/admin/guide.html")
    expect(page.locator("#admin-message")).to_contain_text("GitHub sign-in is not connected yet")
    assert page.get_by_role("button", name="Login with GitHub").count() == 0
    page.route("**/admin/settings.json", lambda route: route.fulfill(
        json={"authBaseUrl": "https://porchfest-auth.example.workers.dev"}
    ))
    page.reload()
    expect(page.get_by_role("button", name="Login with GitHub")).to_be_visible(timeout=30000)
    assert page.locator("#admin-status").is_hidden()
    assert page.evaluate("typeof window.h") == "function"
    assert page.evaluate("Boolean(window.CMS)") is True
    assert not errors, errors
    requests = []
    writes = []
    fixture = (Path(__file__).resolve().parents[1] / "data.json").read_text()
    encoded = base64.b64encode(fixture.encode()).decode()

    def github(route):
        request = route.request
        path = urlparse(request.url).path
        requests.append((request.method, path))
        if request.method in ("POST", "PUT", "PATCH"):
            writes.append((request.method, path, request.post_data_json))
            if path.endswith("/git/blobs"):
                body = {"sha": "new-blob"}
            elif path.endswith("/git/trees"):
                body = {"sha": "new-tree", "tree": []}
            elif path.endswith("/git/commits"):
                body = {"sha": "new-commit"}
            elif "/git/refs/" in path:
                body = {"object": {"sha": "new-commit"}}
            else:
                route.fulfill(status=404, json={"message": f"Unmocked write: {path}"})
                return
        elif path == "/user":
            body = {"login": "unthinkmedia", "name": "Test Organizer", "avatar_url": ""}
        elif path == "/repos/unthinkmedia/porchfest_mobile":
            body = {"permissions": {"push": True}, "default_branch": "main", "owner": {"login": "unthinkmedia"}}
        elif "/git/trees/" in path:
            body = {"sha": "test-tree", "tree": [{"path": "data.json", "type": "blob", "sha": "test-data-sha", "mode": "100644"}]}
        elif "/git/blobs/" in path or "/contents/data.json" in path:
            body = {"sha": "test-data-sha", "encoding": "base64", "content": encoded, "path": "data.json", "type": "file"}
        elif path.endswith("/commits"):
            body = [{"sha": "test-commit", "commit": {"author": {"name": "Organizer", "date": "2026-10-15T12:00:00Z"}}}]
        elif path.endswith("/branches/main"):
            body = {"commit": {"sha": "test-commit", "commit": {"tree": {"sha": "test-tree"}}}}
        elif "/git/ref" in path:
            body = {"object": {"sha": "test-commit"}}
        elif "/git/commits/" in path:
            body = {"sha": "test-commit", "tree": {"sha": "test-tree"}}
        else:
            route.fulfill(status=404, json={"message": f"Unmocked request: {path}"})
            return
        route.fulfill(json=body)

    page.route("https://api.github.com/**", github)
    page.add_init_script("""localStorage.setItem('decap-cms-user', JSON.stringify({
      token: 'test-only-not-a-real-token', backendName: 'github', login: 'unthinkmedia'
    }));""")
    page.reload()
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("Artists, porches & agenda", exact=True)).to_be_visible(timeout=30000)
    page.get_by_text("Artists, porches & agenda", exact=True).click()
    artist_row = page.get_by_text(re.compile("^Juke Jams —")).first.locator("..")
    artist_row.get_by_role("button").first.click()
    tip_input = page.get_by_role("textbox", name=re.compile("^Payment"))
    expect(tip_input).to_have_value("https://venmo.com/jukejams")
    tip_input.fill("https://cash.app/$test-only-preview")
    expect(page.frame_locator("iframe").get_by_text(
        "Cash App: https://cash.app/$test-only-preview", exact=True
    )).to_be_visible()
    page.get_by_role("button", name="Publish", exact=True).click()
    page.get_by_text("Publish now", exact=True).click()
    expect(page.get_by_text("Changes saved", exact=True)).to_be_visible(timeout=15000)
    assert [method for method, path, body in writes] == ["POST", "POST", "POST", "PATCH"]
    blob = writes[0][2]
    saved_text = base64.b64decode(blob["content"]).decode() if blob.get("encoding") == "base64" else blob["content"]
    expected = json.loads(fixture)
    next(artist for artist in expected["artists"] if artist["id"] == "juke-jams")["tipUrl"] = "https://cash.app/$test-only-preview"
    assert json.loads(saved_text) == expected, "CMS must preserve all fields and other artist links."
    assert writes[1][2]["tree"] == [{"path": "data.json", "mode": "100644", "type": "blob", "sha": "new-blob"}]
    assert writes[-1][1].endswith("/git/refs/heads/main")
    assert not errors, errors

    artist_row.get_by_role("textbox", name="ID (keep existing IDs unchanged)", exact=True).fill(expected["artists"][0]["id"])
    page.get_by_role("button", name="Publish", exact=True).click()
    page.get_by_text("Publish now", exact=True).click()
    expect(page.get_by_text(re.compile("duplicate ID"))).to_be_visible()
    assert len(writes) == 4, "Invalid drafts must not write to GitHub."
    browser.close()
    print("Admin browser checks passed: setup state, CMS login, draft preview, lossless mocked publishing, and invalid-draft protection.")
