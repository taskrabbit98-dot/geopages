/**
 * Real local context fetched from Google Places + Geocoding APIs.
 *
 * Feeds the AI prompt with actual neighborhoods, landmarks, and ZIP codes
 * for each location instead of letting the model invent them. Results are
 * cached per location to keep API costs negligible (one call per location,
 * not per page).
 */

export interface LocalContext {
  neighborhoods: string[];
  landmarks: string[];
  zipCodes: string[];
  cityFullName: string;
  county?: string;
}

interface GeocodeResult {
  formatted_address: string;
  address_components: Array<{ long_name: string; short_name: string; types: string[] }>;
  geometry: { location: { lat: number; lng: number } };
  place_id: string;
}

interface PlaceResult {
  name: string;
  types: string[];
  vicinity?: string;
}

/**
 * Fetches all local context for a city in one batch of API calls.
 * Returns empty defaults if the API key is missing or the calls fail —
 * the AI will fall back to generic content rather than crash.
 */
export async function fetchLocalContext(
  city: string,
  state: string,
  apiKey: string | null,
  lat?: number | null,
  lng?: number | null,
  country: string = "US",
): Promise<LocalContext> {
  const empty: LocalContext = {
    neighborhoods: [],
    landmarks: [],
    zipCodes: [],
    cityFullName: `${city}, ${state}`,
  };

  if (!apiKey) return empty;

  try {
    // 1. Geocode the city to get lat/lng + address components (ZIP codes, county)
    let coords = lat != null && lng != null ? { lat, lng } : null;
    let zipCodes: string[] = [];
    let county: string | undefined;
    let cityFullName = `${city}, ${state}`;

    // Include country in the geocoding query — disambiguates "Lagos, LA" (US Louisiana
    // vs. Nigeria Lagos) and improves results for non-US locations.
    const geocodeQuery = country && country !== "US"
      ? `${city}, ${state}, ${country}`
      : `${city}, ${state}`;
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      geocodeQuery,
    )}&key=${apiKey}`;
    const geocodeResp = await fetch(geocodeUrl);
    const geocodeData = (await geocodeResp.json()) as {
      results: GeocodeResult[];
      status: string;
    };

    if (geocodeData.status === "OK" && geocodeData.results.length > 0) {
      const top = geocodeData.results[0];
      coords = coords ?? top.geometry.location;
      cityFullName = top.formatted_address;
      for (const c of top.address_components) {
        if (c.types.includes("postal_code")) {
          zipCodes.push(c.long_name);
        }
        if (c.types.includes("administrative_area_level_2")) {
          county = c.long_name;
        }
      }
    }

    if (!coords) return { ...empty, zipCodes, county, cityFullName };

    // 2. Pull a wider radius via Places Nearby Search for landmarks + neighborhoods
    const [landmarksRaw, neighborhoodsRaw, postalRaw] = await Promise.all([
      nearbySearch(apiKey, coords, "tourist_attraction", 8000),
      nearbySearch(apiKey, coords, "neighborhood", 5000),
      nearbySearch(apiKey, coords, "postal_code", 8000),
    ]);

    // landmarks: filter to recognizable POIs, dedupe, top 5
    const landmarks = uniqueByName(landmarksRaw)
      .filter((p) => !p.name.toLowerCase().includes(city.toLowerCase()))
      .slice(0, 5)
      .map((p) => p.name);

    // neighborhoods: dedupe, exclude the city itself, top 5
    const neighborhoods = uniqueByName(neighborhoodsRaw)
      .filter((p) => p.name.toLowerCase() !== city.toLowerCase())
      .slice(0, 5)
      .map((p) => p.name);

    // additional ZIPs from postal code search
    for (const p of postalRaw) {
      if (/^\d{5}(-\d{4})?$/.test(p.name) && !zipCodes.includes(p.name)) {
        zipCodes.push(p.name);
      }
    }
    zipCodes = zipCodes.slice(0, 8);

    return {
      neighborhoods,
      landmarks,
      zipCodes,
      cityFullName,
      county,
    };
  } catch (err) {
    console.error("[places] fetchLocalContext failed", err);
    return empty;
  }
}

async function nearbySearch(
  apiKey: string,
  coords: { lat: number; lng: number },
  type: string,
  radius: number,
): Promise<PlaceResult[]> {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${coords.lat},${coords.lng}&radius=${radius}&type=${type}&key=${apiKey}`;
  const resp = await fetch(url);
  const data = (await resp.json()) as { results?: PlaceResult[]; status: string };
  if (data.status === "OK" || data.status === "ZERO_RESULTS") {
    return data.results ?? [];
  }
  return [];
}

function uniqueByName(places: PlaceResult[]): PlaceResult[] {
  const seen = new Set<string>();
  const out: PlaceResult[] = [];
  for (const p of places) {
    const k = p.name.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}

export function buildKeywordPhrases(serviceName: string, city: string, state: string): string[] {
  const base = serviceName.toLowerCase();
  const cityLower = city.toLowerCase();
  const stateLower = state.toLowerCase();
  return [
    `${serviceName} ${city}`,
    `${serviceName} ${city}, ${state}`,
    `${serviceName} in ${city}`,
    `${serviceName} near ${city}`,
    `${base} services ${cityLower}`,
    `local ${base} ${cityLower}`,
    `best ${base} in ${cityLower} ${stateLower}`,
  ];
}
