// Optional owner notifications via a Telegram bot. Never blocks or fails the caller.
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

export async function notify(text: string) {
  if (!TOKEN || !CHAT) return;
  try {
    await fetch(`${process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org"}/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) {
    console.warn("[notify] telegram failed", (e as Error).message);
  }
}
