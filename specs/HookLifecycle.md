# Hook Lifecycle Specification

**The Harness Framework -- Event-Driven Automation & Observability**

---

## Overview

Hooks are the nervous system of The Harness. They provide event-driven automation that makes AI behavior observable, auditable, and modifiable. Hooks fire at defined points in the AI session lifecycle, receive structured payloads, and can inject context, block operations, or capture events.

Hooks are implemented as executable scripts (TypeScript, shell, or any language) that receive JSON payloads via stdin and communicate decisions via stdout and exit codes.

---

## Lifecycle Events

The framework defines six lifecycle events:

| Event | When It Fires | Use Cases |
|-------|---------------|-----------|
| `SessionStart` | A new AI session begins | Load context, inject project state, display greeting |
| `UserPromptSubmit` | The user sends a message | Format enforcement, auto-categorization, work tracking |
| `PreToolUse` | Before a tool executes | Security validation, permission checks, input sanitization |
| `SubagentStop` | A subagent completes its task | Output capture, quality validation, result aggregation |
| `Stop` | The AI generates a response | Session summary, learning extraction, state persistence |
| `SessionEnd` | The session terminates | Cleanup, final state save, audit log finalization |

---

## Event Payloads

### BasePayload

All events include a base payload with these fields:

```json
{
  "session_id": "abc123-def456",
  "transcript_path": "/path/to/session/transcript.jsonl",
  "hook_event_name": "PreToolUse"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `session_id` | string | Unique identifier for the current session |
| `transcript_path` | string | Filesystem path to the session transcript |
| `hook_event_name` | string | The event that triggered this hook |

### UserPromptPayload

Extends BasePayload for `UserPromptSubmit` events:

```json
{
  "session_id": "abc123-def456",
  "transcript_path": "/path/to/session/transcript.jsonl",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "Research the current state of container orchestration"
}
```

| Additional Field | Type | Description |
|-----------------|------|-------------|
| `prompt` | string | The user's message text |

### PreToolUsePayload

Extends BasePayload for `PreToolUse` events:

```json
{
  "session_id": "abc123-def456",
  "transcript_path": "/path/to/session/transcript.jsonl",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "rm -rf /tmp/build-cache",
    "description": "Clean build cache"
  }
}
```

| Additional Field | Type | Description |
|-----------------|------|-------------|
| `tool_name` | string | Name of the tool about to execute |
| `tool_input` | object | The parameters being passed to the tool |

---

## Hook Output Model

Hooks communicate with the framework through three channels: stdout, stderr, and exit codes.

### Stdout (Context Injection)

Any text written to stdout is injected into the AI's context as a system-level message. This is the primary mechanism for hooks to influence AI behavior.

```
# Example: SessionStart hook injecting project context
echo "Current project: MyApp (v2.3.1)"
echo "Active branch: feature/auth-refactor"
echo "Last session: Completed API migration, 3 tests failing"
```

### Exit Codes

| Exit Code | Meaning | Behavior |
|-----------|---------|----------|
| `0` | Normal completion | Hook ran successfully, continue execution |
| `2` | Hard block | Operation is prevented, AI is notified |
| Any other | Error | Logged as warning, execution continues (fail-open) |

### Decision JSON

For `PreToolUse` hooks that need to communicate nuanced decisions, write a JSON object to stdout:

**Allow the operation:**

```json
{"continue": true}
```

**Block with explanation:**

```json
{"decision": "block", "message": "Cannot delete protected path: /etc/hosts"}
```

**Prompt user for confirmation:**

```json
{"decision": "ask", "message": "This will force-push to main. Are you sure?"}
```

---

## Hook File Structure

Hook files follow a standard structure:

```typescript
#!/usr/bin/env bun
// Hook: SecurityValidator
// Event: PreToolUse
// Description: Validates tool operations against security policies
// Matcher: tool_name = "Bash"

import { readFileSync } from "fs";

// 1. Read payload from stdin
const payload = JSON.parse(readFileSync("/dev/stdin", "utf-8"));

// 2. Extract relevant fields
const { tool_name, tool_input } = payload;

// 3. Implement hook logic
if (tool_name === "Bash" && tool_input.command.includes("rm -rf /")) {
  // Hard block: write decision and exit 2
  console.log(JSON.stringify({
    decision: "block",
    message: "Blocked: recursive deletion of root filesystem"
  }));
  process.exit(2);
}

// 4. Normal completion
process.exit(0);
```

### Documentation Header

Every hook SHOULD include a documentation header comment:

```typescript
// Hook: HookName
// Event: EventName (one of the six lifecycle events)
// Description: What this hook does in one sentence
// Matcher: Optional matcher condition (e.g., tool_name = "Bash")
```

---

## Configuration

Hooks are registered in the framework's `settings.json` file under the `hooks` key:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "path": "hooks/LoadContext.ts",
        "timeout": 5000
      }
    ],
    "PreToolUse": [
      {
        "path": "hooks/SecurityValidator.ts",
        "timeout": 3000,
        "matcher": {
          "tool_name": "Bash"
        }
      },
      {
        "path": "hooks/WriteProtector.ts",
        "timeout": 3000,
        "matcher": {
          "tool_name": "Write"
        }
      }
    ],
    "Stop": [
      {
        "path": "hooks/SessionSummary.ts",
        "timeout": 10000
      }
    ]
  }
}
```

### Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Filesystem path to the hook script (relative to framework root) |
| `timeout` | number | No | Maximum execution time in milliseconds (default: 5000) |
| `matcher` | object | No | Conditions that must match for the hook to fire |

### Matchers

Matchers allow hooks to fire selectively. For `PreToolUse` events, matchers filter by tool properties:

```json
{
  "matcher": {
    "tool_name": "Bash"
  }
}
```

A hook with no matcher fires on every event of its type. A hook with a matcher fires only when the matcher conditions are satisfied.

---

## Design Principles

### Non-Blocking by Default

Hooks SHOULD complete quickly and MUST NOT block the AI session indefinitely. Use timeouts to enforce this. If a hook exceeds its timeout, the framework kills it and continues execution.

### Fail Gracefully

Hook failures MUST NOT crash the AI session. A hook that exits with an unexpected error code is logged and skipped. Only exit code `2` (hard block) prevents an operation from proceeding. This is a deliberate "fail-open" design -- a broken hook should degrade functionality, not halt the system.

### Single Responsibility

Each hook handles exactly one concern. A security hook validates security. A logging hook captures events. A context hook loads context. Do not combine multiple responsibilities in a single hook. Compose behavior through multiple hooks on the same event.

### Idempotency

Hooks SHOULD be idempotent where possible. Running the same hook twice with the same payload should produce the same result. This makes hooks safe to retry and predictable to debug.

### Transparency

Hooks MUST NOT silently modify user intent or AI behavior in ways the user cannot observe. If a hook blocks an operation, it MUST provide a clear explanation. If a hook injects context, the injected content should be visible in the session transcript.
