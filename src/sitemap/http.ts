import { fetch, ProxyAgent } from "undici";

type UndiciFetchInit = NonNullable<Parameters<typeof fetch>[1]>;

/** Opcional: proxy HTTP(S) para IPs bloqueadas por el medio (403 desde GitHub Actions). */
const proxyUrl =
  process.env.HTTPS_PROXY?.trim() ||
  process.env.HTTP_PROXY?.trim() ||
  "";
const proxyDispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

/** UA tipo navegador: muchos CDNs/WAF devuelven 403 al cliente sin cabeceras típicas. */
function browserLikeHeaders(extra: Record<string, string>): Record<string, string> {
  const ua =
    process.env.INTERIOR_MONITOR_USER_AGENT?.trim() ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  const lang =
    process.env.INTERIOR_MONITOR_ACCEPT_LANGUAGE?.trim() ||
    "es-AR,es;q=0.9,en;q=0.8";
  return {
    "User-Agent": ua,
    "Accept-Language": lang,
    ...extra,
  };
}

/**
 * Cabeceras que imitan peticiones XHR/fetch desde el mismo sitio (Referer + Sec-Fetch-* + Client Hints).
 */
function wafFriendlyHeaders(url: string, accept: string): Record<string, string> {
  const h = browserLikeHeaders({ Accept: accept });
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    return h;
  }
  return {
    ...h,
    Referer: `${origin}/`,
    "Accept-Encoding": "gzip, deflate, br",
    "Sec-CH-UA":
      '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };
}

const RETRY_STATUSES = new Set([403, 429]);
const RETRY_DELAY_MS = 1800;

async function fetchWithOptionalRetry(
  url: string,
  headers: Record<string, string>,
): Promise<Awaited<ReturnType<typeof fetch>>> {
  const init = {
    headers,
    redirect: "follow" as const,
    ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
  } as UndiciFetchInit;
  let res = await fetch(url, init);
  if (
    process.env.INTERIOR_MONITOR_FETCH_RETRY !== "0" &&
    RETRY_STATUSES.has(res.status)
  ) {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    res = await fetch(url, init);
  }
  return res;
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetchWithOptionalRetry(
    url,
    wafFriendlyHeaders(
      url,
      "application/xml,text/xml,application/xml;q=0.9,*/*;q=0.8",
    ),
  );
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al obtener ${url}`);
  }
  return res.text();
}

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetchWithOptionalRetry(
    url,
    wafFriendlyHeaders(
      url,
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    ),
  );
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al obtener HTML ${url}`);
  }
  return res.text();
}
