import { Plugin } from "@opencode/plugin"
import { readFile, writeFile } from "node:fs/promises"

// Per-subagent model + effort overrides. Re-read on every subagent launch, so
// edits apply immediately without restarting OpenCode. Written by the
// set_subagent_model tool, which the /subagents command drives.
const OVERRIDES_FILE = `${process.env.HOME}/.config/opencode/agent-models.json`

export const COMBOS = [
  { value: "deepseek/deepseek-flash#low", providerID: "deepseek", model: "deepseek-flash", variant: "low", label: "DeepSeek Flash · low" },
  { value: "deepseek/deepseek-flash#high", providerID: "deepseek", model: "deepseek-flash", variant: "high", label: "DeepSeek Flash · high" },
  { value: "deepseek/deepseek-flash#max", providerID: "deepseek", model: "deepseek-flash", variant: "max", label: "DeepSeek Flash · max" },
  { value: "openrouter/xiaomi/mimo-v2.6-pro#none", providerID: "openrouter", model: "xiaomi/mimo-v2.6-pro", variant: "none", label: "MiMo 2.6 Pro · none" },
  { value: "openrouter/xiaomi/mimo-v2.6-pro#thinking", providerID: "openrouter", model: "xiaomi/mimo-v2.6-pro", variant: "thinking", label: "MiMo 2.6 Pro · thinking" },
  { value: "openai/gpt-6-luna#low", providerID: "openai", model: "gpt-6-luna", variant: "low", label: "GPT 6 Luna · low" },
  { value: "openai/gpt-6-luna#high", providerID: "openai", model: "gpt-6-luna", variant: "high", label: "GPT 6 Luna · high" },
  { value: "openai/gpt-6-luna#max", providerID: "openai", model: "gpt-6-luna", variant: "max", label: "GPT 6 Luna · max" },
]

async function loadOverrides(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(OVERRIDES_FILE, "utf8"))
  } catch {
    return {}
  }
}

export default Plugin.define({
  id: "agent-models",
  async setup(ctx) {
    // Apply the overrides to every subagent session at launch time.
    await ctx.session.hook("prompt", async (event: any) => {
      const res: any = await ctx.session.get({ sessionID: event.sessionID })
      const info: any = res?.data ?? res
      if (!info?.parentID || !info?.agent) return
      const entry: any = (await loadOverrides())[info.agent]
      if (!entry?.providerID || !entry?.model) return
      await ctx.session.switchModel({
        sessionID: event.sessionID,
        model: { providerID: entry.providerID, id: entry.model, variant: entry.variant },
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
          const overrides = await loadOverrides()
          if (input.clear) {
            delete overrides[input.agent]
          } else {
            const combo = COMBOS.find((c) => c.value === input.combo)
            if (!combo) return { content: `unknown combo: ${input.combo}` }
            overrides[input.agent] = { providerID: combo.providerID, model: combo.model, variant: combo.variant }
          }
          await writeFile(OVERRIDES_FILE, JSON.stringify(overrides, null, 2) + "\n")
          return { content: JSON.stringify(overrides) }
        },
      })
    })
  },
})
