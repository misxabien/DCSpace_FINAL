/**
 * Backup AI provider, used only when every Gemini model fails (busy, timed out,
 * quota reached or key problem). Gemini stays the main AI.
 *
 * Works with any OpenAI-compatible chat API (Groq, OpenRouter, OpenAI, …):
 *   BACKUP_AI_BASE_URL  e.g. https://api.groq.com/openai/v1
 *   BACKUP_AI_API_KEY   the provider's API key
 *   BACKUP_AI_MODEL     a model id from that provider's model list
 */

const BACKUP_TIMEOUT_MS = 25_000;

function readEnv(name: string) {
  return String(process.env[name] || "").trim();
}

export function isBackupAiConfigured() {
  return Boolean(readEnv("BACKUP_AI_BASE_URL") && readEnv("BACKUP_AI_API_KEY") && readEnv("BACKUP_AI_MODEL"));
}

export function getBackupAiInfo() {
  const baseUrl = readEnv("BACKUP_AI_BASE_URL");
  let provider = "";
  try {
    provider = baseUrl ? new URL(baseUrl).hostname : "";
  } catch {
    provider = "";
  }
  return { configured: isBackupAiConfigured(), provider, model: readEnv("BACKUP_AI_MODEL") || null };
}

async function callChat(prompt: string, temperature: number, jsonMode: boolean, timeoutMs: number) {
  const baseUrl = readEnv("BACKUP_AI_BASE_URL").replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${readEnv("BACKUP_AI_API_KEY")}`,
      },
      body: JSON.stringify({
        model: readEnv("BACKUP_AI_MODEL"),
        temperature,
        messages: [
          { role: "system", content: "Reply with one valid JSON object only. No markdown, no code fences." },
          { role: "user", content: prompt },
        ],
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string } | string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    if (!response.ok) {
      const message =
        typeof payload.error === "string"
          ? payload.error
          : payload.error?.message || `Backup AI request failed (${response.status}).`;
      const error = new Error(message) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    const text = payload.choices?.[0]?.message?.content || "";
    if (!text.trim()) throw new Error("Backup AI returned an empty response.");
    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Backup AI request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Ask the backup provider for a JSON answer; returns the raw text (parsed by the caller). */
export async function generateBackupText(prompt: string, temperature: number, timeoutMs = BACKUP_TIMEOUT_MS) {
  if (!isBackupAiConfigured()) throw new Error("Backup AI is not configured.");
  try {
    return await callChat(prompt, temperature, true, timeoutMs);
  } catch (error) {
    // Some providers/models reject JSON mode; retry once with a plain request.
    const status = (error as { status?: number }).status || 0;
    if (status === 400 || status === 422) return callChat(prompt, temperature, false, timeoutMs);
    throw error;
  }
}
