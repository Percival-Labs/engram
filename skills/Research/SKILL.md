---
name: Research
description: General-purpose web research with configurable depth. USE WHEN research OR look up OR find out OR what is OR deep dive OR compare options OR investigate. Supports quick lookups, deep dives, and comparative analysis.
---

# Research

Structured web research at three depth levels. Every research output includes sources and confidence indicators.

- **QuickLookup**: Fast factual answers (30 seconds)
- **DeepDive**: Thorough multi-source investigation (2-5 minutes)
- **Compare**: Side-by-side evaluation of options (2-3 minutes)

## Workflow Routing

| Intent | Workflow | When to use |
|--------|----------|-------------|
| Quick factual question | [QuickLookup](Workflows/QuickLookup.md) | Simple questions with direct answers: "what is X", "how much does Y cost", "when did Z happen" |
| Thorough investigation | [DeepDive](Workflows/DeepDive.md) | Complex topics needing multiple angles: "deep dive on X", "research X thoroughly", "I need to understand X" |
| Compare alternatives | [Compare](Workflows/Compare.md) | Evaluating options: "compare X vs Y", "which is better", "pros and cons of X and Y" |

## Examples

**Example 1: Quick factual lookup**

> User: "What is the current stable version of Bun?"

Routes to: `QuickLookup` -- single targeted search, returns version number with source link.

**Example 2: Deep investigation**

> User: "I need to understand how WebSocket connections work at scale"

Routes to: `DeepDive` -- breaks into sub-questions (protocols, connection limits, load balancing, heartbeats), researches each, synthesizes a structured brief.

**Example 3: Comparative analysis**

> User: "Compare Postgres vs SQLite vs DuckDB for an embedded analytics use case"

Routes to: `Compare` -- defines criteria (performance, concurrency, deployment, ecosystem), researches each database against criteria, presents comparison table with recommendation.
