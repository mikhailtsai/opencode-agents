# Provider setup (OpenCode)

## Moonshot / Kimi API key
The `moonshotai` provider reads the key from the `MOONSHOT_API_KEY` environment variable.

- Preferred: export it in your shell, e.g. add to `~/.bashrc`:
  `export MOONSHOT_API_KEY="sk-..."`
- Or via systemd user environment: create `~/.config/environment.d/moonshot.conf` with
  `MOONSHOT_API_KEY=sk-...` and re-login.
- Alternative: try `opencode auth login --provider moonshotai`.

Security: never commit the key to a repo and never print it to logs or chat.

## Restart required
OpenCode reads `opencode.json` at startup. After changing providers or keys, fully exit the
TUI and start `opencode` again.

## Claude Code (subscription)
The Claude Code CLI is already authorized via your Claude subscription. If the authorization
expires, re-run: `claude auth login --claudeai`.

## Connected providers and model IDs
| Provider | Auth | Model IDs |
|---|---|---|
| `claude-code` | Claude subscription (CLI) | fable, opus, sonnet, haiku, claude-opus-4-8, claude-sonnet-4-6 |
| `openai` | ChatGPT OAuth (Codex) | gpt-6.1-sol (Sol 6.1), gpt-6-luna (Luna 6) |
| `deepseek` | API key | deepseek-flash, ... |
| `openrouter` | API key | (router models) |
| `moonshotai` | `MOONSHOT_API_KEY` | kimi-k2.6, kimi-k2.7-code, kimi-k2.7-code-highspeed, kimi-k2-thinking, kimi-k2.5, kimi-k2-instruct, kimi-k3 |

Проверка генерации Codex-моделей (Sol 6.1 / Luna 6) отложена — пользователь проверит сам. Модели gpt-5.3-codex-spark / gpt-5.4* отклоняются для ChatGPT-аккаунта сервером OpenAI.

## Secrets

The live config references three secret files through v2 `{file:...}` resolution. Each file holds
the **raw value only** — no `Bearer ` prefix, no quotes, no surrounding whitespace.

| File | Referenced from | Contents |
|---|---|---|
| `~/.config/opencode/secrets/grafana-bearer` | `mcp.servers.grafana.headers.Authorization` | raw Grafana bearer token |
| `~/.config/opencode/secrets/grafana-sa-token` | `mcp.servers.grafana.headers.X-Grafana-Service-Account-Token` | raw Grafana Service Account token |
| `~/.config/opencode/gitlab.token` | GitLab MCP env `GITLAB_PERSONAL_ACCESS_TOKEN` | raw `glpat-…` token |

- Permissions: `chmod 600` on every secret file (and `chmod 700` on `secrets/`).
- They are **never** committed: the repository `.gitignore` covers `secrets/` and `*.token`.
- `scripts/install.sh` only checks that the files **exist** (it warns when they are missing); it
  never reads, prints, or writes their contents.

## Configuration ownership
The repository is the single source of truth for the managed config: `scripts/install.sh` installs
every managed path into `~/.config/opencode/` as a **symlink** back into the repo, so the config is
edited in the repo and never in the installed copy.
`cli.json` (v2 terminal-client settings) is also repo-owned: it lives at `config/cli.json` and
`scripts/install.sh` symlinks it to `~/.config/opencode/cli.json`.

## Плановое обновление до OpenCode 2.0.29 (миграция с 1.x)
1. Миграция на v2 уже выполнена: файла `opencode.v2.json` не существует. Живой конфиг — это
   `config/opencode.json` в этом репозитории (устанавливается симлинком в `~/.config/opencode/opencode.json`);
   редактировать нужно только его. В V2 ключ `plugin` ед.ч. не поддерживается — со старым V1-конфигом
   запуск упадёт; старые бэкапы (`*.bak`) удалены 2026-10-15 и в `~/.config/opencode/` больше не хранятся.
   - V1-остатки SDK — `package.json`, `package-lock.json`, `node_modules` — тоже удалены как legacy:
     это были файлы V1-SDK (`@opencode-ai/plugin`). V2 резолвит плагины из `~/.cache/opencode`, а
     импорт-спецификатор плагинного SDK в V2 — `@opencode/plugin` (именно его использует
     `plugins/agent-models/index.ts`). `.gitignore` в `~/.config/opencode/` (он игнорировал ровно эти файлы)
     теперь неактуален, но оставлен намеренно.
2. `~/.config/opencode/tui.json` удалён (в нём были только V1-TUI-плагины rainbow и quota; rainbow не имеет V2-версии, quota уже в opencode.json; V2 мигрирует TUI-настройки в cli.json автоматически).
3. После первого запуска 2.0.29 проверить:
   - `opencode debug config` — нет ли критичных предупреждений (неперенесённые V1-ключи);
   - `opencode auth list` — OAuth/ключи перенесены из auth.json в opencode.db (перенос автоматический);
   - `opencode plugin list` — загружены @slkiser/opencode-quota@5 и @openchamber/opencode-claude@1.4.1;
   - `opencode models claude-code` — модели теперь читаются из локального Claude CLI (список отличается от V1: claude-sonnet-5 и т.п., с [1m]-вариантами и effort-вариантами);
   - `opencode models openai` — есть ли gpt-6.1-sol и gpt-6-luna (каталог на NixOS идёт из пина models-dev);
   - `opencode models` — deepseek, openrouter, moonshotai на месте;
   - права/permissions из конфига (permission-мап 1.x) по-прежнему действуют — проверить в TUI на одном запрещённом действии.
4. Изменения относительно 1.x, которые надо знать: rainbow-плагин удалён (нет V2-порта); quota обновлён до @5; Claude-плагин обновлён до @1.4.1 (требует OpenCode 2.x; работает только с подпиской Claude, токены не читает); ключи провайдеров живут в ~/.local/share/opencode/opencode.db (не в auth.json).
