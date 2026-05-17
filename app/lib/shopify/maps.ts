/**
 * Google Maps embed URL builder.
 */

interface MapParams {
  city: string;
  state: string;
  lat?: number | null;
  lng?: number | null;
  googleMapsKey?: string | null;
}

export function getMapEmbedUrl(params: MapParams): string | null {
  const { city, state, lat, lng, googleMapsKey } = params;

  if (!googleMapsKey) return null;

  const query = lat && lng
    ? `${lat},${lng}`
    : encodeURIComponent(`${city} ${state}`);

  return `https://www.google.com/maps/embed/v1/place?key=${googleMapsKey}&q=${query}&zoom=12`;
}
