# Writing Hooks

Hooks are the nervous system of The Harness. They provide event-driven automation that makes AI behavior observable, auditable, and modifiable.

## What Is a Hook?

A hook is an executable script that fires at a specific point in the AI session lifecycle. Hooks receive structured JSON payloads via stdin and communicate decisions via stdout and exit codes.

Hooks can:
- Inject context into the AI's awareness (SessionStart)
- Block dangerous operations (PreToolUse)
- Capture events for audit trails (PostToolUse)
- Summarize sessions on completion (Stop)

## Lifecycle Events

The framework defines six lifecycle events:

| Event | When It Fires | Common Use Cases |
|-------|---------------|------------------|
| `SessionStart` | A new AI session begins | Load project context, display greeting, set up state |
| `UserPromptSubmit` | The user sends a message | Format enforcement, auto-categorization, logging |
| `PreToolUse` | Before a tool executes | Security validation, permission checks, confirmation prompts |
| `SubagentStop` | A subagent completes its task | Output capture, quality checks |
| `Stop` | The AI generates a response | Session summary, learning extraction, state persistence |
| `SessionEnd` | The session terminates | Cleanup, final state save, audit finalization |

## Hook Input

Hooks receive a JSON payload via stdin. Every payload includes a base set of fields:

```json
{
  "session_id": "abc123-def456",
  "transcript_path": "/path/to/session/transcript.jsonl",
  "hook_event_name": "PreToolUse"
}
```

Additional fields depend on the event type:

**UserPromptSubmit** adds:
```json
{
  "prompt": "Research the current state of container orchestration"
}
```

**PreToolUse** adds:
```json
{
  "tool_name": "Bash",
  "tool_input": {
    "command": "rm -rf /tmp/build-cache",
    "description": "Clean build cache"
  }
}
```

## Hook Output

Hooks communicate through three channels:

### Stdout (Context Injection)

Text written to stdout is injected into the AI's context as a system-level message:

```typescript
console.log("Current project: MyApp (v2.3.1)");
console.log("Active branch: feature/auth-refactor");
```

### Exit Codes

| Exit Code | Meaning | Behavior |
|-----------|---------|----------|
| `0` | Success | Hook ran, continue normally |
| `2` | Hard block | Operation is prevented, AI is notified why |
| Any other | Error | Logged as warning, execution continues (fail-open) |

### Decision JSON (PreToolUse Only)

For `PreToolUse` hooks that need nuanced control, write a JSON decision to stdout:

**Allow:**
```json
{"continue": true}
```

**Block:**
```json
{"decision": "block", "message": "Cannot delete protected path: /etc/hosts"}
```

**Ask the user:**
```json
{"decision": "ask", "message": "This will force-push to main. Are you sure?"}
```

## Configuration in settings.json

Register hooks in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "path": "hooks/LoadContext.hook.ts",
        "timeout": 5000
      }
    ],
    "PreToolUse": [
      {
        "path": "hooks/SecurityValidator.hook.ts",
        "timeout": 3000,
        "matcher": {
          "tool_name": "Bash"
        }
      }
    ],
    "Stop": [
      {
        "path": "hooks/SessionSummary.hook.ts",
        "timeout": 10000
      }
    ]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Path to the hook script (relative to config root) |
| `timeout` | number | No | Max execution time in ms (default: 5000) |
| `matcher` | object | No | Conditions that must match for the hook to fire |

A hook with no `matcher` fires on every event of its type. A hook with a matcher fires only when all matcher conditions are satisfied.

## Writing Your First Hook

Here is a complete hook that logs every user prompt to a file:

```typescript
#!/usr/bin/env bun
// Hook: PromptLogger
// Event: UserPromptSubmit
// Description: Logs all user prompts to a daily log file

import { readFileSync, appendFileSync, mkdirSync } from "fs";
import { join } from "path";

// 1. Read payload from stdin
const payload = JSON.parse(readFileSync("/dev/stdin", "utf-8"));

// 2. Extract relevant fields
const { prompt, session_id } = payload;
const now = new Date();
const dateStr = now.toISOString().split("T")[0];

// 3. Ensure log directory exists
const logDir = join(process.env.HOME!, ".claude", "MEMORY", "WORK", dateStr);
mkdirSync(logDir, { recursive: true });

// 4. Append to log file
const logEntry = JSON.stringify({
  ts: now.toISOString(),
  session_id,
  prompt,
}) + "\n";

appendFileSync(join(logDir, "prompts.jsonl"), logEntry);

// 5. Exit cleanly (no context injection needed)
process.exit(0);
```

Register it in `settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "path": "hooks/PromptLogger.hook.ts",
        "timeout": 2000
      }
    ]
  }
}
```

## Example: Blocking npm publish Without --dry-run

```typescript
#!/usr/bin/env bun
// Hook: PublishGuard
// Event: PreToolUse
// Description: Blocks npm publish unless --dry-run is specified

import { readFileSync } from "fs";

const payload = JSON.parse(readFileSync("/dev/stdin", "utf-8"));
const { tool_name, tool_input } = payload;

if (tool_name === "Bash") {
  const cmd = tool_input.command || "";
  if (cmd.includes("npm publish") && !cmd.includes("--dry-run")) {
    console.log(JSON.stringify({
      decision: "block",
      message: "npm publish blocked. Use --dry-run first to verify the package contents.",
    }));
    process.exit(2);
  }
}

process.exit(0);
```

## Design Principles

### Non-Blocking

Hooks must complete quickly. Use timeouts to enforce this. If a hook exceeds its timeout, the framework kills it and continues execution.

### Fail-Graceful

Hook failures must not crash the AI session. Only exit code `2` prevents an operation. Any other non-zero exit is logged and skipped. A broken hook degrades functionality -- it does not halt the system.

### Single Responsibility

Each hook handles exactly one concern. A security hook validates security. A logging hook logs events. Do not combine responsibilities. Compose behavior through multiple hooks on the same event.

### Idempotency

Running the same hook twice with the same payload should produce the same result. This makes hooks safe to retry and predictable to debug.

### Transparency

Hooks must not silently alter user intent. If a hook blocks an operation, it must explain why. If a hook injects context, the content should be visible in the session transcript.

For the full specification, see [specs/HookLifecycle.md](../specs/HookLifecycle.md).
