import { Plugin } from "@opencode/plugin"
import { readFile } from "node:fs/promises"

// Per-subagent model + effort overrides. Re-read on every subagent launch,
// so edits take effect immediately without restarting OpenCode.
const OVERRIDES_FILE = `${process.env.HOME}/.config/opencode/agent-models.json`

type Override = { providerID: string; model: string; variant?: string }

async function loadOverrides(): Promise<Record<string, Override>> {
  try {
    return JSON.parse(await readFile(OVERRIDES_FILE, "utf8"))
  } catch {
    return {}
  }
}

export default Plugin.define({
  id: "agent-models",
  async setup(ctx) {
    await ctx.session.hook("prompt", async (event: any) => {
      const res: any = await ctx.session.get({ sessionID: event.sessionID })
      const info: any = res?.data ?? res
      if (!info?.parentID) return // subagents only
      const agent = info?.agent
      if (!agent) return
      const entry = (await loadOverrides())[agent]
      if (!entry?.providerID || !entry?.model) return
      await ctx.session.switchModel({
        sessionID: event.sessionID,
        model: { providerID: entry.providerID, id: entry.model, variant: entry.variant },
      })
    })
  },
})
