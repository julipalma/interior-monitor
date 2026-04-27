export async function postSlackWebhook(
  webhookUrl: string,
  text: string,
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook ${res.status}: ${body}`);
  }
}

const PREVIEW_RULE = "─".repeat(62);

/** Misma cadena `text` que el webhook; útil para ver localmente sin mezclar streams. */
export function formatSlackLocalPreview(text: string): string {
  return [
    "",
    PREVIEW_RULE,
    " Slack · vista previa (cuerpo idéntico al mensaje del webhook)",
    PREVIEW_RULE,
    "",
    text,
    "",
    PREVIEW_RULE,
    "",
  ].join("\n");
}
