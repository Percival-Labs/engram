# Security Model Specification

**The Harness Framework -- Pattern-Based Security & Access Control**

---

## Overview

The Harness security model operates on the principle that AI tools should be safe by default without being crippled by restrictions. It uses a pattern-based system to classify operations by risk level, applying different controls depending on the potential for harm.

Security is enforced through `PreToolUse` hooks that evaluate operations against a `patterns.yaml` configuration file. The system provides defense in depth: multiple independent layers of protection, each capable of preventing harm independently.

---

## Design Principles

### Zero Trust

Never assume an operation is safe because the AI "intended" it to be. Every tool invocation is evaluated against security policies regardless of context. The AI is treated as an untrusted actor executing within a controlled environment.

### Defense in Depth

Multiple independent security layers, each sufficient to prevent catastrophic harm:

1. **Pattern matching** -- Catches known dangerous commands
2. **Path protection** -- Prevents access to sensitive files
3. **Confirmation gates** -- Requires human approval for risky operations
4. **Audit logging** -- Creates an immutable record of all security events

### Fail-Open for Usability

Non-catastrophic operations default to allow. If a security hook crashes or times out, the operation proceeds. This prevents a broken security hook from rendering the entire system unusable.

### Fail-Safe for Catastrophic Operations

Operations that could cause irreversible damage (filesystem destruction, credential exposure) are blocked even if the security hook fails. These are hardcoded into the framework, not dependent on hook execution.

### Least Privilege

The AI should have the minimum access necessary for its current task. Path protections enforce this by default, and projects can further restrict access through project-level security configuration.

---

## Command Pattern Categories

Operations are classified into three categories based on their risk level:

### blocked -- Always Prevented

These operations are never allowed regardless of context or user intent. They represent catastrophic, irreversible actions.

```yaml
blocked:
  - pattern: "rm -rf /"
    reason: "Recursive deletion of root filesystem"
  - pattern: "rm -rf ~"
    reason: "Recursive deletion of home directory"
  - pattern: "mkfs\\."
    reason: "Filesystem formatting"
  - pattern: "dd if=.* of=/dev/"
    reason: "Raw device writes"
  - pattern: "> /dev/sda"
    reason: "Direct disk overwrite"
  - pattern: "chmod -R 777 /"
    reason: "Global permission override"
  - pattern: ":(){ :|:& };:"
    reason: "Fork bomb"
```

**Behavior:** The hook exits with code 2 (hard block). The AI receives an error message explaining why the operation was blocked. No user override is possible.

### confirm -- User Prompted

These operations are potentially dangerous but have legitimate uses. The user is prompted for confirmation before they execute.

```yaml
confirm:
  - pattern: "git push --force"
    reason: "Force push can overwrite remote history"
  - pattern: "git reset --hard"
    reason: "Hard reset discards uncommitted changes"
  - pattern: "DROP TABLE"
    reason: "Database table deletion is irreversible"
  - pattern: "DROP DATABASE"
    reason: "Database deletion is irreversible"
  - pattern: "truncate"
    reason: "Table truncation deletes all rows"
  - pattern: "rm -rf"
    reason: "Recursive deletion (non-root paths)"
  - pattern: "chmod 777"
    reason: "World-writable permissions"
  - pattern: "curl .* \\| .*sh"
    reason: "Piping remote content to shell"
```

**Behavior:** The hook outputs a decision JSON with `"decision": "ask"` and a message explaining the risk. The framework presents this to the user for approval.

### alert -- Logged but Allowed

These operations are noteworthy but not dangerous enough to interrupt workflow. They are logged to the security audit trail for later review.

```yaml
alert:
  - pattern: "curl .* \\| sh"
    reason: "Remote code execution pattern"
  - pattern: "eval\\("
    reason: "Dynamic code evaluation"
  - pattern: "sudo"
    reason: "Elevated privilege operation"
  - pattern: "npm install -g"
    reason: "Global package installation"
  - pattern: "pip install"
    reason: "Python package installation"
```

**Behavior:** The hook logs the event to `MEMORY/SECURITY/` and exits with code 0. The operation proceeds without interruption.

---

## Path Protection Levels

File and directory paths are classified into protection levels:

### zeroAccess -- Never Accessible

These paths are completely off-limits. The AI cannot read, write, list, or reference them.

```yaml
zeroAccess:
  - "~/.ssh/id_*"
  - "~/.ssh/known_hosts"
  - "~/.gnupg/"
  - "~/.aws/credentials"
  - "~/.config/gcloud/credentials.db"
  - "**/credentials.json"
  - "**/.env.local"
  - "**/secrets.*"
```

**Behavior:** Any tool invocation referencing a zeroAccess path is hard-blocked (exit 2). The path contents are never exposed to the AI.

### readOnly -- Can Read, Cannot Modify

These paths can be read for context but must not be written to, deleted, or moved.

```yaml
readOnly:
  - "~/.claude/settings.json"
  - "**/package-lock.json"
  - "**/bun.lock"
  - "**/.gitignore"
  - "**/LICENSE"
```

**Behavior:** Read operations are allowed. Write, Edit, or Bash commands that would modify these files are blocked with an explanation.

### confirmWrite -- Writing Requires Confirmation

These paths can be read freely, but writing requires explicit user confirmation.

```yaml
confirmWrite:
  - "**/.env"
  - "**/.env.*"
  - "**/docker-compose*.yml"
  - "**/Dockerfile"
  - "**/*.config.js"
  - "**/*.config.ts"
```

**Behavior:** The hook outputs a decision JSON with `"decision": "ask"` when a write operation targets these paths.

### noDelete -- Cannot Be Deleted

These paths can be read and written but never deleted. This protects critical infrastructure files.

```yaml
noDelete:
  - "~/.claude/hooks/"
  - "~/.claude/skills/*/SKILL.md"
  - "**/.git/"
  - "**/.gitkeep"
```

**Behavior:** Delete operations targeting these paths are hard-blocked. All other operations are allowed.

---

## patterns.yaml Format

The complete security configuration lives in a single `patterns.yaml` file:

```yaml
# The Harness Security Patterns
# Version: 1.0

commands:
  blocked:
    - pattern: "rm -rf /"
      reason: "Root filesystem destruction"
    - pattern: "mkfs\\."
      reason: "Filesystem formatting"

  confirm:
    - pattern: "git push --force"
      reason: "Force push overwrites remote history"
    - pattern: "DROP TABLE"
      reason: "Irreversible table deletion"

  alert:
    - pattern: "sudo"
      reason: "Elevated privileges"

paths:
  zeroAccess:
    - "~/.ssh/id_*"
    - "~/.aws/credentials"

  readOnly:
    - "**/LICENSE"

  confirmWrite:
    - "**/.env"

  noDelete:
    - "**/.git/"
    - "~/.claude/hooks/"
```

### Pattern Syntax

- Patterns use regular expressions (evaluated with the language's native regex engine)
- Path patterns use glob syntax (** for recursive, * for single segment)
- Tilde (~) expands to the user's home directory
- Patterns are case-sensitive by default

---

## Audit Trail

All security events are logged to `MEMORY/SECURITY/YYYY/MM/audit.jsonl` (see [MemorySystem.md](./MemorySystem.md) for directory structure).

### Event Types

| Event | Trigger | Logged Data |
|-------|---------|-------------|
| `tool_blocked` | Blocked pattern matched | Tool name, command/path, pattern matched, reason |
| `confirm_prompted` | Confirm pattern matched | Tool name, command/path, user decision (approved/denied) |
| `alert_logged` | Alert pattern matched | Tool name, command/path, reason |
| `path_access_denied` | Protected path accessed | Path, protection level, operation attempted |
| `hook_error` | Security hook failed | Hook name, error message, fallback behavior |

### Log Format

```json
{
  "ts": "2026-02-13T09:30:15Z",
  "session_id": "a1b2c3d4",
  "event": "tool_blocked",
  "tool": "Bash",
  "detail": "rm -rf /tmp/../../../",
  "pattern": "rm -rf /",
  "reason": "Root filesystem destruction",
  "action": "blocked"
}
```

### Log Integrity

- Audit logs are **append-only**: new entries are added, existing entries are never modified
- The AI MUST NOT have delete access to security log files (enforced via noDelete path protection)
- Logs should be reviewed periodically by the system operator
- Consider forwarding logs to an external system for tamper-proof storage in high-security environments

---

## Implementation Checklist

When implementing the security model:

- [ ] `patterns.yaml` exists and contains at minimum the blocked patterns listed above
- [ ] A `PreToolUse` hook reads `patterns.yaml` and evaluates all Bash commands against it
- [ ] A separate `PreToolUse` hook evaluates file paths against path protection levels
- [ ] Hard-blocked operations exit with code 2 and a clear message
- [ ] Confirm operations output decision JSON with `"decision": "ask"`
- [ ] Alert operations log to audit trail and exit with code 0
- [ ] Audit log directory exists and is protected by noDelete
- [ ] Security hooks have timeout configuration (recommended: 3000ms)
- [ ] Hook failures are logged but do not block non-catastrophic operations
- [ ] zeroAccess paths are checked before any file operation, not just Bash
