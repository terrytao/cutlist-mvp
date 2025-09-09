// src/lib/providers.ts
// Tiny helper to detect which external AI providers are configured via env vars.

export type LLMProvider = "openai" | "anthropic" | "google" | "together" | "openrouter";
export type ImageProvider = "stability" | "replicate" | "fal";

export type ProviderInfo = {
  llm?: LLMProvider;
  vision?: LLMProvider;
  image?: ImageProvider | `${ImageProvider}+${ImageProvider}`;
  enabled: string[];
  warnings: string[];
  flags: {
    DRY_RUN_LLM: boolean;
    ENABLE_IMAGE_GEN: boolean;
  };
};

function has(key: string) {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}
function envList(keys: string[]) { return keys.filter(has); }

/** Detect configured providers by environment variables. */
export function detectProviders(): ProviderInfo {
  const enabled: string[] = [];
  const warnings: string[] = [];

  // ----- LLM (text/vision) priority -----
  let llm: LLMProvider | undefined;
  if (has("OPENAI_API_KEY") || has("AZURE_OPENAI_API_KEY")) { llm = "openai"; enabled.push("openai"); }
  if (!llm && has("ANTHROPIC_API_KEY")) { llm = "anthropic"; enabled.push("anthropic"); }
  if (!llm && (has("GOOGLE_API_KEY") || has("GOOGLE_GENERATIVE_AI_API_KEY"))) { llm = "google"; enabled.push("google"); }
  if (!llm && has("TOGETHER_API_KEY")) { llm = "together"; enabled.push("together"); }
  if (!llm && has("OPENROUTER_API_KEY")) { llm = "openrouter"; enabled.push("openrouter"); }

  // Multiple LLM keys?
  const llmCandidates = [
    ...envList(["OPENAI_API_KEY", "AZURE_OPENAI_API_KEY"]).map(() => "openai"),
    ...envList(["ANTHROPIC_API_KEY"]).map(() => "anthropic"),
    ...envList(["GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"]).map(() => "google"),
    ...envList(["TOGETHER_API_KEY"]).map(() => "together"),
    ...envList(["OPENROUTER_API_KEY"]).map(() => "openrouter"),
  ];
  const uniqueLLMs = Array.from(new Set(llmCandidates));
  if (uniqueLLMs.length > 1) {
    warnings.push(`Multiple LLM providers configured: ${uniqueLLMs.join(", ")}. Using '${llm}' by priority.`);
  }
  if (!llm) warnings.push("No LLM API key set; LLM routes will fail unless DRY_RUN_LLM=1.");

  // Vision usually same as LLM
  const vision: LLMProvider | undefined = llm;

  // ----- Image gen -----
  const imageProviders: ImageProvider[] = [];
  if (has("STABILITY_API_KEY")) { imageProviders.push("stability"); enabled.push("stability"); }
  if (has("REPLICATE_API_TOKEN")) { imageProviders.push("replicate"); enabled.push("replicate"); }
  if (has("FAL_KEY") || has("FAL_API_KEY")) { imageProviders.push("fal"); enabled.push("fal"); }
  const image = imageProviders.length ? (imageProviders.join("+") as ProviderInfo["image"]) : undefined;

  // ----- Flags -----
  const flags = {
    DRY_RUN_LLM: process.env.DRY_RUN_LLM === "1",
    ENABLE_IMAGE_GEN: process.env.ENABLE_IMAGE_GEN === "1",
  };
  if (flags.DRY_RUN_LLM) enabled.push("DRY_RUN_LLM");
  if (flags.ENABLE_IMAGE_GEN) enabled.push("ENABLE_IMAGE_GEN");
  if (!image && flags.ENABLE_IMAGE_GEN) {
    warnings.push("ENABLE_IMAGE_GEN=1 but no image provider key found (STABILITY/REPLICATE/FAL).");
  }

  return { llm, vision, image, enabled: Array.from(new Set(enabled)), warnings, flags };
}

export function formatProviderSummary(info: ProviderInfo = detectProviders()): string {
  const parts = [
    `llm=${info.llm ?? "none"}`,
    `vision=${info.vision ?? "none"}`,
    `image=${info.image ?? "none"}`,
    `flags=${Object.entries(info.flags).map(([k,v]) => `${k}=${v}`).join(",")}`,
  ];
  if (info.warnings.length) parts.push(`warnings=[${info.warnings.join(" | ")}]`);
  return parts.join("  ");
}
