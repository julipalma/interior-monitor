/** UA tipo navegador: muchos CDNs/WAF devuelven 403 al cliente custom del monitor o a IPs de datacenter sin cabeceras típicas. */
function browserLikeHeaders(extra: Record<string, string>): HeadersInit {
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

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: browserLikeHeaders({
      Accept: "application/xml,text/xml,application/xml;q=0.9,*/*;q=0.8",
    }),
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al obtener ${url}`);
  }
  return res.text();
}

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: browserLikeHeaders({
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    }),
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al obtener HTML ${url}`);
  }
  return res.text();
}
