English | [中文](README.md)

> A community plugin for DeepSeek Harness, not affiliated with DeepSeek.

# deepseek-foreman

Write work as tickets and dispatch them to **cheaper models**; the Lead only breaks down the work, dispatches it, re-runs the acceptance commands personally, sends it to a **different vendor** for read-only review, and verifies every finding one by one. When nobody is around, it keeps working through the queue.

Built for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).

## Origin

The design and the ticket/receipt contract are ported from [yanauto/opus-manager](https://github.com/yanauto/opus-manager) (MIT, Copyright (c) 2026 yanauto). Upstream is a **Claude Code skill**; this project is its **dsh port**. Upstream validated the flow over 8 weeks, 13 repositories and 360 tickets; this project keeps its directory contract, its acceptance criteria, and the principle that "a receipt is a claim, not evidence".

## Why port it to dsh

Upstream has to use external CLI tools (`pi`, `cursor-agent`, `codex`, `agy`) as workers, because **Claude Code has no entry point for swapping models per sub-task** — the model is hard-coded in the subagent definition, plus a global switch meaning "all subagents use the same model".

dsh's `subagent` tool accepts `provider` / `model` / `reasoning_effort` **at call time**, constrained by the session-level `allowedModels` allowlist. So "one vendor as manager, one as builder, one as reviewer" in dsh is **three tool calls inside the same process**, with no external CLI required.

## Differences from upstream

| | opus-manager | this project |
|---|---|---|
| Host | Claude Code skill | dsh skill |
| Workers | external CLI processes (pi / cursor-agent / codex / agy) | `subagent` tool + per-call `provider`/`model` |
| First-time setup | scan which CLIs are installed, read each `--help`, write `dispatch.sh` / `review.sh` | read the `allowedModels` allowlist + cross-check with `list_subagent_models`; **no dispatch scripts written** |
| Worker detached from session | `nohup` / `Start-Process` | a continuable child session with `run_in_background: true` |
| Read-only review | the review command opens only `read,grep,find,ls` | the review prompt states "do not modify files; run read-only commands only" + the Lead checks `git status` before and after (`subagent` has no read-only filter parameter) |
| Context isolation | separate process | separate Session (child-session work does not enter the parent conversation) |
| Cost rule | one new session per ticket | same, **plus**: keep the same model by continuing with `subagent_fork` (preserving the prefix KV cache); use `subagent` only when the model must change |
| Unattended management | `queue.md` + background wait | same, stackable with dsh's `goal` |

The ticket/receipt templates, the `_tickets/` directory contract, and the acceptance and verification flow **stay the same** — that part is host-independent, and it is upstream's most valuable piece.

## Install

**Installing the package installs the skill**: install `deepseek-foreman` from the dsh plugin page, and on the plugin's first load the packaged `skill/deepseek-foreman/` lands in `~/.dsh/skills/deepseek-foreman` — no manual linking:

- it first tries a symlink (so repo edits stay live), and falls back to a recursive copy where symlinks are refused (e.g. Windows privileges);
- an existing install (symlink or directory) is left untouched — nothing is ever overwritten;
- if both steps fail it still throws nothing and never blocks dsh startup — the reason is recorded in `setup` (next section); set the plugin's `installSkill: false` to turn auto-install off.

dsh's `skill-filesystem` scans `~/.dsh/skills` (the `user-dsh` root) and `~/.agents/skills` (the `user-agents` root) by default. Installing here serves dsh only and does not pollute the four-tool shared `~/.agents/skills`.

### Verify the install

Open a new session and tell dsh: "**call pick_route and show me setup**". A `pick_route` call without a role is the self-check mode; its `setup` block shows at a glance what is still missing:

| Field | Contents |
|---|---|
| `skill` | skill install outcome: `linked` / `copied` / `exists` / `disabled` / `failed: ...` |
| `rolesFile` | role-table path, status (`ok` / `unconfigured` / `error`), role count and an error summary |
| `allowlist` | the `allowedModels` pairs scanned from each profile's `cordis.patch.yml`, reconciled against the role table; `unmatchedRoles` lists roles not on the allowlist |
| `hints` | a plain-language hint for each problem found (e.g. "route deepseek/xxx of role daily-code is not in allowedModels; add it to the allowlist, then open a new session") |

Note: hints 目前为中文输出 / hints are currently emitted in Chinese.

## Configure the role table (`~/.dsh/foreman.roles.yml`)

The role table does not live in cordis config; it lives in an external YAML file, default `~/.dsh/foreman.roles.yml` (change the location with the plugin's `rolesFile` field). Three steps:

1. **Install the package**: add it from the dsh plugin page — the skill **auto-installs** into `~/.dsh/skills` on the plugin's first load (see "Install") — and wire the plugin up per [Prerequisites](#prerequisites). On first load, if the role-table file does not exist, the plugin **lays down a template with Chinese comments** (the packaged [roles.example.yml](roles.example.yml)) and enters an "unconfigured" guidance state — every `pick_route` returns `ok:false`, with a reason naming the file location and the next step ("fill in provider/model per the comments; saving takes effect immediately"). The plugin itself neither errors nor blocks dsh startup.
2. **Edit `~/.dsh/foreman.roles.yml`**: uncomment one of the "combination A" / "combination B" groups in the template (**only one**; uncommenting both produces two top-level `roles:` keys), then replace `provider` / `model` with routes already present in your own allowlist.
3. **Open a new session**: the `allowedModels` allowlist is a session snapshot; changing it requires a new session (next section). The role-table file is not subject to this rule.

```bash
$EDITOR ~/.dsh/foreman.roles.yml   # fill in provider/model; saving takes effect immediately
```

**No restart needed to change the role table**: every `pick_route` call checks the file's mtime and re-reads and re-validates on change. A broken file will not crash the plugin either: the last good role table is kept, the call returns `ok:false` explaining what is wrong, and the next call after you fix it recovers automatically.

## Prerequisites

dsh desktop or CLI, with `cordis.patch.yml` configured:

- `@deepseek-ai/dsh-tool-subagent/model-selection-settings` → `enabled: true` + `allowedModels` with at least two routes from **different vendors**
- the `standard` preset (whose `subagent` tool instance carries `modelSelectionSettings: true`)

Without both, `subagent` will not expose `provider`/`model` parameters, and this skill's dispatch step cannot run.

**The allowlist is a session snapshot**: `allowedModels` is read once **when a new top-level session is created**; changing it afterwards does not affect sessions already running — after editing the allowlist you must **open a new session**. The role-table file (`~/.dsh/foreman.roles.yml`) is not subject to this rule; it is re-read on every call, so saving takes effect immediately.

## Plugin (v1: route adjudication)

`src/index.ts` is a Cordis plugin registering one model-visible tool, `pick_route`. It handles only the hard constraints the skill cannot — these could only rely on model self-discipline in markdown, but can be actually refused in code:

| Constraint | Config field | When refused |
|---|---|---|
| **Peak-hour lock** | `peakWindows` / `peakDays` | Weekday 09:00–18:00 dispatched to deepseek → refused, with an automatic `fallback` role |
| **Vision capability** | `vision` | a job with screenshots dispatched to a text-only role → refused |
| **Output ceiling** | `maxOutputTokens` | a whole long deliverable dispatched to a role capped below 100K → refused |
| **Cross-vendor review** | `vendor` + a call-time `review_for` | reviewer and code author from the same vendor → refused, with other-vendor candidates listed |

Dispatch itself still goes through dsh's native `subagent` (which already supports per-call `provider`/`model`/`reasoning_effort`); the ticket contract is still file-based. **What the plugin does not do**: rebuild a task board, take over dispatch, or touch persistence.

The role table is configured in the "Configure the role table" section above. The old wiring still works too: write `roles: [...]` directly in cordis config; when non-empty it wins and `rolesFile` is ignored (see [example.cordis.yml](example.cordis.yml); the shipped bundle's [cordis.patch.yml](cordis.patch.yml) no longer carries a real role table).

The bundle patch of this package also mounts **`subagent_readonly`** (the read-only review instance): a child session dispatched through it has, **at runtime**, only the three read tools `read` / `grep` / `glob` — write tools disappear from the prompt and their execution is refused, so read-only review goes from "prompt-level self-discipline" to runtime enforcement (the native `subagent` itself still has no read-only filter parameter; see the table above).

Note: whether this tool **appears in a session depends on dsh's preset layer** — this package only guarantees that its own bundle-patch layer is written correctly. If `subagent_readonly` is not present in the session, fall back to the scheme in [SKILL.md](skill/deepseek-foreman/SKILL.md): the review prompt states "do not modify any files; run read-only commands only", and the Lead checks `git status` once before and once after the review.

```bash
npm install && npm run build && node test/smoke.mjs   # 94 self-checks
```

The `Lead` role should match `agent-default-model` (the model the session actually runs as); otherwise the "brain" is misnamed.

## Pitfall: bundle patches must use `insert:`

In a bundle's `cordis.patch.yml`, **a new plugin row must be wrapped under `insert:`**:

```yaml
- insert:
    - id: foreman
      name: deepseek-foreman
      config: { ... }
```

A bare entry `- id: ... / name: ...` is interpreted as **overriding an existing row by id**; when the composition has no such row it **silently does nothing** — no error, no warning, the plugin page says "this plugin package contains no components", and the model side returns `NO_TOOL`. The official spec is [Package and install a plugin](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/publish.md).

Also: **hand-editing a bundle's patch file does not notify the running Host** (changes made outside the manager "announce nothing"). After editing, toggle the switch off and on again in the plugin page, or restart the app, for that layer to be reapplied.

## Status

Installed into dsh desktop 0.2.0-rc.2 (Intel iMac) and verified live: cold start is normal, `pick_route` is callable by the model, and the vision constraint really blocks and returns a fallback.

The ticket SOP (`skill/`) has been run on real tasks: on 2026-10-01 this project used its own flow to complete T001/T002, T101, T102 and T102b, and the `_tickets/` / `_receipts/` contract is now established here — the whole chain (dispatch → build → cross-vendor read-only review → item-by-item verification → fix receipt) is closed.

Field report: [docs/dogfooding.md](docs/dogfooding.md).

## License

MIT. See [LICENSE](LICENSE) (containing both the upstream and this project's copyright notices).
