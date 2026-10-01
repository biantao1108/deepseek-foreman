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
| Read-only review | the review command opens only `read,grep,find,ls` | `subagent_readonly` first: physical read-only (only `read`/`grep`/`glob` at runtime); when that tool is absent from the session, fall back to a review prompt stating "do not modify files; run read-only commands only" + the Lead checks `git status` before and after |
| Context isolation | separate process | separate Session (child-session work does not enter the parent conversation) |
| Cost rule | one new session per ticket | same, **plus**: keep the same model by continuing with `subagent_fork` (preserving the prefix KV cache); use `subagent` only when the model must change; children inherit the deployment persona, so worker discipline is not restated per dispatch |
| Unattended management | `queue.md` + background wait | same, stackable with dsh's `goal` |

The ticket/receipt templates, the `_tickets/` directory contract, and the acceptance and verification flow **stay the same** — that part is host-independent, and it is upstream's most valuable piece.

## Install

From package to first dispatched ticket in ≤ 10 minutes — just follow steps 0–6. Step-by-step detail and a troubleshooting table live in the full guide: [docs/install-flow.md](docs/install-flow.md).

0. **dsh desktop**, with LLM routes for **≥2 different vendors** configured (an API key for each).
1. **The `allowedModels` allowlist** (`@deepseek-ai/dsh-tool-subagent/model-selection-settings`): list every `provider/model` subtasks may use, **at least two from different vendors** (a hard requirement for cross-vendor review). After editing the allowlist, open a new session — it is a session snapshot; see [Prerequisites](#prerequisites).
2. **Install the package**: add `deepseek-foreman` from the dsh plugin page; four things take effect immediately:
   - it mounts `pick_route` (route adjudication: peak-hour lock, vision, output ceiling, cross-vendor review — see "Plugin" below);
   - it mounts `subagent_readonly` (the read-only review instance: a child session dispatched through it has only the `read` / `grep` / `glob` read tools at runtime);
   - it auto-installs the ticket skill into `~/.dsh/skills/deepseek-foreman`: a symlink first (so repo edits stay live), falling back to a recursive copy where symlinks are refused (e.g. Windows privileges); an existing install (symlink or directory) is left untouched — nothing is ever overwritten; if both steps fail it throws nothing and never blocks dsh startup — the reason is recorded in `setup` (step 5); set the plugin's `installSkill: false` to turn auto-install off;
   - if no role table is found, it **lays down a template with Chinese comments** at `~/.dsh/foreman.roles.yml` (the packaged [roles.example.yml](roles.example.yml)) and the plugin enters an "unconfigured" guidance state — no errors, dsh startup is never blocked.

   dsh's `skill-filesystem` scans `~/.dsh/skills` (the `user-dsh` root) and `~/.agents/skills` (the `user-agents` root) by default. Installing here serves dsh only and does not pollute the four-tool shared `~/.agents/skills`.
3. **Open a new session**, so the allowlist snapshot covers the newly installed instance.
4. **Edit `~/.dsh/foreman.roles.yml`**: uncomment one of the "combination A" (single-vendor, full stack) / "combination B" (multi-vendor mix) groups in the template (**only one**), then replace `provider` / `model` with routes already present in your step-1 allowlist. **Saving takes effect immediately** — every `pick_route` call checks the file's mtime and re-reads on change, no restart; every field has its own comment; see the "Configure the role table" section below.
5. **Self-check**: tell dsh "**call pick_route and show me setup**". A `pick_route` call without a role is the self-check mode; its `setup` block shows at a glance what is still missing:

   | Field | Contents |
   |---|---|
   | `skill` | skill install outcome: `linked` / `copied` / `exists` / `disabled` / `failed: ...` |
   | `rolesFile` | role-table path, status (`ok` / `unconfigured` / `error`), role count and an error summary |
   | `allowlist` | the `allowedModels` pairs scanned from each profile's `cordis.patch.yml`, reconciled against the role table; `unmatchedRoles` lists roles not on the allowlist |
   | `hints` | a plain-language hint for each problem found (e.g. "route deepseek/xxx of role daily-code is not in allowedModels; add it to the allowlist, then open a new session") |

6. **Work by ticket**: tell dsh "**work this ticket: do yyy in the xxx project**". The SOP then runs itself: write the ticket → `pick_route` picks the route → `subagent` dispatches → the Lead re-runs acceptance → `subagent_readonly` dispatches a cross-vendor read-only review → verify item by item → wrap up. Say "I'm leaving, keep going" to enter unattended mode.

Note: hints 目前为中文输出 / hints are currently emitted in Chinese.

## Configure the role table (`~/.dsh/foreman.roles.yml`)

The role table does not live in cordis config; it lives in an external YAML file, default `~/.dsh/foreman.roles.yml` (change the location with the plugin's `rolesFile` field).

On package install, if that file does not exist, the plugin **lays down a template with Chinese comments** (the packaged [roles.example.yml](roles.example.yml)) and enters an "unconfigured" guidance state — every `pick_route` returns `ok:false`, with a reason naming the file location and the next step ("fill in provider/model per the comments; saving takes effect immediately"). The plugin itself neither errors nor blocks dsh startup.

The only thing to edit is step 4 of the install flow: uncomment one of the "combination A" (single-vendor, full stack) / "combination B" (multi-vendor mix) groups in the template (**only one**; uncommenting both produces two top-level `roles:` keys), then replace `provider` / `model` with routes already present in your own allowlist. Changing the allowlist requires a new session (see [Prerequisites](#prerequisites)); the role-table file is not subject to this rule — saving takes effect immediately.

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

The bundle patch of this package also mounts **`subagent_readonly`** (the read-only review instance): a child session dispatched through it has, **at runtime**, only the three read tools `read` / `grep` / `glob` — write tools disappear from the prompt and their execution is refused, so read-only review goes from "prompt-level self-discipline" to runtime enforcement (the native `subagent` itself still has no read-only filter parameter; see the table above). the child session of a read-only review runs **the session's default route (usually the lead's model)** — cross-vendor review covers work written by non-lead models (per-call model switching is impossible at the bundle layer: a standing mount needs a preset scope, see the `dsh-tool-subagent` source; work written by k3 itself remains a known gap), and the delegation tools (`subagent` / `subagent_fork` / `subagent_readonly` / `workflow`) are blocked by `toolFilter.deny` so a read-only child session cannot dispatch an unrestricted subagent.

Note: whether this tool **appears in a session depends on dsh's preset layer** — this package only guarantees that its own bundle-patch layer is written correctly. If `subagent_readonly` is not present in the session, fall back to the scheme in [SKILL.md](skill/deepseek-foreman/SKILL.md): the review prompt states "do not modify any files; run read-only commands only", and the Lead checks `git status` once before and once after the review.

```bash
npm install && npm run build && node test/smoke.mjs   # 109 self-checks
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
