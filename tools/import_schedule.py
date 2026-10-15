"""Import public-facing fields only; never publish the registration workbook."""

import argparse
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from urllib.parse import urlparse

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def clean_name(value):
    value = re.sub(
        r"\s*\((?:[<>]?\d[^)]*|afternoon|time issue\?|Duplicate|keys|PA|D(?:[ ,]*PA)?)\)",
        "", value, flags=re.I,
    )
    value = re.sub(r"\s+2-6$", "", value.strip())
    return re.sub(r"\s+", " ", value).strip()


def artist_id(name):
    value = re.sub(r"[^a-z0-9]+", "-", clean_name(name).lower()).strip("-")
    return {"mark-presti": "mark-p-presti-jr"}.get(value, value)


def read_rows(archive, sheet, allowed):
    strings = [
        "".join(item.itertext())
        for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si", NS)
    ]
    root = ET.fromstring(archive.read(f"xl/worksheets/sheet{sheet}.xml"))
    relationships = {}
    rel_path = f"xl/worksheets/_rels/sheet{sheet}.xml.rels"
    if rel_path in archive.namelist():
        relationships = {
            rel.get("Id"): rel.get("Target")
            for rel in ET.fromstring(archive.read(rel_path))
        }
    hyperlinks = {
        link.get("ref"): relationships.get(link.get(RID), "")
        for link in root.findall("s:hyperlinks/s:hyperlink", NS)
    }
    rows = []
    for row in root.findall("s:sheetData/s:row", NS):
        cells, links = {}, []
        for cell in row:
            ref = cell.get("r", "")
            column = re.sub(r"\d", "", ref)
            if column not in allowed:
                continue
            value = cell.find("s:v", NS)
            if value is not None:
                cells[column] = strings[int(value.text)] if cell.get("t") == "s" else value.text
            elif cell.get("t") == "inlineStr":
                cells[column] = "".join(cell.itertext())
            if column in ("J", "K") and ref in hyperlinks:
                links.append(hyperlinks[ref])
        rows.append((cells, links))
    return rows


def public_links(text, hyperlinks):
    urls = list(hyperlinks)
    urls.extend(re.findall(r"https?://[^\s<>]+", text))
    urls.extend(
        "https://" + match
        for match in re.findall(
            r"(?<![/.\w@])(?:www\.)?[\w-]+(?:\.[\w-]+)*\.(?:com|band|app|me)(?:/[^\s,<>]*)?", text, flags=re.I
        )
    )
    if re.search(r"\b(?:instagram|instagrams|insta|ig)\b", text, re.I):
        # Convert only explicitly identified Instagram handles, not ambiguous handles.
        for handle in re.findall(r"@([A-Za-z0-9_.]+)", text):
            if "tiktok" not in text.lower() or "all @" in text.lower():
                urls.append(f"https://www.instagram.com/{handle.rstrip('.')}/")
    unique = {}
    for url in urls:
        url = url.rstrip(".,);")
        parsed = urlparse(url)
        if parsed.scheme not in ("https", "http") or not parsed.hostname:
            continue
        key = (parsed.hostname.lower().removeprefix("www."), parsed.path.rstrip("/"), parsed.query)
        unique.setdefault(key, url)
    return list(unique.values())


def payment_url(links):
    hosts = {
        "venmo.com", "account.venmo.com", "cash.app", "paypal.me", "paypal.com",
        "zellepay.com", "enroll.zellepay.com", "zelle.com",
    }
    for link in links:
        parsed = urlparse(link)
        if (parsed.scheme == "https" and (parsed.hostname or "").removeprefix("www.") in hosts
                and not parsed.username and not parsed.password
                and (parsed.path not in ("", "/") or parsed.query)):
            return link
    return None


def minute_of_day(value):
    match = re.search(r"(\d{1,2}):(\d{2})", value)
    if not match:
        raise ValueError(f"Invalid schedule time: {value!r}")
    hour, minute = map(int, match.groups())
    if hour < 11:
        hour += 12
    return hour * 60 + minute


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "data.json")
    args = parser.parse_args()
    artists, porches, sets = {}, [], []
    with zipfile.ZipFile(args.workbook) as archive:
        for row, hyperlinks in read_rows(archive, 2, {"B", "C", "J", "K"})[1:]:
            name = clean_name(row.get("B", ""))
            if not name or name.lower() == "test":
                continue
            key = artist_id(name)
            genre = row.get("C", "").strip()
            if genre.lower() in ("male", "test", ""):
                genre = "Genre to be announced"
            links = public_links("\n".join(row.get(col, "") for col in ("J", "K")), hyperlinks)
            if key in artists:
                artists[key]["links"] = list(dict.fromkeys(artists[key]["links"] + links))
                artists[key]["tipUrl"] = artists[key]["tipUrl"] or payment_url(links)
                continue
            tip_url = payment_url(links)
            artists[key] = {"id": key, "name": name, "genre": genre, "links": links, "tipUrl": tip_url}
        slots, region = {}, ""
        for row, _ in read_rows(archive, 1, {"A", "B", "C", "D", "E"}):
            location = row.get("A", "").strip()
            if location.startswith("LOCATION"):
                region = location.split(": ", 1)[1]
                slots = {}
                for column in ("B", "C", "D", "E"):
                    if row.get(column):
                        start, end = re.split(r"\s*[–-]\s*", row[column], maxsplit=1)
                        slots[column] = (minute_of_day(start), minute_of_day(end))
            elif location and location != "WALK OVER":
                porch_id = f"porch-{len(porches) + 1}"
                query = f"{'Felician University' if location == 'Felician' else location}, Rutherford, NJ"
                porches.append({"id": porch_id, "name": location, "region": region, "mapQuery": query})
                for column, (start, end) in slots.items():
                    raw_name = row.get(column, "").strip()
                    if not raw_name:
                        continue
                    name = clean_name(raw_name)
                    if "Announcements" in name:
                        name = "Announcements & Rutherford's Got Talent"
                    elif name == "Rutherfords Got Talent C":
                        name = "Rutherford's Got Talent"
                    sets.append({
                        "id": f"set-{len(sets) + 1}", "artistId": artist_id(name),
                        "name": name, "porchId": porch_id, "start": start, "end": end,
                    })
    if len(porches) != 8 or len(sets) != 25:
        raise ValueError(f"Unexpected schedule shape: {len(porches)} porches, {len(sets)} sets. Review the source.")
    data = {
        "event": {"name": "Rutherford Porchfest", "date": "2026-10-17", "timeZone": "America/New_York"},
        "porches": porches, "sets": sets,
        "artists": sorted(artists.values(), key=lambda artist: artist["name"].lower()),
    }
    args.output.write_text(json.dumps(data, indent=2, ensure_ascii=True) + "\n")
    print(f"Imported {len(porches)} porches, {len(sets)} sets, {len(artists)} artist profiles.")


if __name__ == "__main__":
    main()
