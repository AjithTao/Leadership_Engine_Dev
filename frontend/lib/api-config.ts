const API_PORT = '8000';

// Resolve the backend base URL for a given API path.
//
// Priority:
//   1. Vercel production        → managed Render backend.
//   2. NEXT_PUBLIC_API_URL set  → use it verbatim (the single source of truth).
//   3. Unset, in the browser    → the SAME host that served the page, on :8000.
//      This makes plain `localhost` dev AND LAN sharing (http://<host>:3000) both
//      work with no hardcoded IP, and survives the host's address changing between
//      sessions — instead of a fixed `localhost:8000` that breaks for LAN clients.
//   4. Unset, SSR / build       → localhost:8000 (no page host to derive from).
export const getApiUrl = (path: string) => {
  if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
    return `https://master-1-hsnb.onrender.com${path}`;
  }

  if (process.env.NEXT_PUBLIC_API_URL) {
    return `${process.env.NEXT_PUBLIC_API_URL}${path}`;
  }

  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    return `${protocol}//${hostname}:${API_PORT}${path}`;
  }

  return `http://localhost:${API_PORT}${path}`;
};

// Default timeout for fetchWithTimeout (ms).
const DEFAULT_FETCH_TIMEOUT = 20000;

// fetch() with a hard timeout. After `ms` the request — and any in-progress body
// read on the returned Response — is aborted, so an unreachable or stalled backend
// can never leave a loading state spinning forever. On expiry it rejects with a
// Timeout/Abort DOMException, which flows into the caller's existing catch.
export function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  ms: number = DEFAULT_FETCH_TIMEOUT,
): Promise<Response> {
  // A caller-supplied signal takes over timeout responsibility.
  if (init.signal) return fetch(input, init);

  // Prefer the native primitive (aborts the body stream too) when available.
  if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function') {
    return fetch(input, { ...init, signal: (AbortSignal as any).timeout(ms) });
  }

  // Fallback for older runtimes that lack AbortSignal.timeout.
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(id));
}
