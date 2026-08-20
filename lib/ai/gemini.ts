type GeminiJson = Record<string, unknown>;

export class GeminiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiConfigError";
  }
}

export class GeminiRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiRateLimitError";
  }
}

type CacheEntry = { expiresAt: number; value: unknown };

const globalStore = globalThis as typeof globalThis & {
  __dcGeminiCache?: Map<string, CacheEntry>;
};

if (!globalStore.__dcGeminiCache) {
  globalStore.__dcGeminiCache = new Map();
}

const CACHE_TTL_MS = 5 * 60 * 1000;

/** Free-tier Flash models, tried in order if GEMINI_MODEL is unset or unavailable. */
const FREE_TIER_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
];

export type GeminiGenerateOptions = {
  cacheKey?: string;
  skipCache?: boolean;
  temperature?: number;
};

export function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || FREE_TIER_MODELS[0];
}

export function getGeminiModelCandidates() {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const list = preferred ? [preferred, ...FREE_TIER_MODELS] : [...FREE_TIER_MODELS];
  return [...new Set(list.filter(Boolean))];
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function cacheGet<T>(key: string): T | null {
  const hit = globalStore.__dcGeminiCache!.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    globalStore.__dcGeminiCache!.delete(key);
    return null;
  }
  return hit.value as T;
}

function cacheSet(key: string, value: unknown) {
  globalStore.__dcGeminiCache!.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
}

function extractJson(text: string): GeminiJson {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : trimmed).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const slice = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  return JSON.parse(slice) as GeminiJson;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUnavailableModel(status: number, message: string) {
  const text = message.toLowerCase();
  return (
    status === 404 ||
    text.includes("not found") ||
    text.includes("is not found") ||
    text.includes("no longer available") ||
    text.includes("not supported")
  );
}

async function generateContent(model: string, prompt: string, temperature: number) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiConfigError(
      "Gemini is not configured. Add GEMINI_API_KEY to .env.local and restart the server.",
    );
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });

    const payload = (await response.json()) as {
      error?: { message?: string; status?: string };
      promptFeedback?: { blockReason?: string };
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const message = payload.error?.message || `Gemini request failed (${response.status}).`;
    if (response.status === 429 || payload.error?.status === "RESOURCE_EXHAUSTED") {
      throw new GeminiRateLimitError(message);
    }
    if (!response.ok) {
      const error = new Error(message) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    if (payload.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked the prompt (${payload.promptFeedback.blockReason}).`);
    }

    const text =
      payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    if (!text.trim()) {
      throw new Error("Gemini returned an empty response.");
    }
    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Gemini request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Call Gemini and parse a JSON object. Cached per key for a few minutes. */
export async function generateGeminiJson<T extends GeminiJson>(
  prompt: string,
  cacheKeyOrOptions?: string | GeminiGenerateOptions,
): Promise<T> {
  const options: GeminiGenerateOptions =
    typeof cacheKeyOrOptions === "string"
      ? { cacheKey: cacheKeyOrOptions }
      : cacheKeyOrOptions || {};

  if (options.cacheKey && !options.skipCache) {
    const cached = cacheGet<T>(options.cacheKey);
    if (cached) return cached;
  }

  if (!isGeminiConfigured()) {
    throw new GeminiConfigError(
      "Gemini is not configured. Add GEMINI_API_KEY to .env.local and restart the server.",
    );
  }

  const models = getGeminiModelCandidates();
  const temperature = options.temperature ?? 0.4;
  let lastError: unknown;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const text = await generateContent(model, prompt, temperature);
        const parsed = extractJson(text) as T;
        if (options.cacheKey) cacheSet(options.cacheKey, parsed);
        return parsed;
      } catch (error) {
        lastError = error;
        if (error instanceof GeminiConfigError) throw error;
        if (error instanceof GeminiRateLimitError) {
          if (attempt === 0) {
            await sleep(1600);
            continue;
          }
          break;
        }
        const status = (error as { status?: number }).status || 0;
        const message = error instanceof Error ? error.message : "";
        if (isUnavailableModel(status, message)) break;
        if (status === 400 || status === 401 || status === 403) throw error;
        if (attempt === 0 && (status >= 500 || status === 0)) {
          await sleep(800);
          continue;
        }
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini request failed.");
}

export function geminiErrorResponse(error: unknown) {
  if (error instanceof GeminiConfigError) {
    return { error: error.message, code: "not_configured" as const, status: 503 };
  }
  if (error instanceof GeminiRateLimitError) {
    return {
      error: "Gemini free-tier rate limit reached. Wait a minute and try again.",
      details: error.message,
      code: "rate_limited" as const,
      status: 429,
    };
  }
  const details = error instanceof Error ? error.message : "Unknown Gemini error.";
  return { error: "Failed to generate AI insights.", details, status: 502 };
}
