/**
 * Trust link URL templates use placeholders that get substituted at page render time.
 *
 * Supported placeholders (case-insensitive):
 *   {service}      → service name, URL-encoded with + for spaces (e.g. "Roof+Repair")
 *   {city}         → city name, URL-encoded with + for spaces
 *   {state}        → state name, URL-encoded with + for spaces
 *   {zip}          → zip code (raw)
 *   {service-slug} → lowercase, kebab-case (e.g. "roof-repair")
 *   {city-slug}    → lowercase, kebab-case
 *   {state-slug}   → lowercase, kebab-case
 *
 * Example template:
 *   https://www.yelp.com/search?find_desc={service}&find_loc={city}%2C+{state}
 */

export interface TemplateVars {
  service: string;
  city: string;
  state: string;
  zip?: string | null;
}

function urlForm(s: string): string {
  // encodeURIComponent then convert %20 back to + (form-style encoding used by search URLs)
  return encodeURIComponent(s).replace(/%20/g, "+");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function resolveTemplate(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{service-slug\}/gi, slugify(vars.service))
    .replace(/\{city-slug\}/gi, slugify(vars.city))
    .replace(/\{state-slug\}/gi, slugify(vars.state))
    .replace(/\{service\}/gi, urlForm(vars.service))
    .replace(/\{city\}/gi, urlForm(vars.city))
    .replace(/\{state\}/gi, urlForm(vars.state))
    .replace(/\{zip\}/gi, vars.zip ? urlForm(vars.zip) : "");
}

/**
 * Built-in presets the merchant can one-click add. Each is a URL template that
 * builds a real search/listing URL when the placeholders are substituted.
 */
export const TRUST_LINK_PRESETS: { platform: string; urlTemplate: string }[] = [
  {
    platform: "Yelp",
    urlTemplate: "https://www.yelp.com/search?find_desc={service}&find_loc={city}%2C+{state}",
  },
  {
    platform: "Google Maps",
    urlTemplate: "https://www.google.com/maps/search/{service}+{city}%2C+{state}",
  },
  {
    platform: "BBB",
    urlTemplate:
      "https://www.bbb.org/search?find_country=USA&find_text={service}&find_loc={city}%2C+{state}",
  },
  {
    platform: "Yellow Pages",
    urlTemplate: "https://www.yellowpages.com/{city-slug}-{state-slug}/{service-slug}",
  },
  {
    platform: "Superpages",
    urlTemplate:
      "https://www.superpages.com/search?search_terms={service}&geo_location_terms={city}%2C+{state}",
  },
  {
    platform: "Manta",
    urlTemplate: "https://www.manta.com/search?search_source=business&search={service}+{city}+{state}",
  },
  {
    platform: "Thumbtack",
    urlTemplate: "https://www.thumbtack.com/{state-slug}/{city-slug}/{service-slug}/",
  },
  {
    platform: "Foursquare",
    urlTemplate: "https://foursquare.com/explore?q={service}&near={city}%2C+{state}",
  },
];
