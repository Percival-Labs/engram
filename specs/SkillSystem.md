# Skill System Specification

**The Harness Framework -- Portable, Model-Agnostic Capability Units**

---

## Overview

Skills are the fundamental organizational unit in The Harness. A skill is a self-contained package of domain expertise expressed as plain markdown and YAML. Skills are model-agnostic, portable, versionable, and composable.

When a new AI model releases, your skills do not change. The skill specification is the stable contract. The model is the swappable runtime.

---

## Naming Convention (Mandatory)

All skill names MUST use **TitleCase**:

| Correct | Incorrect |
|---------|-----------|
| `Research` | `research` |
| `CodeReview` | `code-review` |
| `DeepDive` | `deep_dive` |
| `EmailTriage` | `email-triage` |

This convention is enforced by the CLI tooling and is non-negotiable. TitleCase ensures consistent directory naming, unambiguous references in routing tables, and clean integration with filesystem tooling.

---

## Required Structure

Every skill is a directory containing at minimum a `SKILL.md` file. The full structure:

```
SkillName/
├── SKILL.md           # Frontmatter + routing table + examples
├── Tools/             # CLI utilities (optional)
│   └── ToolName.ts
└── Workflows/         # Step-by-step execution procedures (optional)
    └── WorkflowName.md
```

### SKILL.md Format

The `SKILL.md` file has two parts: YAML frontmatter and a markdown body.

#### YAML Frontmatter (Required)

```yaml
---
name: SkillName
description: [What it does]. USE WHEN [intent triggers using OR]. [Additional capabilities].
---
```

The `description` field serves triple duty:

1. **What it does** -- A concise statement of the skill's purpose.
2. **USE WHEN** -- Intent triggers that cause the skill to self-activate. Use `OR` to separate multiple triggers. These are matched against user input to determine when the skill should engage.
3. **Additional capabilities** -- Optional elaboration on what else the skill can do.

**Example frontmatter:**

```yaml
---
name: Research
description: Conducts structured research on any topic. USE WHEN user asks to research OR investigate OR analyze a topic OR needs a deep dive. Can produce summaries, comparisons, and structured reports.
---
```

#### Markdown Body

The body of `SKILL.md` contains:

1. A brief description paragraph
2. A workflow routing table
3. An examples section
4. Optional verification criteria

---

## Workflow Routing

The routing table maps user intent to workflow files. This is the dispatch mechanism that determines which procedure executes.

```markdown
## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **DeepDive** | "research this topic" OR "deep dive into" | `Workflows/DeepDive.md` |
| **Compare** | "compare these options" OR "pros and cons" | `Workflows/Compare.md` |
| **Summarize** | "summarize this" OR "give me the key points" | `Workflows/Summarize.md` |
```

**Rules for routing tables:**

- Triggers are natural language phrases, not regex
- Use `OR` to separate multiple trigger phrases
- Each workflow maps to exactly one file in `Workflows/`
- Workflow names use TitleCase matching their filename

---

## Directory Structure Rules

### Flat Folder Structure (Max 2 Levels Deep)

Skills MUST NOT nest deeper than two levels from the skill root. This is a hard constraint.

**Correct (2 levels max):**

```
SkillName/
├── SKILL.md
├── Tools/
│   ├── Analyzer.ts
│   └── Formatter.ts
└── Workflows/
    ├── Create.md
    └── Review.md
```

**Incorrect (too deep):**

```
SkillName/
├── SKILL.md
└── Workflows/
    └── Advanced/          # VIOLATION: 3 levels deep
        └── SpecialCase.md
```

**Why:** Flat structures are easier to navigate, harder to over-engineer, and prevent skill scope creep. If a skill needs sub-categories, it should be split into multiple skills.

### Skills Directory Organization

All skills live under a single `skills/` directory:

```
skills/
├── Research/
│   ├── SKILL.md
│   └── Workflows/
│       └── DeepDive.md
├── CodeReview/
│   ├── SKILL.md
│   ├── Tools/
│   │   └── DiffAnalyzer.ts
│   └── Workflows/
│       └── Review.md
└── DoWork/
    ├── SKILL.md
    └── Workflows/
        ├── Capture.md
        └── Execute.md
```

---

## Examples Section (Required)

Every skill MUST include an examples section demonstrating typical usage patterns. Examples show the routing in action and set expectations for what the skill produces.

```markdown
## Examples

**Example 1: Basic research request**
```
User: "Research the current state of WebAssembly adoption"
-> Invokes DeepDive workflow
-> Searches web sources, analyzes findings
-> Produces structured research report with sources
```

**Example 2: Comparison request**
```
User: "Compare React and Svelte for a new project"
-> Invokes Compare workflow
-> Evaluates both options against criteria
-> Produces comparison table with recommendation
```
```

**Rules for examples:**

- Minimum 2 examples per skill
- Show the user input that triggers the skill
- Show which workflow gets invoked
- Show what output the user receives
- Use realistic, concrete scenarios

---

## Verification Criteria (Recommended)

Verification criteria define how to evaluate whether the skill performed correctly. These are not tests in the traditional sense -- they are quality gates for AI output.

```markdown
## Verification Criteria

- [ ] Output addresses the user's stated intent
- [ ] Sources are cited where factual claims are made
- [ ] Output follows the format specified in the workflow
- [ ] No hallucinated data or fabricated references
- [ ] Actionable next steps are included where appropriate
```

---

## Workflow File Format

Individual workflow files in `Workflows/` define step-by-step procedures:

```markdown
# WorkflowName

Brief description of what this workflow accomplishes.

## Steps

1. **Understand the Request** -- Parse user intent and identify key parameters.
2. **Gather Information** -- Use available tools to collect relevant data.
3. **Analyze** -- Process gathered information against the stated goal.
4. **Structure Output** -- Format results according to the output template.
5. **Validate** -- Check output against verification criteria.

## Output Format

[Define the expected structure of the workflow's output]

## Notes

[Edge cases, limitations, or special considerations]
```

---

## Complete Checklist

Use this checklist when creating or reviewing a skill:

- [ ] Skill directory uses TitleCase naming
- [ ] `SKILL.md` exists at the root of the skill directory
- [ ] YAML frontmatter includes `name` and `description` fields
- [ ] `description` contains a USE WHEN clause with intent triggers
- [ ] Workflow routing table maps triggers to workflow files
- [ ] All referenced workflow files exist in `Workflows/`
- [ ] Examples section contains at least 2 realistic scenarios
- [ ] Directory structure is max 2 levels deep (flat folder rule)
- [ ] All workflow files follow the standard workflow format
- [ ] Verification criteria are defined (recommended)
- [ ] Tools in `Tools/` directory are CLI-accessible (if applicable)
- [ ] Skill is registered in the global skill index
