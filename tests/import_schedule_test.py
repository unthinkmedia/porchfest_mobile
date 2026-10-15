import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "import_schedule", Path(__file__).resolve().parents[1] / "tools" / "import_schedule.py"
)
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class ImportTests(unittest.TestCase):
    def test_names_remove_internal_annotations_and_merge_duplicates(self):
        self.assertEqual(importer.clean_name("Ruby Bones (6-9) (D)"), "Ruby Bones")
        self.assertEqual(importer.clean_name("Fretless  (D, PA)"), "Fretless")
        self.assertEqual(importer.artist_id("untwisted (Duplicate)"), "untwisted")
        self.assertEqual(importer.artist_id("Mark Presti (Duplicate)"), "mark-p-presti-jr")

    def test_public_urls_do_not_invent_subdomain_variants(self):
        url = "https://markpprestijr.bandcamp.com/album/all-the-rest-is-darkness-2"
        self.assertEqual(importer.public_links(url, [url]), [url])
        self.assertEqual(
            importer.public_links("Instagram.com/rubybonesband", []),
            ["https://Instagram.com/rubybonesband"],
        )
        self.assertEqual(importer.public_links("Facebook & Instagram", []), [])
        self.assertEqual(importer.public_links("javascript:alert(1)", []), [])

    def test_times_are_explicitly_the_daytime_festival_schedule(self):
        self.assertEqual(importer.minute_of_day("11:00"), 660)
        self.assertEqual(importer.minute_of_day("12:20"), 740)
        self.assertEqual(importer.minute_of_day("01:05 PM"), 785)
        self.assertEqual(importer.minute_of_day("9:30"), 1290)
        with self.assertRaises(ValueError):
            importer.minute_of_day("unknown")

    def test_payment_links_are_recognized_without_inventing_recipient_details(self):
        for link in [
            "https://venmo.com/example-artist", "https://cash.app/$example-artist",
            "https://paypal.me/example-artist", "https://www.paypal.com/donate/?hosted_button_id=EXAMPLE",
            "https://enroll.zellepay.com/qr-codes?data=EXAMPLE",
        ]:
            self.assertEqual(importer.payment_url(["https://artist.example/music", link]), link)
        for link in [
            "https://venmo.com.evil.example/artist", "http://cash.app/$artist",
            "https://cash.app/", "https://user:pass@cash.app/$artist", "artist@example.com",
        ]:
            self.assertIsNone(importer.payment_url([link]))
        self.assertEqual(
            importer.public_links("cash.app/$example-artist paypal.me/example-artist", []),
            ["https://cash.app/$example-artist", "https://paypal.me/example-artist"],
        )


if __name__ == "__main__":
    unittest.main()
