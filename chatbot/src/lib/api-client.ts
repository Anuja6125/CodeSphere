/**
 * Utility for safe API responses on the client side.
 * Prevents "Unexpected token '<', '<!DOCTYPE '... is not valid JSON" errors
 * when endpoints return HTML (e.g. 404/500/502/proxy error pages).
 */
export async function safeFetchJson<T = any>(
  res: Response,
  fallbackError = "Request failed"
): Promise<T> {
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    if (!res.ok) {
      throw new Error(
        `${fallbackError} (${res.status} ${res.statusText || "Server error"}). Ensure the correct API server is running.`
      );
    }
    throw new Error("Invalid response format received from server.");
  }

  if (!res.ok) {
    throw new Error(json?.error || `${fallbackError} (${res.status})`);
  }

  return json as T;
}
