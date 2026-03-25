/**
 * promptFactory.ts — Prompt & Formatter Module Router
 *
 * Accepts a `language` parameter ('ko' | 'en') and returns the correct
 * set of prompt functions and chart-formatter functions.
 * The caller (index.ts) must NEVER import geminiPrompts or chartFormatter directly.
 */

// ─── Korean (default) modules ────────────────────────────────────────────────
import * as koPrompts from "./geminiPrompts.ts";
import * as koFormatter from "./utils/chartFormatter.ts";

// ─── English modules ──────────────────────────────────────────────────────────
import * as enPrompts from "./geminiPrompts_en.ts";
import * as enFormatter from "./utils/chartFormatter_en.ts";

// ─── Type aliases (use the KO module as the canonical type source) ────────────
export type PromptModule = typeof koPrompts;
export type FormatterModule = typeof koFormatter;

/**
 * Returns the prompt module (system instructions, persona, etc.)
 * that corresponds to the requested language.
 *
 * @param language - 'en' | 'ko' (anything not 'en' falls back to Korean)
 */
export function getPromptModule(language: string): PromptModule {
  return language === "en" ? (enPrompts as unknown as PromptModule) : koPrompts;
}

/**
 * Returns the chart-formatter module (user-prompt builders, section formatters)
 * that corresponds to the requested language.
 *
 * @param language - 'en' | 'ko' (anything not 'en' falls back to Korean)
 */
export function getFormatterModule(language: string): FormatterModule {
  return language === "en" ? (enFormatter as unknown as FormatterModule) : koFormatter;
}

/**
 * Convenience: returns both modules together in a single call.
 *
 * @example
 * const { prompts, formatter } = getModules(requestData.language);
 * const systemInstruction = prompts.getSystemInstruction(fortuneType, ...);
 * const userPrompt = formatter.generateDailyUserPrompt(...);
 */
export function getModules(language: string): {
  prompts: PromptModule;
  formatter: FormatterModule;
} {
  const lang = (language ?? "ko").toLowerCase().startsWith("en") ? "en" : "ko";
  return {
    prompts: getPromptModule(lang),
    formatter: getFormatterModule(lang),
  };
}
