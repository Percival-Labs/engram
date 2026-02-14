---
name: Reflect
description: Session review and learning capture system. USE WHEN reflect OR review learnings OR what did I learn OR extract lessons OR session insights OR improve skills. Extracts actionable learnings from work sessions.
---

# Reflect

Extracts actionable learnings from work sessions and persists them for future reference. Learnings are stored in `MEMORY/LEARNING/learnings.jsonl` (one JSON object per line, append-only).

The goal is not to summarize what happened, but to capture **transferable knowledge** -- patterns, solutions, and mistakes that will be useful in future sessions.

## Workflow Routing

| Intent | Workflow | When to use |
|--------|----------|-------------|
| Extract session learnings | [ExtractLearnings](Workflows/ExtractLearnings.md) | End of session or after significant work: "what did I learn", "reflect on this session", "capture learnings" |

## Examples

**Example 1: End-of-session reflection**

> User: "Let's reflect on what we accomplished today"

Routes to: `ExtractLearnings` -- reviews conversation history, identifies problems solved and patterns discovered, rates actionability, appends to learnings.jsonl.

**Example 2: Post-debugging capture**

> User: "That was a tricky bug. Extract the lessons from that debugging session."

Routes to: `ExtractLearnings` -- focuses on the debugging sequence, captures what worked, what was a dead end, and the root cause pattern for future recognition.
