/** Pełny URL do API — zawsze ta sama domena co strona (unika złych relatywnych ścieżek). */
export function absApi(path: string): string {
  if (typeof window === "undefined") return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${window.location.origin}${p}`;
}
