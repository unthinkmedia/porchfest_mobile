const idField = () => ({
  label: "ID (keep existing IDs unchanged)", name: "id", widget: "string",
  pattern: ["^[a-z0-9]+(?:-[a-z0-9]+)*$", "Use lowercase letters, numbers, and hyphens."],
});

export function editorConfig(authBaseUrl) {
  return {
    backend: {
      name: "github",
      repo: "unthinkmedia/porchfest_mobile",
      branch: "main",
      base_url: authBaseUrl,
      auth_endpoint: "auth",
      auth_scope: "public_repo",
      commit_messages: { update: "Update Porchfest guide via organizer desk" },
    },
    site_url: "https://unthinkmedia.github.io/porchfest_mobile/",
    display_url: "https://unthinkmedia.github.io/porchfest_mobile/",
    logo_url: "",
    media_folder: "uploads",
    public_folder: "/porchfest_mobile/uploads",
    publish_mode: "simple",
    collections: [{
      name: "festival",
      label: "Festival guide",
      files: [{
        name: "guide",
        label: "Artists, porches & agenda",
        file: "data.json",
        format: "json",
        description: "Public information only. Publish commits to main; GitHub Pages updates shortly afterward. Keep IDs stable. Times are minutes after midnight Eastern (1:45 PM = 825).",
        fields: [
          { name: "event", widget: "hidden", default: {
            name: "Rutherford Porchfest", date: "2026-10-17", timeZone: "America/New_York",
          } },
          {
            label: "Artists", name: "artists", widget: "list", collapsed: true,
            summary: "{{fields.name}} — {{fields.genre}}",
            fields: [
              idField(),
              { label: "Artist name", name: "name", widget: "string" },
              { label: "Genre", name: "genre", widget: "string" },
              {
                label: "Venmo URL", name: "tipUrl", widget: "string", required: false,
                hint: "Exact artist-provided URL, such as https://venmo.com/jukejams. Leave blank to show tip-jar guidance.",
                pattern: ["^https://(?:www\\.|account\\.)?venmo\\.com/[^\\s]+$", "Enter a complete HTTPS Venmo URL."],
              },
              {
                label: "Public music & social links", name: "links", widget: "list",
                required: false,
                field: { label: "URL", name: "url", widget: "string", pattern: ["^https?://[^\\s]+$", "Enter an HTTP or HTTPS URL."] },
              },
            ],
          },
          {
            label: "Porches", name: "porches", widget: "list", collapsed: true,
            summary: "{{fields.name}} — {{fields.region}}",
            fields: [
              idField(),
              { label: "Location name", name: "name", widget: "string" },
              { label: "Region", name: "region", widget: "string" },
              { label: "Map search address", name: "mapQuery", widget: "string", hint: "Include Rutherford, NJ. Verify the location in Google Maps before publishing." },
            ],
          },
          {
            label: "Agenda sets", name: "sets", widget: "list", collapsed: true,
            summary: "{{fields.name}} — {{fields.start}} to {{fields.end}}",
            fields: [
              idField(),
              { label: "Display name", name: "name", widget: "string" },
              { label: "Artist ID", name: "artistId", widget: "string", hint: "Copy the artist's ID from Artists above. Existing community acts without profiles are also supported." },
              { label: "Porch ID", name: "porchId", widget: "string", hint: "Copy the porch's ID from Porches above." },
              { label: "Start (minutes after midnight)", name: "start", widget: "number", value_type: "int", min: 0, max: 1439, hint: "11:00 AM = 660; 1:45 PM = 825; 5:15 PM = 1035." },
              { label: "End (minutes after midnight)", name: "end", widget: "number", value_type: "int", min: 1, max: 1440, hint: "Must be after the start. Two sets cannot overlap on the same porch." },
            ],
          },
        ],
      }],
    }],
  };
}
