# deepseek-foreman

[![CI](https://github.com/biantao1108/deepseek-foreman/actions/workflows/ci.yml/badge.svg)](https://github.com/biantao1108/deepseek-foreman/actions)
[![npm](https://img.shields.io/npm/v/deepseek-foreman)](https://www.npmjs.com/package/deepseek-foreman)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
**English** | [中文](README.zh-CN.md)

> **A strong model as foreman. Cheap models do the work. Another vendor reviews.**
> Multi-model teamwork for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — cheaper *and* better.
> A community plugin, not affiliated with DeepSeek.

![Metrics dashboard](https://raw.githubusercontent.com/biantao1108/deepseek-foreman/main/docs/metrics-2026-10-01.png)

## Why

| Problem | What foreman does |
|---|---|
| Strong models burn quota writing code | Your Lead only **plans, dispatches, verifies** — implementation runs on flash-tier models |
| Same model writes & reviews its own code | **Cross-vendor review is enforced in runtime**: same vendor is refused, read-only reviewers literally cannot write |
| Rules in prompts get ignored | Four hard constraints live in code (`pick_route`): peak-hour lock, vision, output cap, cross-vendor |
| Config editing is scary | One YAML file, hot-reloaded; setup wizard + doctor self-check guide you |

**Measured** (23 tickets, one overnight run): 93%+ of tokens on cheap models, 24 review findings → 22 fixed, 100% ticket closure — see [metrics](docs/metrics-2026-10-01.md).

## Quick start

1. Install dsh, connect **≥2 model vendors**
2. Install `deepseek-foreman` in the plugins page
3. New session → say **"Set up foreman, I have <Vendor A> and <Vendor B>"**

That's it. The wizard (`npx deepseek-foreman-setup`) checks your allowlist, the plugin auto-installs the ticket SOP, and `pick_route` self-checks everything with plain-language hints. Full walkthrough: [docs/install-flow.md](docs/install-flow.md).

## How it works

```
 you  ──►  Lead (K3 / Opus-class)          plans tickets, re-runs acceptance, verifies findings
                │
                ├──►  worker (flash-tier)   implements in its own session, 93% of tokens
                │
                └──►  reviewer (other vendor) read-only code review → Lead checks each finding
```

Everything is plain Markdown in your repo: tickets, receipts, review reports. **A receipt is a claim, not evidence** — the Lead re-runs every acceptance command, and `accept_check` fingerprints the receipt against git HEAD.

## Ticket tiers (effort scaling)

| Tier | Flow | Effort |
|---|---|---|
| `trivial` (≤10 lines / docs) | no review, Lead accepts | low |
| `normal` (default) | full loop + cheap cross-vendor review | per config |
| `critical` (data / release / security) | double review + physical read-only | high; escalate after 2 failures |

Cost ledger per receipt, budget caps for unattended runs. Model roles & field data: [metrics](docs/metrics-2026-10-01.md).

## Acknowledgements

Ported from [yanauto/opus-manager](https://github.com/yanauto/opus-manager) (MIT, © 2026 yanauto) — the ticket/receipt contract and the "re-run acceptance, cross-vendor review, verify every finding" playbook were proven there over 8 weeks / 13 repos / 360 tickets. Dual copyright in [LICENSE](LICENSE).

## Status

- ✅ Shipped on [npm](https://www.npmjs.com/package/deepseek-foreman), CI green, 114 self-checks
- ✅ Built dogfooded: v0.2–v0.4 were iterated through this very ticket system
- 📄 Details & troubleshooting: [docs/install-flow.md](docs/install-flow.md) · [field reports](docs/dogfooding.md)

MIT licensed. Community project — issues & PRs welcome.
