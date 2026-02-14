# Creating Skills

Skills are the fundamental unit of AI capability in The Harness. A skill is a self-contained package of domain expertise expressed as plain markdown and YAML. Skills are model-agnostic, portable, and composable.

## What Is a Skill?

A skill teaches your AI how to do something specific. Instead of writing one-off prompts that expire with each model update, you write a skill specification that any model can follow.

Examples of skills:
- **Research** -- Conduct structured research on any topic
- **CodeReview** -- Analyze code changes and provide feedback
- **EmailTriage** -- Prioritize and draft responses to emails
- **Summarize** -- Condense documents into key points

## Creating a Skill with the CLI

```bash
pai skill create Summarize
```

This creates the following structure in your skills directory:

```
~/.claude/skills/Summarize/
├── SKILL.md
├── Tools/
└── Workflows/
    └── Example.md
```

## Anatomy of SKILL.md

The `SKILL.md` file has two parts: YAML frontmatter and a markdown body.

### Frontmatter

```yaml
---
name: Summarize
description: Condenses documents and text into key points. USE WHEN user asks to summarize OR condense OR give key takeaways OR create an executive summary. Can produce bullet lists, structured summaries, and abstracts.
---
```

The `description` field serves three purposes:

1. **What it does** -- A concise statement of the skill's purpose
2. **USE WHEN** -- Trigger phrases that activate the skill (separated by `OR`)
3. **Additional capabilities** -- Optional elaboration

### The USE WHEN Clause

The USE WHEN clause is how skills self-activate. When the user's message matches a trigger phrase, the skill engages automatically. Write triggers as natural language phrases that a user would actually say:

```
USE WHEN user asks to summarize OR condense OR "give me the key points" OR "TLDR" OR create an executive summary
```

Tips for effective triggers:
- Use phrases your users actually type, not technical jargon
- Cover synonyms (summarize, condense, distill, TLDR)
- Include common request patterns ("give me the key points of")
- Separate triggers with `OR`

### Workflow Routing Table

The body of SKILL.md maps user intent to workflow files:

```markdown
## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **BulletSummary** | "summarize this" OR "key points" OR "TLDR" | `Workflows/BulletSummary.md` |
| **ExecutiveSummary** | "executive summary" OR "formal summary" | `Workflows/ExecutiveSummary.md` |
| **Abstract** | "write an abstract" OR "academic summary" | `Workflows/Abstract.md` |
```

### Examples Section

Every skill must include at least two examples showing usage:

```markdown
## Examples

**Example 1: Quick summary**
```
User: "Summarize this article about container orchestration"
-> Invokes BulletSummary workflow
-> Reads the article, extracts key points
-> Returns 5-8 bullet points with the essential information
```

**Example 2: Formal summary**
```
User: "Write an executive summary of this quarterly report"
-> Invokes ExecutiveSummary workflow
-> Identifies key metrics, decisions, and action items
-> Returns a structured 3-paragraph summary
```
```

## Writing Workflows

Workflow files in `Workflows/` define step-by-step procedures:

```markdown
# BulletSummary

Produces a concise bullet-point summary of the provided content.

## Steps

1. **Identify the source** -- Determine what content to summarize (file, URL, pasted text).
2. **Read the content** -- Load the full source material.
3. **Extract key points** -- Identify the 5-8 most important ideas, facts, or arguments.
4. **Structure output** -- Format as a bullet list with one point per line.
5. **Validate** -- Ensure no critical information was omitted and no claims were fabricated.

## Output Format

- [Key point 1]
- [Key point 2]
- ...
- [Key point N]

Source: [reference to original material]

## Notes

- Target 5-8 bullets for most content. Longer sources may warrant up to 12.
- Each bullet should stand alone as a complete thought.
- Preserve specific numbers, dates, and proper nouns from the source.
```

## Naming Rules

All skill names must use **TitleCase**. This is enforced by the CLI.

| Correct | Incorrect |
|---------|-----------|
| `Summarize` | `summarize` |
| `CodeReview` | `code-review` |
| `EmailTriage` | `email_triage` |
| `DeepDive` | `deep_dive` |

## Updating the Skill Index

After creating or modifying a skill, regenerate the index:

```bash
pai skill index
```

This scans all skills, reads their frontmatter, and produces a `skill-index.json` that your AI uses for fast skill discovery.

## Directory Structure Rules

Skills must follow a flat structure with a maximum of 2 levels deep:

```
SkillName/
├── SKILL.md           # Required
├── Tools/             # Optional -- CLI utilities
│   └── ToolName.ts
└── Workflows/         # Optional -- step-by-step procedures
    └── WorkflowName.md
```

Do not nest deeper than this. If a skill needs sub-categories, split it into multiple skills.

## Complete Example: Building a Summarize Skill

1. Scaffold the skill:
   ```bash
   pai skill create Summarize
   ```

2. Edit `~/.claude/skills/Summarize/SKILL.md`:
   - Write the frontmatter with name, description, and USE WHEN triggers
   - Add the workflow routing table
   - Write at least 2 examples

3. Create workflow files in `Workflows/`:
   - `BulletSummary.md` for quick summaries
   - `ExecutiveSummary.md` for formal summaries

4. Regenerate the index:
   ```bash
   pai skill index
   ```

5. Test it in your next AI session:
   ```
   "Summarize this README for me"
   ```

## Checklist

Use this when creating or reviewing a skill:

- [ ] Skill directory uses TitleCase naming
- [ ] `SKILL.md` exists with YAML frontmatter
- [ ] `description` contains a USE WHEN clause
- [ ] Workflow routing table maps triggers to files
- [ ] All referenced workflow files exist in `Workflows/`
- [ ] At least 2 realistic examples are included
- [ ] Directory structure is max 2 levels deep
- [ ] Skill index has been regenerated (`pai skill index`)

For the full specification, see [specs/SkillSystem.md](../specs/SkillSystem.md).
