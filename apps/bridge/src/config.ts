import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Provider presets — not persisted, just known endpoints
// ---------------------------------------------------------------------------

export type Provider = { id: string; name: string; baseUrl: string };

const PRESETS: Provider[] = [
  { id: "anthropic",  name: "Anthropic",   baseUrl: "https://api.anthropic.com/v1" },
  { id: "openai",     name: "OpenAI",      baseUrl: "https://api.openai.com/v1" },
  { id: "google",     name: "Google AI",   baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { id: "openrouter", name: "OpenRouter",  baseUrl: "https://openrouter.ai/api/v1" },
  { id: "xai",        name: "xAI",         baseUrl: "https://api.x.ai/v1" },
  { id: "deepseek",   name: "DeepSeek",    baseUrl: "https://api.deepseek.com/v1" },
  { id: "mistral",    name: "Mistral",     baseUrl: "https://api.mistral.ai/v1" },
  { id: "ollama",     name: "Ollama",      baseUrl: "http://localhost:11434/v1" },
];

// ---------------------------------------------------------------------------
// Config — the flat operational state
// ---------------------------------------------------------------------------

export type SlopConfig = {
  provider: string;                          // active provider id
  model: string;                             // model id sent to the API
  baseUrl: string;                           // chat/completions endpoint root
  plannerMode: "auto" | "cloud" | "heuristic";
  keys: Record<string, string>;              // provider id → api key
  customProviders?: Provider[];              // user-added endpoints
};

const CONFIG_DIR = join(process.env.HOME ?? "/tmp", ".slopos");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULTS: SlopConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  baseUrl: "https://api.anthropic.com/v1",
  plannerMode: "auto",
  keys: {},
};

let cached: SlopConfig | null = null;

export async function loadConfig(): Promise<SlopConfig> {
  if (cached) return cached;
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<SlopConfig>;
    cached = {
      provider: parsed.provider ?? DEFAULTS.provider,
      model: parsed.model ?? DEFAULTS.model,
      baseUrl: parsed.baseUrl ?? DEFAULTS.baseUrl,
      plannerMode: parsed.plannerMode ?? DEFAULTS.plannerMode,
      keys: parsed.keys ?? {},
      customProviders: parsed.customProviders,
    };
    return cached;
  } catch {
    cached = { ...DEFAULTS, keys: {} };
    return cached;
  }
}

export async function saveConfig(config: SlopConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  cached = config;
}

/** Resolve the final endpoint for an LLM call (env vars override config). */
export function resolveEndpoint(config: SlopConfig): {
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
} {
  const envKey = Bun.env.OPENAI_API_KEY;
  const envUrl = Bun.env.OPENAI_BASE_URL;
  const envModel = Bun.env.PILOT_MODEL ?? Bun.env.OPENAI_MODEL;

  return {
    baseUrl: envUrl ?? config.baseUrl,
    apiKey: envKey ?? config.keys[config.provider],
    model: envModel ?? config.model,
  };
}

/** All known providers: presets + user-added. */
export function listProviders(config: SlopConfig): Provider[] {
  return [...PRESETS, ...(config.customProviders ?? [])];
}
