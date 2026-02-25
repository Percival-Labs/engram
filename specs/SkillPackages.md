# Skill Packages — Specification

**Version:** 0.1.0
**Status:** Draft
**Last Updated:** 2026-02-17

---

## Overview

A **Skill Package** is a self-contained, installable bundle of related Engram capabilities. While individual skills handle single domains (Research, Reflect), packages group multiple skills, hooks, memory schemas, configuration, and optional bridge code into a cohesive add-on that extends Engram into a new domain.

**Core skills** ship with `engram init`. **Packages** are optional add-ons installed separately.

### When to Use a Package vs. a Skill

| Use a Skill when... | Use a Package when... |
|---------------------|----------------------|
| Single domain of expertise | Multiple related skills needed |
| No custom hooks needed | Custom hooks required |
| No external dependencies | External bridge/adapter code |
| No persistent memory schema | Custom memory schema |
| Works with any Engram install | Requires specific infrastructure |

---

## Package Structure

```
packages/
  {PackageName}/
    PACKAGE.md              # Required: Package manifest
    README.md               # Required: User-facing documentation
    skills/                 # Required: One or more Engram skills
      {SkillA}/
        SKILL.md
        Workflows/
          {Workflow1}.md
          {Workflow2}.md
      {SkillB}/
        SKILL.md
        Workflows/
    hooks/                  # Optional: Package-specific hooks
      {HookName}.hook.ts
    config/                 # Optional: Default configuration
      default.yaml
    memory/                 # Optional: Memory schema templates
      README.md             # Documents the schema
    bridge/                 # Optional: External system adapter
      README.md             # Setup instructions
      requirements.txt      # Python deps (if Python bridge)
      package.json          # Node deps (if Node bridge)
    experiments/            # Optional: Validation/experiment scripts
      README.md
```

### Naming Conventions

- Package directory: **TitleCase** (e.g., `OctopusMesh`, `HomeAutomation`, `SecurityMonitor`)
- Skills inside package: **TitleCase**, prefixed with domain (e.g., `MeshSense`, `MeshBabble`)
- Hooks: `{PackageName}{Purpose}.hook.ts` (e.g., `MeshEventCapture.hook.ts`)
- Config: `default.yaml` for defaults, user overrides in `~/.engram/packages/{name}/config.yaml`

---

## PACKAGE.md Format

```yaml
---
name: PackageName
version: 0.1.0
description: One-line description of what this package adds to Engram.
author: Author Name
license: MIT
requires_engram: ">=0.1.0"

# What external infrastructure this package needs
infrastructure:
  - name: "Description of required system"
    type: mcp_server | hardware | service | api
    required: true | false
    setup: "bridge/README.md"

# Skills included in this package
skills:
  - name: SkillA
    description: What SkillA does
  - name: SkillB
    description: What SkillB does

# Hooks included
hooks:
  - file: HookName.hook.ts
    event: SessionStart | PreToolUse | Stop | SessionEnd
    description: What this hook does

# Memory schema
memory:
  directories:
    - path: baselines/
      description: RF baseline snapshots
    - path: events/
      description: Event history (JSONL)

# Configuration keys
config:
  - key: mesh_id
    type: string
    default: "default"
    description: Identifier for this mesh deployment
  - key: anomaly_threshold
    type: number
    default: 2.5
    description: Z-score threshold for anomaly detection
---

# PackageName

[Longer description of the package, its purpose, and what it enables.]

## Quick Start

1. Install the package: `engram package install {name}`
2. Configure: edit `~/.engram/packages/{name}/config.yaml`
3. Set up infrastructure: [instructions]
4. Verify: `engram package verify {name}`

## Skills

[Table of included skills with descriptions]

## Architecture

[How the package components work together]
```

---

## Installation

### CLI Command (future)

```bash
# Install from local directory
engram package install ./packages/OctopusMesh

# Install from registry (future)
engram package install octopus-mesh

# List installed packages
engram package list

# Verify package health
engram package verify OctopusMesh

# Uninstall
engram package remove OctopusMesh
```

### What Install Does

1. Copies skills from `package/skills/` to `~/.engram/skills/` (or symlinks in dev mode)
2. Copies hooks from `package/hooks/` to `~/.engram/hooks/`
3. Registers hooks in `settings.json`
4. Creates memory directories from `memory/` schema
5. Copies default config to `~/.engram/packages/{name}/config.yaml`
6. Runs `engram skill index` to register new skills
7. Prints setup instructions for any required infrastructure

### What Uninstall Does

1. Removes skills from `~/.engram/skills/`
2. Removes hooks from `~/.engram/hooks/` and deregisters from `settings.json`
3. **Does NOT delete memory data** (user must explicitly `--purge`)
4. Removes config
5. Re-indexes skills

---

## Bridge Pattern

Packages that connect to external systems (hardware, APIs, services) use a **bridge** — an adapter that exposes the external system as MCP tools.

### Bridge Types

| Type | Language | Transport | Use Case |
|------|----------|-----------|----------|
| **MCP Server** | Any | stdio / SSE | Persistent services (mesh, home automation) |
| **CLI Tool** | Any | Shell exec | One-shot operations (image gen, file conversion) |
| **API Wrapper** | TypeScript | HTTP | Cloud services (weather, maps, databases) |

### MCP Bridge Convention

Bridges expose tools following this naming pattern:

```
{package}_{category}_{action}

Examples:
  mesh_sense_status        # MeshSense → get status
  mesh_sense_snapshot      # MeshSense → RF snapshot
  mesh_babble_step         # MeshBabble → single perturbation
  mesh_model_show          # MeshSelfModel → display model
```

### Bridge Lifecycle

```
engram package install OctopusMesh
    → copies bridge/ to ~/.engram/packages/OctopusMesh/bridge/
    → user runs: pip install -r bridge/requirements.txt
    → user runs: python bridge/mcp_bridge.py (or adds to MCP config)
    → MCP tools become available to agent
```

---

## Memory Schema Convention

Packages define their memory layout in `memory/README.md` and create empty directories during install. The schema follows Engram's existing LEARNING/ pattern:

- **JSONL** for append-only event logs
- **JSON** for structured state (baselines, models, configs)
- **Markdown** for human-readable learnings and notes
- All files git-friendly (no binary blobs)

### Memory Isolation

Package memory lives under `~/.engram/memory/{package_name}/` to avoid collisions with core memory or other packages.

---

## Package Development Workflow

### 1. Scaffold

```bash
engram package create OctopusMesh
# Creates packages/OctopusMesh/ with template structure
```

### 2. Develop Skills

Write SKILL.md + Workflows/ for each skill in the package. Follow standard Engram skill conventions.

### 3. Write Bridge (if needed)

Implement the MCP server or CLI tool that connects to external infrastructure. Test independently before integrating with skills.

### 4. Define Memory Schema

Document what data the package persists, in what format, and why. Create template files.

### 5. Write Hooks (if needed)

Hooks for SessionStart (load state), PreToolUse (security), Stop (persist).

### 6. Write Experiments

Validation scripts that prove the package works. These also serve as integration tests.

### 7. Test End-to-End

```bash
# Install in dev mode (symlinks, not copies)
engram package install ./packages/OctopusMesh --dev

# Verify all components
engram package verify OctopusMesh

# Run experiments
cd packages/OctopusMesh/experiments
python babble_sim.py
```

---

## Example Packages (Planned)

| Package | Skills | Bridge | Status |
|---------|--------|--------|--------|
| **OctopusMesh** | MeshSense, MeshDiagnose, MeshBabble, MeshSelfModel, MeshPerturb | Python MCP (Octopus node) | In development |
| **HomeAutomation** | HomeStatus, DeviceControl, Routines | MQTT bridge to HA | Planned |
| **SecurityMonitor** | ThreatFeed, VulnScan, IncidentResponse | API wrappers | Planned |
| **WeatherStation** | LocalWeather, ForecastAnalysis | Serial/USB bridge | Planned |
| **FinanceTracker** | SpendingAnalysis, BudgetCheck, InvoiceProcess | Plaid API bridge | Planned |

---

## Design Principles

1. **Self-contained** — A package works with zero modifications to Engram core
2. **Fail-safe** — If the bridge is down, skills degrade gracefully (report unavailability, use cached data)
3. **Memory-first** — Packages persist everything useful. The agent should be smarter about the domain after each session.
4. **Documented by default** — PACKAGE.md, README.md, and memory/README.md are all required
5. **Experiment-validated** — Every package should include validation scripts that prove it works
6. **Uninstall-clean** — Removing a package leaves no orphaned hooks, skills, or config (memory preserved unless `--purge`)
