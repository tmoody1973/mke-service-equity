const fallbackMapStyleUrl = "/map-style.json";

export function getMapStyleUrl() {
  const configuredStyleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim();

  return configuredStyleUrl || fallbackMapStyleUrl;
}
