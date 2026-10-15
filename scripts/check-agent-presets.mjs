#!/usr/bin/env node
// Validates the PRESETS block of plugins/agent-models/index.ts, which the
// /subagents command applies wholesale to every subagent.
//
// Checks, all textual (no TypeScript/bundler dependency):
//   1. every preset block starts with `id: "<id>"` then label:, description:, models: [;
//   2. every model entry sits on one line with keys in the order
//      { agent, providerID, model, variant };
//   3. every preset covers exactly the non-primary agents/*.md agents, and each
//      non-primary agent's frontmatter `model:` equals its "deepseek" preset
//      entry rendered as `providerID/model#variant` (the default profile);
//   4. providerID is a configured provider (config/opencode.json `providers`)
//      or the built-in `opencode` provider, and each preset is bound to its own
//      provider (deepseek→deepseek, opencode-free→opencode, codex→openai,
//      claude-code→claude-code);
//   5. the provider/model pair is a known model and the variant is allowed for
//      it — derived from config/opencode.json `providers.<p>.models.<m>.variants`
//      where declared, else from the hardcoded registry (keyed by provider/model,
//      so a provider typo fails);
//   6. the plugin's PRESET_IDS enum is exactly {...presets, "none"} (a missing
//      or an extra member fails), and COMBOS has no duplicate `value` and every
//      `value` equals its own `providerID/model#variant`, covering every pair
//      the presets use;
//   7. config/opencode.json commands.subagents.template offers all four presets,
//      asks the question in one call ("ОДНИМ вызовом") and names exactly the
//      bulk tool `set_subagent_models`, which the plugin defines.
//   8. the browser permission policy (fail-closed): config/opencode.json denies
//      the built-in `browser` action and the `browser_*` MCP tools globally
//      (exactly one deny rule each); exactly the agents listed in
//      BROWSER_ALLOW_AGENTS carry the built-in-browser allow rule and exactly
//      the agents in BROWSER_MCP_AGENTS opt in to `browser_*`; no other agent
//      file may carry either rule, so a newly added agent inherits the deny.
//
// Exit code 0 = clean, 1 = violations (printed as a readable list).

import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PLUGIN = join(ROOT, "plugins", "agent-models", "index.ts")
const AGENTS_DIR = join(ROOT, "agents")
const CONFIG = join(ROOT, "config", "opencode.json")

// The four preset ids that must be offered by the /subagents template. The
// plugin's own enum additionally allows "none" (handled in check 6).
const PRESET_IDS = ["deepseek", "opencode-free", "codex", "claude-code"]
const ONE_CALL_PHRASE = "ОДНИМ вызовом"

// Every model pair the presets are allowed to use: the explicit known list.
const KNOWN_MODELS = [
  "deepseek/deepseek-flash",
  "opencode/deepseek-v4.1-flash-free",
  "openai/gpt-6-luna",
  "openai/gpt-6.1-sol",
  "claude-code/claude-sonnet-5-5",
  "claude-code/claude-haiku-5-5",
]

// Variant allow-list for the models whose variants are NOT declared in
// config/opencode.json. This registry mirrors the providers' own model
// definitions and is the authoritative source ONLY for the pairs the repo
// config does not declare (opencode is a built-in provider; openai and
// claude-code declare no `models` in the config). For a pair the config DOES
// declare (`providers.<p>.models.<m>.variants`) the config is authoritative —
// e.g. `deepseek/deepseek-flash` is declared `high|low|max` there, so `none`
// is not allowed even though older registry dumps listed it.
const FALLBACK_VARIANTS = {
  "deepseek/deepseek-flash": ["low", "high", "max"],
  "opencode/deepseek-v4.1-flash-free": ["low", "high", "max"],
  "openai/gpt-6-luna": ["none", "low", "medium", "high", "xhigh", "max"],
  "openai/gpt-6.1-sol": ["low", "medium", "high", "xhigh", "max"],
  "claude-code/claude-sonnet-5-5": ["low", "medium", "high", "xhigh", "max"],
  "claude-code/claude-haiku-5-5": ["low", "medium", "high", "xhigh", "max"],
}

// Each preset must draw from its own provider.
const REQUIRED_PROVIDERS = {
  deepseek: "deepseek",
  "opencode-free": "opencode",
  codex: "openai",
  "claude-code": "claude-code",
}

// The /subagents template must name the bulk preset tool, not the one-off.
const REQUIRED_TOOL = "set_subagent_models"

// --- browser permission policy ----------------------------------------------
// The built-in browser tool (`browser`) is denied globally in config/opencode.json
// and re-opened per agent by an explicit allow rule. These two lists are the
// authoritative opt-in sets, written out on purpose: a newly added agent/*.md
// that is not listed here must stay denied, and the check flags it if it ever
// gains a browser rule. Keeping the lists explicit (rather than "every file
// that happens to exist") is what makes the policy fail-closed.
const BROWSER_ALLOW_AGENTS = [
  "build",
  "researcher",
  "reviewer",
  "web-crawler",
  "motion-designer",
  "orchestrator",
  "implementer",
  "worker",
  "test-engineer",
]
// The single agent additionally opting into the `browser_*` MCP tools: the
// user's own logged-in browser is exposed to exactly `web-crawler` and nobody
// else, so every other agent file must stay without a `browser_*` rule.
const BROWSER_MCP_AGENTS = ["web-crawler"]

// The built-in-browser allow rule must appear as this contiguous block.
const BROWSER_ALLOW_BLOCK_RE =
  /^[ \t]*- action: browser\r?\n[ \t]*resource: "\*"\r?\n[ \t]*effect: allow[ \t]*$/m

const ID_RE = /id:\s*"([a-z0-9-]+)"/
const ENTRY_RE = /\{\s*agent:\s*"([a-z0-9-]+)",\s*providerID:\s*"([^"]+)",\s*model:\s*"([^"]+)",\s*variant:\s*"([^"]+)"\s*\}/
const FIELD_RE = {
  label: /^\s*label:\s*"/,
  description: /^\s*description:\s*"/,
  models: /^\s*models:\s*\[/,
}

const violations = []
const fail = (message) => violations.push(message)

// --- parse the PRESETS blocks ------------------------------------------------

let src
try {
  src = readFileSync(PLUGIN, "utf8")
} catch (error) {
  console.error(`FATAL: cannot read ${PLUGIN}: ${error.message}`)
  process.exit(1)
}

// Read config once, up front: `providers` gates the providerID check and
// `commands.subagents.template` is checked at the end.
let config = null
let configError = null
try {
  config = JSON.parse(readFileSync(CONFIG, "utf8"))
} catch (error) {
  configError = error.message
}

// Allowed providers: every key of config's `providers` plus `opencode`, the
// built-in provider that is deliberately not listed in that config.
const allowedProviders = config
  ? new Set([...Object.keys(config.providers ?? {}), "opencode"])
  : null

// The fallback registry must stay exactly in sync with the known list, so the
// script itself cannot drift away from the models it claims to know.
if ([...KNOWN_MODELS].sort().join("|") !== Object.keys(FALLBACK_VARIANTS).sort().join("|")) {
  fail(
    `check script: FALLBACK_VARIANTS keys (${Object.keys(FALLBACK_VARIANTS).join(", ")}) do not match KNOWN_MODELS (${KNOWN_MODELS.join(", ")})`,
  )
}

// Effective variant allow-list per known pair: repo config wins where it
// declares variants, otherwise the fallback registry above.
function declaredVariants(pair) {
  const slash = pair.indexOf("/")
  const providerID = pair.slice(0, slash)
  const model = pair.slice(slash + 1)
  const variants = config?.providers?.[providerID]?.models?.[model]?.variants
  if (!Array.isArray(variants)) return null
  const ids = variants
    .map((variant) => (typeof variant === "string" ? variant : variant?.id))
    .filter((id) => typeof id === "string")
  return ids.length ? ids : null
}

const ALLOWED_VARIANTS = {}
for (const pair of KNOWN_MODELS) {
  const fromConfig = declaredVariants(pair)
  ALLOWED_VARIANTS[pair] = {
    variants: fromConfig ?? FALLBACK_VARIANTS[pair],
    source: fromConfig ? "config" : "registry",
  }
}

// Scope the scan to the PRESETS array, so unrelated `id: "..."` lines (e.g.
// Plugin.define's own id) cannot start a phantom preset block.
const presetsStart = src.search(/export const PRESETS\s*=\s*\[/)
if (presetsStart === -1) fail(`no \`export const PRESETS = [\` array found in ${PLUGIN}`)
const presetsClose = src.indexOf("\n]", presetsStart)
const region = presetsStart === -1 ? "" : src.slice(presetsStart, presetsClose === -1 ? src.length : presetsClose)

const blocks = []
for (const line of region.split(/\r?\n/)) {
  const idMatch = line.match(ID_RE)
  if (idMatch) blocks.push({ id: idMatch[1], lines: [] })
  else if (blocks.length > 0) blocks[blocks.length - 1].lines.push(line)
}

if (blocks.length === 0 && presetsStart !== -1) {
  fail(`no preset block found in ${PLUGIN} (expected lines like \`id: "deepseek"\`)`)
}

const presets = blocks.map((block) => {
  const entries = []
  for (const line of block.lines) {
    const entryMatch = line.match(ENTRY_RE)
    if (entryMatch) {
      entries.push({ agent: entryMatch[1], providerID: entryMatch[2], model: entryMatch[3], variant: entryMatch[4] })
    } else if (line.includes("agent:")) {
      fail(`preset "${block.id}": malformed entry line (must be one line, keys in order agent, providerID, model, variant): ${line.trim()}`)
    }
  }

  // Mandatory header order: id, label, description, models: [
  const headerOrder = ["label", "description", "models"]
  const headerIndex = headerOrder.map((field) => {
    const index = block.lines.findIndex((line) => FIELD_RE[field].test(line))
    if (index === -1) fail(`preset "${block.id}": missing \`${field}:\` line after the id line`)
    return index
  })
  for (let i = 1; i < headerIndex.length; i++) {
    if (headerIndex[i - 1] !== -1 && headerIndex[i] !== -1 && headerIndex[i] < headerIndex[i - 1]) {
      fail(`preset "${block.id}": \`${headerOrder[i - 1]}:\` must come before \`${headerOrder[i]}:\``)
    }
  }

  const seen = new Set()
  for (const entry of entries) {
    if (seen.has(entry.agent)) fail(`preset "${block.id}": duplicate agent "${entry.agent}"`)
    seen.add(entry.agent)

    if (allowedProviders && !allowedProviders.has(entry.providerID)) {
      fail(
        `preset "${block.id}": agent "${entry.agent}" uses unknown providerID "${entry.providerID}" (allowed: ${[...allowedProviders].sort().join(", ")})`,
      )
    }

    const pair = `${entry.providerID}/${entry.model}`
    if (!KNOWN_MODELS.includes(pair)) {
      fail(`preset "${block.id}": agent "${entry.agent}" uses unknown model pair "${pair}" (known: ${KNOWN_MODELS.join(", ")})`)
      continue
    }

    const allowed = ALLOWED_VARIANTS[pair].variants
    if (!allowed.includes(entry.variant)) {
      fail(
        `preset "${block.id}": agent "${entry.agent}" (${pair}) uses variant "${entry.variant}", allowed (${ALLOWED_VARIANTS[pair].source}): ${allowed.join("|")}`,
      )
    }
  }

  return { id: block.id, entries, agents: seen }
})

// --- plugin PRESET_IDS enum + COMBOS wiring ---------------------------------

const enumMatch = src.match(/const PRESET_IDS\s*=\s*\[([^\]]*)\]/)
if (!enumMatch) {
  fail(`${PLUGIN}: no \`const PRESET_IDS = [...]\` enum found (needed by the set_subagent_models input schema)`)
}
const pluginPresetEnum = new Set((enumMatch?.[1].match(/"([^"]+)"/g) ?? []).map((token) => token.slice(1, -1)))
// The enum must be exactly the preset ids plus "none": a missing member means a
// preset is unreachable, and an extra member advertises a preset that would
// return "unknown preset".
const expectedEnum = new Set([...presets.map((preset) => preset.id), "none"])
for (const id of expectedEnum) {
  if (!pluginPresetEnum.has(id)) fail(`${PLUGIN}: PRESET_IDS enum is missing "${id}"`)
}
for (const id of pluginPresetEnum) {
  if (!expectedEnum.has(id)) fail(`${PLUGIN}: PRESET_IDS enum has extra member "${id}" with no matching preset (only ${[...expectedEnum].join(", ")} are valid)`)
}

// Every COMBOS entry must be self-consistent (`value` == providerID/model#variant)
// and unique, and every provider/model#variant a preset uses must be offered.
const COMBO_RE = /\{\s*value:\s*"([^"]+)",\s*providerID:\s*"([^"]+)",\s*model:\s*"([^"]+)",\s*variant:\s*"([^"]+)",\s*label:\s*"([^"]+)"\s*\}/
const combosMatch = src.match(/export const COMBOS\s*=\s*\[([\s\S]*?)\n\]/)
if (!combosMatch) {
  fail(`no \`export const COMBOS = [\` array found in ${PLUGIN}`)
}
const comboValues = new Set()
for (const line of (combosMatch?.[1] ?? "").split(/\r?\n/)) {
  if (!line.includes("value:")) continue
  const comboMatch = line.match(COMBO_RE)
  if (!comboMatch) {
    fail(`${PLUGIN}: malformed COMBOS entry (expected value, providerID, model, variant, label on one line): ${line.trim()}`)
    continue
  }
  const [, value, providerID, model, variant] = comboMatch
  const expectedValue = `${providerID}/${model}#${variant}`
  if (value !== expectedValue) {
    fail(`${PLUGIN}: COMBOS value "${value}" != its own providerID/model#variant "${expectedValue}"`)
  }
  if (comboValues.has(value)) fail(`${PLUGIN}: duplicate COMBOS value "${value}"`)
  comboValues.add(value)
}
for (const preset of presets) {
  for (const entry of preset.entries) {
    const value = `${entry.providerID}/${entry.model}#${entry.variant}`
    if (!comboValues.has(value)) {
      fail(`preset "${preset.id}": agent "${entry.agent}" uses "${value}", which is missing from COMBOS`)
    }
  }
}

// --- expected agent set: every non-primary agents/*.md -----------------------

// Minimal frontmatter scalar read: the value of `key:` in the leading `---`
// block, one line, optional surrounding quotes.
function frontmatterField(text, key) {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== "---") return undefined
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
  const block = end === -1 ? lines.slice(1) : lines.slice(1, end)
  const pattern = new RegExp(`^${key}:\\s*"?([^"\\s]+)"?\\s*$`)
  for (const line of block) {
    const match = line.match(pattern)
    if (match) return match[1]
  }
  return undefined
}

// Strip one layer of surrounding quotes from a scalar read out of the
// frontmatter (e.g. `"browser_*"` -> `browser_*`, `"*"` -> `*`).
function unquote(value) {
  const match = value.match(/^"([^"]*)"$/) ?? value.match(/^'([^']*)'$/)
  return match ? match[1] : value
}

// Parse the permission rules out of an agent file's leading `---` frontmatter
// block. Each rule is a `- action:` line followed by its `resource:` and
// `effect:` sibling lines; the action line number is kept so a violation can be
// reported as `file:line`. `actionRaw` preserves the on-disk spelling so the
// check can require the exact `browser` / `"browser_*"` forms.
function parsePermissionRules(text) {
  const lines = text.split(/\r?\n/)
  const rules = []
  if (lines[0]?.trim() !== "---") return rules
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
  const limit = end === -1 ? lines.length : end

  let current = null
  for (let i = 1; i < limit; i++) {
    const line = lines[i]
    const action = line.match(/^\s*-\s*action:\s*(.*)$/)
    if (action) {
      current = { actionRaw: action[1].trim(), resource: undefined, resourceLine: undefined, effect: undefined, effectLine: undefined, actionLine: i + 1 }
      rules.push(current)
      continue
    }
    if (!current) continue
    const resource = line.match(/^\s*resource:\s*(.*)$/)
    if (resource) {
      current.resource = unquote(resource[1].trim())
      current.resourceLine = i + 1
      continue
    }
    const effect = line.match(/^\s*effect:\s*(.*)$/)
    if (effect) {
      current.effect = unquote(effect[1].trim())
      current.effectLine = i + 1
    }
  }
  return rules
}

const expected = new Set()
const primary = []
const agentModels = new Map()
let agentFiles
try {
  agentFiles = readdirSync(AGENTS_DIR).filter((name) => name.endsWith(".md")).sort()
} catch (error) {
  console.error(`FATAL: cannot read ${AGENTS_DIR}: ${error.message}`)
  process.exit(1)
}
for (const file of agentFiles) {
  const text = readFileSync(join(AGENTS_DIR, file), "utf8")
  const id = file.replace(/\.md$/, "")
  if (frontmatterField(text, "mode") === "primary") {
    primary.push(id)
  } else {
    expected.add(id)
    agentModels.set(id, frontmatterField(text, "model"))
  }
}

for (const preset of presets) {
  const missing = [...expected].filter((agent) => !preset.agents.has(agent))
  const unexpected = [...preset.agents].filter((agent) => !expected.has(agent))
  if (missing.length) fail(`preset "${preset.id}": missing agents: ${missing.join(", ")}`)
  if (unexpected.length) fail(`preset "${preset.id}": unexpected agents: ${unexpected.join(", ")}`)
}

// --- frontmatter `model:` ↔ "deepseek" preset parity ------------------------

const deepseekPreset = presets.find((preset) => preset.id === "deepseek")
if (!deepseekPreset) {
  fail(`missing required preset "deepseek" (the documented default frontmatter profile)`)
} else {
  const deepseekByAgent = new Map(
    deepseekPreset.entries.map((entry) => [entry.agent, `${entry.providerID}/${entry.model}#${entry.variant}`]),
  )
  for (const [id, model] of agentModels) {
    if (model === undefined) {
      fail(`agents/${id}.md: frontmatter has no \`model:\` line to compare with the "deepseek" preset`)
      continue
    }
    const expectedModel = deepseekByAgent.get(id)
    if (expectedModel !== undefined && model !== expectedModel) {
      fail(`agents/${id}.md: frontmatter model "${model}" != "deepseek" preset entry "${expectedModel}"`)
    }
  }
}

// --- preset → provider binding ----------------------------------------------

for (const [id, providerID] of Object.entries(REQUIRED_PROVIDERS)) {
  const preset = presets.find((candidate) => candidate.id === id)
  if (!preset) continue // a missing preset is already reported above
  for (const entry of preset.entries) {
    if (entry.providerID !== providerID) {
      fail(`preset "${id}": agent "${entry.agent}" uses providerID "${entry.providerID}", expected "${providerID}"`)
    }
  }
}

// --- required preset ids and config wiring ----------------------------------

for (const id of PRESET_IDS) {
  if (!presets.some((preset) => preset.id === id)) fail(`missing required preset "${id}"`)
}
const extra = presets.map((preset) => preset.id).filter((id) => !PRESET_IDS.includes(id))
if (extra.length) fail(`unexpected preset id(s): ${extra.join(", ")}`)

let templateNote = "checked"
if (configError) {
  fail(`${CONFIG}: cannot read/parse: ${configError}`)
  templateNote = "unreadable"
} else {
  const template = config?.commands?.subagents?.template
  if (typeof template !== "string") {
    fail(`${CONFIG}: commands.subagents.template is missing or not a string`)
    templateNote = "missing"
  } else {
    if (!template.includes(ONE_CALL_PHRASE)) {
      fail(`${CONFIG}: commands.subagents.template does not contain the phrase "${ONE_CALL_PHRASE}"`)
    }
    for (const id of PRESET_IDS) {
      const bounded = new RegExp(`(^|[^a-z0-9-])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9-]|$)`)
      if (!bounded.test(template)) fail(`${CONFIG}: commands.subagents.template does not offer preset "${id}"`)
    }

    // The tool the template tells the model to call. The template names it
    // right after "инструмент" ("инструмент set_subagent_models"); the
    // genitive "инструмента question" mentions a built-in tool and is skipped.
    const named = template.match(/инструмент\s+([A-Za-z][A-Za-z0-9_]*)/)
    const calledTool = named?.[1] ?? template.match(/\bset_subagent_[a-z_]+\b/)?.[0]
    if (!calledTool) {
      fail(`${CONFIG}: commands.subagents.template does not name a tool to call (expected "инструмент <tool>")`)
    } else if (calledTool !== REQUIRED_TOOL) {
      fail(`${CONFIG}: commands.subagents.template tells the model to call "${calledTool}", expected the bulk tool "${REQUIRED_TOOL}"`)
    } else if (!src.includes(`name: "${calledTool}"`)) {
      fail(`${CONFIG}: commands.subagents.template tells the model to call "${calledTool}", but ${PLUGIN} defines no \`name: "${calledTool}"\` tool`)
    }
  }
}

// --- frontmatter sanity + browser permission policy -------------------------

// Every agent file must keep a parseable frontmatter block and a `model:` line.
// (The "deepseek" parity check above only covers non-primary agents; primary
// agents are included here.)
const agentText = new Map()
for (const file of agentFiles) {
  const id = file.replace(/\.md$/, "")
  const text = readFileSync(join(AGENTS_DIR, file), "utf8")
  agentText.set(id, text)

  const lines = text.split(/\r?\n/)
  const opens = lines[0]?.trim() === "---"
  const closes = opens && lines.findIndex((line, index) => index > 0 && line.trim() === "---") !== -1
  if (!opens || !closes) {
    fail(`agents/${file}: frontmatter is not a parseable \`---\` block`)
    continue
  }
  if (frontmatterField(text, "model") === undefined) {
    fail(`agents/${file}: frontmatter has no \`model:\` line`)
  }
}

// Global deny rules live in config/opencode.json `permissions`: exactly one
// `browser` rule and one `browser_*` rule, both resource "*" and effect "deny".
if (!configError) {
  const permissions = Array.isArray(config?.permissions) ? config.permissions : []
  if (!Array.isArray(config?.permissions)) {
    fail(`${CONFIG}: \`permissions\` is missing or not an array`)
  }
  for (const action of ["browser", "browser_*"]) {
    const matches = permissions
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => rule?.action === action)
    if (matches.length === 0) {
      fail(`${CONFIG}: permissions[].action has no global deny rule for "${action}" (expected exactly one with resource "*" and effect "deny")`)
      continue
    }
    if (matches.length > 1) {
      fail(`${CONFIG}: permissions[].action has ${matches.length} rules for "${action}" (expected exactly one) at indexes ${matches.map(({ index }) => index).join(", ")}`)
    }
    for (const { rule, index } of matches) {
      if (rule.resource !== "*" || rule.effect !== "deny") {
        fail(`${CONFIG}: permissions[${index}] (action "${action}") must be resource "*" and effect "deny" to preserve the global deny (found resource ${JSON.stringify(rule.resource)}, effect ${JSON.stringify(rule.effect)})`)
      }
    }
  }
}

// Per-agent opt-in: only the agents in BROWSER_ALLOW_AGENTS may carry a built-in
// `browser` allow rule, and only those in BROWSER_MCP_AGENTS may carry a
// `browser_*` MCP opt-in. Any rule elsewhere is a violation (fail-closed), and
// every listed agent must carry its rule, so the sets stay exact.
const BROWSER_ALLOW_SET = new Set(BROWSER_ALLOW_AGENTS)
const BROWSER_MCP_SET = new Set(BROWSER_MCP_AGENTS)

for (const [id, text] of agentText) {
  const rules = parsePermissionRules(text)
  const browserRules = rules.filter((rule) => unquote(rule.actionRaw) === "browser")
  const mcpRules = rules.filter((rule) => unquote(rule.actionRaw) === "browser_*")

  for (const rule of browserRules) {
    if (!BROWSER_ALLOW_SET.has(id)) {
      fail(`agents/${id}.md:${rule.actionLine}: has a \`browser\` permission rule, but agents/${id}.md may not use the built-in browser (only: ${BROWSER_ALLOW_AGENTS.join(", ")})`)
    }
  }
  for (const rule of mcpRules) {
    if (!BROWSER_MCP_SET.has(id)) {
      fail(`agents/${id}.md:${rule.actionLine}: has a \`browser_*\` MCP opt-in rule, but agents/${id}.md may not use the browser MCP tools (only: ${BROWSER_MCP_AGENTS.join(", ")})`)
    }
  }

  if (BROWSER_ALLOW_SET.has(id)) {
    if (browserRules.length === 0) {
      fail(`agents/${id}.md: missing the built-in-browser allow rule (expected exactly \`- action: browser\` / \`resource: "*"\` / \`effect: allow\`)`)
    }
    for (const rule of browserRules) {
      if (rule.actionRaw !== "browser") {
        fail(`agents/${id}.md:${rule.actionLine}: \`browser\` action must be written unquoted as \`action: browser\` (found \`action: ${rule.actionRaw}\`)`)
      }
      if (rule.resource !== "*") {
        fail(`agents/${id}.md:${rule.resourceLine ?? rule.actionLine}: \`browser\` rule must use resource "*" (found ${rule.resource === undefined ? "missing" : `"${rule.resource}"`})`)
      }
      if (rule.effect !== "allow") {
        fail(`agents/${id}.md:${rule.effectLine ?? rule.actionLine}: \`browser\` rule must use effect "allow" (found ${rule.effect ?? "missing"})`)
      }
    }
    if (browserRules.length > 0 && !BROWSER_ALLOW_BLOCK_RE.test(text)) {
      fail(`agents/${id}.md: the \`browser\` allow rule must be the contiguous block \`- action: browser\` / \`resource: "*"\` / \`effect: allow\``)
    }
  }

  if (BROWSER_MCP_SET.has(id)) {
    if (mcpRules.length === 0) {
      fail(`agents/${id}.md: missing the \`browser_*\` MCP opt-in rule (expected exactly \`- action: "browser_*"\` / \`resource: "*"\` / \`effect: allow\`)`)
    }
    for (const rule of mcpRules) {
      if (rule.actionRaw !== '"browser_*"') {
        fail(`agents/${id}.md:${rule.actionLine}: \`browser_*\` opt-in must be written as \`- action: "browser_*"\` (found \`action: ${rule.actionRaw}\`)`)
      }
      if (rule.resource !== "*") {
        fail(`agents/${id}.md:${rule.resourceLine ?? rule.actionLine}: \`browser_*\` rule must use resource "*" (found ${rule.resource === undefined ? "missing" : `"${rule.resource}"`})`)
      }
      if (rule.effect !== "allow") {
        fail(`agents/${id}.md:${rule.effectLine ?? rule.actionLine}: \`browser_*\` rule must use effect "allow" (found ${rule.effect ?? "missing"})`)
      }
    }
  }
}

// --- report -----------------------------------------------------------------

if (violations.length > 0) {
  console.error(`agent-presets check FAILED (${violations.length} violation${violations.length === 1 ? "" : "s"}):`)
  for (const violation of violations) console.error(`  - ${violation}`)
  console.error(`\nfile: ${PLUGIN}`)
  console.error(`agents: ${expected.size} non-primary (${primary.length} primary excluded: ${primary.join(", ") || "none"})`)
  process.exit(1)
}

console.log("agent-presets check OK")
console.log(`  ${PLUGIN}`)
for (const preset of presets) {
  console.log(`  preset "${preset.id}": ${preset.entries.length} agents, all variants valid`)
}
console.log(`  agents: ${expected.size} non-primary covered by every preset; each frontmatter \`model:\` equals its "deepseek" entry (primary excluded: ${primary.join(", ") || "none"})`)
console.log(`  providers: every preset providerID is configured or "opencode" (${[...allowedProviders].sort().join(", ")}); each preset draws from its bound provider`)
console.log(`  models: every preset uses a known provider/model pair (${KNOWN_MODELS.length} known)`)
console.log(
  `  variants: ${Object.entries(ALLOWED_VARIANTS)
    .map(([pair, allowed]) => `${pair} (${allowed.source}) [${allowed.variants.join("|")}]`)
    .join(", ")}`,
)
console.log(`  ${PLUGIN}: PRESET_IDS enum is exactly ${[...expectedEnum].join(", ")}; COMBOS has no duplicates and every value is self-consistent`)
console.log(`  ${CONFIG}: all ${PRESET_IDS.length} preset ids offered, "${ONE_CALL_PHRASE}" present, tool is exactly "${REQUIRED_TOOL}" and defined by the plugin (${templateNote})`)
console.log(`  browser policy: ${CONFIG} denies "browser" and "browser_*" globally (effect deny); agents allow the built-in browser: ${BROWSER_ALLOW_AGENTS.join(", ")}; only ${BROWSER_MCP_AGENTS.join(", ")} may use the MCP "browser_*" tools`)
