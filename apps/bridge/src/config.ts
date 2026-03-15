import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type ProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  models?: Array<{ id: string; name: string }>;
  headers?: Record<string, string>;
};

export type SlopConfig = {
  activeProvider: string;
  activeModel: string;
  plannerMode: "auto" | "cloud" | "heuristic";
  providers: Record<string, ProviderConfig>;
};

const CONFIG_DIR = join(process.env.HOME ?? "/tmp", ".slopos");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const BUILTIN_PROVIDERS: Record<string, ProviderConfig> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: [
      { id: "gpt-4.1", name: "GPT-4.1" },
      { id: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
      { id: "gpt-4.1-nano", name: "GPT-4.1 Nano" },
      { id: "o3", name: "o3" },
      { id: "o4-mini", name: "o4-mini" }
    ]
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    models: [
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
      { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" }
    ]
  },
  google: {
    id: "google",
    name: "Google AI",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" }
    ]
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      { id: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
      { id: "anthropic/claude-opus-4-6", name: "Claude Opus 4.6" },
      { id: "openai/gpt-4.1", name: "GPT-4.1" },
      { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" }
    ]
  },
  ollama: {
    id: "ollama",
    name: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    models: [
      { id: "llama3.3", name: "Llama 3.3" },
      { id: "qwen3", name: "Qwen 3" },
      { id: "deepseek-r1", name: "DeepSeek R1" }
    ]
  }
};

function defaultConfig(): SlopConfig {
  return {
    activeProvider: "openai",
    activeModel: "gpt-4.1",
    plannerMode: "auto",
    providers: { ...BUILTIN_PROVIDERS }
  };
}

let cached: SlopConfig | null = null;

export async function loadConfig(): Promise<SlopConfig> {
  if (cached) return cached;

  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<SlopConfig>;

    // Merge builtins (user config overrides)
    const providers = { ...BUILTIN_PROVIDERS };
    if (parsed.providers) {
      for (const [id, provider] of Object.entries(parsed.providers)) {
        providers[id] = { ...providers[id], ...provider };
      }
    }

    cached = {
      activeProvider: parsed.activeProvider ?? "openai",
      activeModel: parsed.activeModel ?? "gpt-4.1",
      plannerMode: parsed.plannerMode ?? "auto",
      providers
    };

    return cached;
  } catch {
    cached = defaultConfig();
    return cached;
  }
}

export async function saveConfig(config: SlopConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });

  // Only persist non-builtin overrides and user settings
  const persistProviders: Record<string, Partial<ProviderConfig>> = {};
  for (const [id, provider] of Object.entries(config.providers)) {
    const builtin = BUILTIN_PROVIDERS[id];
    if (!builtin) {
      // Custom provider — persist fully
      persistProviders[id] = provider;
    } else if (provider.apiKey) {
      // Builtin with user-set API key — persist key only
      persistProviders[id] = { apiKey: provider.apiKey };
      if (provider.baseUrl !== builtin.baseUrl) {
        persistProviders[id].baseUrl = provider.baseUrl;
      }
      if (provider.models && JSON.stringify(provider.models) !== JSON.stringify(builtin.models)) {
        persistProviders[id].models = provider.models;
      }
    }
  }

  const persisted = {
    activeProvider: config.activeProvider,
    activeModel: config.activeModel,
    plannerMode: config.plannerMode,
    providers: persistProviders
  };

  await writeFile(CONFIG_PATH, JSON.stringify(persisted, null, 2), "utf8");
  cached = config;
}

export function getActiveProviderConfig(config: SlopConfig): { baseUrl: string; apiKey: string | undefined; model: string } {
  const provider = config.providers[config.activeProvider];

  // Environment variables override config
  const envKey = Bun.env.OPENAI_API_KEY;
  const envBaseUrl = Bun.env.OPENAI_BASE_URL;
  const envModel = Bun.env.PILOT_MODEL ?? Bun.env.OPENAI_MODEL;

  return {
    baseUrl: envBaseUrl ?? provider?.baseUrl ?? "https://api.openai.com/v1",
    apiKey: envKey ?? provider?.apiKey,
    model: envModel ?? config.activeModel
  };
}

export function getBuiltinProviders() {
  return BUILTIN_PROVIDERS;
}
