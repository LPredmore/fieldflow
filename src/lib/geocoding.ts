// Address normalization + helpers shared by client and edge function.
export interface AddressLike {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  zip?: string | null;
  country?: string | null;
}

export function formatAddressOneLine(addr?: AddressLike | null): string {
  if (!addr) return '';
  const parts = [
    addr.street,
    addr.city,
    addr.state,
    addr.zip_code ?? addr.zip,
    addr.country,
  ]
    .map((p) => (p || '').trim())
    .filter(Boolean);
  return parts.join(', ');
}

export function hasUsableAddress(addr?: AddressLike | null): boolean {
  if (!addr) return false;
  return Boolean((addr.street || '').trim() && (addr.city || '').trim());
}

// Haversine distance in km — used as a sanity filter only; real ETAs come from Mapbox.
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
