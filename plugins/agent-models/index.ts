import { Plugin } from "@opencode/plugin"
import { readFile, rename, rm, writeFile } from "node:fs/promises"

// Per-subagent model + effort overrides. Re-read on every subagent launch, so
// edits apply immediately without restarting OpenCode. Written by the
// set_subagent_model (one agent) and set_subagent_models (whole preset) tools,
// which the /subagents command drives.
const OVERRIDES_FILE = `${process.env.HOME}/.config/opencode/agent-models.json`

// Whole-subagent model sets applied at once by set_subagent_models. Effort
// tiers per agent: researcher=max; implementer/reviewer=mid; worker/
// test-engineer=low; product-analyst/system-analyst/requirements-reviewer/
// security-reviewer/architect/oracle=max; uxui/motion-designer/devops-tsai/
// game-developer=high; project-manager/web-crawler=low. The tier map drives
// the deepseek and opencode-free presets and every agent the user did not call
// out; `mid` becomes `high` for models with no `medium` variant
// (deepseek-flash, the opencode free model). The codex and claude-code presets
// carry explicit per-agent values from the user's spec, which are
// authoritative over the tier map.
// This file is installed as a single symlinked file, so it must stay
// self-contained: no relative imports, no sibling modules.
export const PRESETS = [
  {
    id: "deepseek",
    label: "DeepSeek (Default)",
    description: "Every subagent on deepseek/deepseek-flash with its profile effort.",
    models: [
      { agent: "researcher", providerID: "deepseek", model: "deepseek-flash", variant: "max" },
      { agent: "implementer", providerID: "deepseek", model: "deepseek-flash", variant: "high" },
      { agent: "reviewer", providerID: "deepseek", model: "deepseek-flash", variant: "high" },
      { agent: "worker", providerID: "deepseek", model: "deepseek-flash", variant: "low" },
      { agent: "test-engineer", providerID: "deepseek", model: "deepseek-flash", variant: "low" },
      { agent: "product-analyst", providerID: "deepseek", model: "deepseek-flash", variant: "max" },
      { agent: "system-analyst", providerID: "deepseek", model: "deepseek-flash", variant: "max" },
      { agent: "requirements-reviewer", providerID: "deepseek", model: "deepseek-flash", variant: "max" },
      { agent: "security-reviewer", providerID: "deepseek", model: "deepseek-flash", variant: "max" },
      { agent: "architect", providerID: "deepseek", model: "deepseek-flash", variant: "max" },
      { agent: "oracle", providerID: "deepseek", model: "deepseek-flash", variant: "max" },
      { agent: "uxui", providerID: "deepseek", model: "deepseek-flash", variant: "high" },
      { agent: "motion-designer", providerID: "deepseek", model: "deepseek-flash", variant: "high" },
      { agent: "devops-tsai", providerID: "deepseek", model: "deepseek-flash", variant: "high" },
      { agent: "game-developer", providerID: "deepseek", model: "deepseek-flash", variant: "high" },
      { agent: "project-manager", providerID: "deepseek", model: "deepseek-flash", variant: "low" },
      { agent: "web-crawler", providerID: "deepseek", model: "deepseek-flash", variant: "low" },
    ],
  },
  {
    id: "opencode-free",
    label: "Opencode DeepSeek free",
    description: "Same effort profile on the free opencode/deepseek-v4.1-flash-free model.",
    models: [
      { agent: "researcher", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "max" },
      { agent: "implementer", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "high" },
      { agent: "reviewer", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "high" },
      { agent: "worker", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "low" },
      { agent: "test-engineer", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "low" },
      { agent: "product-analyst", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "max" },
      { agent: "system-analyst", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "max" },
      { agent: "requirements-reviewer", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "max" },
      { agent: "security-reviewer", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "max" },
      { agent: "architect", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "max" },
      { agent: "oracle", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "max" },
      { agent: "uxui", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "high" },
      { agent: "motion-designer", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "high" },
      { agent: "devops-tsai", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "high" },
      { agent: "game-developer", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "high" },
      { agent: "project-manager", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "low" },
      { agent: "web-crawler", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "low" },
    ],
  },
  {
    id: "codex",
    label: "Codex",
    description: "Researcher on openai/gpt-6.1-sol#medium, every other subagent on openai/gpt-6-luna.",
    models: [
      { agent: "researcher", providerID: "openai", model: "gpt-6.1-sol", variant: "medium" },
      { agent: "implementer", providerID: "openai", model: "gpt-6-luna", variant: "high" },
      { agent: "reviewer", providerID: "openai", model: "gpt-6-luna", variant: "high" },
      { agent: "worker", providerID: "openai", model: "gpt-6-luna", variant: "low" },
      { agent: "test-engineer", providerID: "openai", model: "gpt-6-luna", variant: "low" },
      { agent: "product-analyst", providerID: "openai", model: "gpt-6-luna", variant: "max" },
      { agent: "system-analyst", providerID: "openai", model: "gpt-6-luna", variant: "max" },
      { agent: "requirements-reviewer", providerID: "openai", model: "gpt-6-luna", variant: "max" },
      { agent: "security-reviewer", providerID: "openai", model: "gpt-6-luna", variant: "max" },
      { agent: "architect", providerID: "openai", model: "gpt-6-luna", variant: "max" },
      { agent: "oracle", providerID: "openai", model: "gpt-6-luna", variant: "max" },
      { agent: "uxui", providerID: "openai", model: "gpt-6-luna", variant: "high" },
      { agent: "motion-designer", providerID: "openai", model: "gpt-6-luna", variant: "high" },
      { agent: "devops-tsai", providerID: "openai", model: "gpt-6-luna", variant: "high" },
      { agent: "game-developer", providerID: "openai", model: "gpt-6-luna", variant: "high" },
      { agent: "project-manager", providerID: "openai", model: "gpt-6-luna", variant: "low" },
      { agent: "web-crawler", providerID: "openai", model: "gpt-6-luna", variant: "low" },
    ],
  },
  {
    id: "claude-code",
    label: "Claude Code",
    description: "worker Haiku 5.5 #low; implementer/reviewer/test-engineer Sonnet 5.5 #low; researcher Sonnet 5.5 #high; product-analyst/system-analyst/requirements-reviewer/security-reviewer/architect/oracle Sonnet 5.5 #max; uxui/motion-designer/devops-tsai/game-developer Sonnet 5.5 #high; project-manager/web-crawler Sonnet 5.5 #low.",
    models: [
      { agent: "researcher", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "high" },
      { agent: "implementer", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "low" },
      { agent: "reviewer", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "low" },
      { agent: "worker", providerID: "claude-code", model: "claude-haiku-5-5", variant: "low" },
      { agent: "test-engineer", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "low" },
      { agent: "product-analyst", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "max" },
      { agent: "system-analyst", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "max" },
      { agent: "requirements-reviewer", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "max" },
      { agent: "security-reviewer", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "max" },
      { agent: "architect", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "max" },
      { agent: "oracle", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "max" },
      { agent: "uxui", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "high" },
      { agent: "motion-designer", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "high" },
      { agent: "devops-tsai", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "high" },
      { agent: "game-developer", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "high" },
      { agent: "project-manager", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "low" },
      { agent: "web-crawler", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "low" },
    ],
  },
]

// One-off override choices for set_subagent_model: every model+variant pair the
// presets can write, plus the legacy openrouter entries.
export const COMBOS = [
  { value: "deepseek/deepseek-flash#low", providerID: "deepseek", model: "deepseek-flash", variant: "low", label: "DeepSeek Flash · low" },
  { value: "deepseek/deepseek-flash#high", providerID: "deepseek", model: "deepseek-flash", variant: "high", label: "DeepSeek Flash · high" },
  { value: "deepseek/deepseek-flash#max", providerID: "deepseek", model: "deepseek-flash", variant: "max", label: "DeepSeek Flash · max" },
  { value: "opencode/deepseek-v4.1-flash-free#low", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "low", label: "DeepSeek Flash Free · low" },
  { value: "opencode/deepseek-v4.1-flash-free#high", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "high", label: "DeepSeek Flash Free · high" },
  { value: "opencode/deepseek-v4.1-flash-free#max", providerID: "opencode", model: "deepseek-v4.1-flash-free", variant: "max", label: "DeepSeek Flash Free · max" },
  { value: "openrouter/xiaomi/mimo-v2.6-pro#none", providerID: "openrouter", model: "xiaomi/mimo-v2.6-pro", variant: "none", label: "MiMo 2.6 Pro · none" },
  { value: "openrouter/xiaomi/mimo-v2.6-pro#thinking", providerID: "openrouter", model: "xiaomi/mimo-v2.6-pro", variant: "thinking", label: "MiMo 2.6 Pro · thinking" },
  { value: "openai/gpt-6-luna#low", providerID: "openai", model: "gpt-6-luna", variant: "low", label: "GPT 6 Luna · low" },
  { value: "openai/gpt-6-luna#medium", providerID: "openai", model: "gpt-6-luna", variant: "medium", label: "GPT 6 Luna · medium" },
  { value: "openai/gpt-6-luna#high", providerID: "openai", model: "gpt-6-luna", variant: "high", label: "GPT 6 Luna · high" },
  { value: "openai/gpt-6-luna#max", providerID: "openai", model: "gpt-6-luna", variant: "max", label: "GPT 6 Luna · max" },
  { value: "openai/gpt-6.1-sol#low", providerID: "openai", model: "gpt-6.1-sol", variant: "low", label: "GPT 6.1 Sol · low" },
  { value: "openai/gpt-6.1-sol#medium", providerID: "openai", model: "gpt-6.1-sol", variant: "medium", label: "GPT 6.1 Sol · medium" },
  { value: "openai/gpt-6.1-sol#high", providerID: "openai", model: "gpt-6.1-sol", variant: "high", label: "GPT 6.1 Sol · high" },
  { value: "openai/gpt-6.1-sol#max", providerID: "openai", model: "gpt-6.1-sol", variant: "max", label: "GPT 6.1 Sol · max" },
  { value: "claude-code/claude-sonnet-5-5#low", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "low", label: "Claude Sonnet 5.5 · low" },
  { value: "claude-code/claude-sonnet-5-5#medium", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "medium", label: "Claude Sonnet 5.5 · medium" },
  { value: "claude-code/claude-sonnet-5-5#high", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "high", label: "Claude Sonnet 5.5 · high" },
  { value: "claude-code/claude-sonnet-5-5#max", providerID: "claude-code", model: "claude-sonnet-5-5", variant: "max", label: "Claude Sonnet 5.5 · max" },
  { value: "claude-code/claude-haiku-5-5#low", providerID: "claude-code", model: "claude-haiku-5-5", variant: "low", label: "Claude Haiku 5.5 · low" },
  { value: "claude-code/claude-haiku-5-5#medium", providerID: "claude-code", model: "claude-haiku-5-5", variant: "medium", label: "Claude Haiku 5.5 · medium" },
  { value: "claude-code/claude-haiku-5-5#high", providerID: "claude-code", model: "claude-haiku-5-5", variant: "high", label: "Claude Haiku 5.5 · high" },
  { value: "claude-code/claude-haiku-5-5#max", providerID: "claude-code", model: "claude-haiku-5-5", variant: "max", label: "Claude Haiku 5.5 · max" },
]

async function loadOverrides(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(OVERRIDES_FILE, "utf8"))
  } catch {
    return {}
  }
}

// Serialize the whole load → mutate → write critical section. Every call comes
// from this process, so a module-level promise chain is enough to stop
// concurrent set_subagent_model calls from clobbering each other's updates.
let writeQueue: Promise<unknown> = Promise.resolve()
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, fn)
  writeQueue = result.then(() => undefined, () => undefined)
  return result
}

// Write via a temp file in the same directory + rename, so the prompt hook's
// concurrent loadOverrides() never reads a truncated file.
async function saveOverrides(overrides: Record<string, unknown>): Promise<void> {
  const tmp = `${OVERRIDES_FILE}.tmp-${process.pid}`
  try {
    await writeFile(tmp, JSON.stringify(overrides, null, 2) + "\n")
    await rename(tmp, OVERRIDES_FILE)
  } finally {
    // The rename removes tmp on success; if we crashed before it, clean up the
    // leftover. force ignores a missing file, and cleanup errors never mask the
    // original failure.
    await rm(tmp, { force: true }).catch(() => {})
  }
}

const PRESET_IDS = ["deepseek", "opencode-free", "codex", "claude-code", "none"]

export default Plugin.define({
  id: "agent-models",
  async setup(ctx) {
    // Apply the overrides to every subagent session at launch time.
    await ctx.session.hook("prompt", async (event: any) => {
      let info: any
      let entry: any
      try {
        const res: any = await ctx.session.get({ sessionID: event.sessionID })
        info = res?.data ?? res
        if (!info?.parentID || !info?.agent) return
        entry = (await loadOverrides())[info.agent]
        if (!entry?.providerID || !entry?.model) return
        await ctx.session.switchModel({
          sessionID: event.sessionID,
          model: { providerID: entry.providerID, id: entry.model, variant: entry.variant },
        })
      } catch (error) {
        // Never rethrow: this hook must not make the subagent's own prompt
        // fail. Covers ctx.session.get/loadOverrides throwing as well as an
        // unavailable/unauthenticated provider or a bad override entry. The
        // subagent simply keeps its default model. Log best-effort only.
        if (typeof console !== "undefined" && typeof console.warn === "function") {
          console.warn(
            `agent-models: prompt hook skipped override for ${info?.agent ?? "unknown agent"}`,
            entry ? { providerID: entry.providerID, model: entry.model, variant: entry.variant } : "no override entry",
            error,
          )
        }
      }
    })

    // Apply one preset to every subagent. Driven by the /subagents command.
    await ctx.tool.transform((editor) => {
      editor.add({
        name: "set_subagent_models",
        description:
          "Apply one preset model+effort set to ALL subagents at once, replacing the whole overrides file. Use preset \"none\" to clear every override.",
        input: {
          type: "object",
          properties: {
            preset: {
              type: "string",
              enum: PRESET_IDS,
              description: "preset id: deepseek, opencode-free, codex, claude-code, or none to clear",
            },
          },
          required: ["preset"],
          additionalProperties: false,
        },
        execute: async (input: any) => {
          const presetId = input?.preset
          const preset = PRESETS.find((p) => p.id === presetId)
          if (!preset && presetId !== "none") {
            return { content: `unknown preset: ${presetId}. valid presets: ${PRESET_IDS.join(", ")}` }
          }
          return serialize(async () => {
            const overrides: Record<string, unknown> = {}
            for (const m of preset?.models ?? []) {
              overrides[m.agent] = { providerID: m.providerID, model: m.model, variant: m.variant }
            }
            await saveOverrides(overrides)
            if (presetId === "none") return { content: `all overrides cleared\n${JSON.stringify(overrides)}` }
            return { content: JSON.stringify(overrides) }
          })
        },
      })
    })

    // Write (or clear) one override. Driven by the /subagents command.
    await ctx.tool.transform((editor) => {
      editor.add({
        name: "set_subagent_model",
        description:
          "Set or clear the model override for one subagent. Pass combo with one of the offered provider/model#variant values, or clear=true to remove the override.",
        input: {
          type: "object",
          properties: {
            agent: { type: "string", description: "subagent name, e.g. worker" },
            combo: { type: "string", description: "provider/model#variant value from the offered list" },
            clear: { type: "boolean", description: "remove the override instead of setting it" },
          },
          required: ["agent"],
          additionalProperties: false,
        },
        execute: async (input: any) => {
          return serialize(async () => {
            const overrides = await loadOverrides()
            if (input.clear) {
              delete overrides[input.agent]
            } else {
              const combo = COMBOS.find((c) => c.value === input.combo)
              if (!combo) return { content: `unknown combo: ${input.combo}` }
              overrides[input.agent] = { providerID: combo.providerID, model: combo.model, variant: combo.variant }
            }
            await saveOverrides(overrides)
            return { content: JSON.stringify(overrides) }
          })
        },
      })
    })
  },
})
