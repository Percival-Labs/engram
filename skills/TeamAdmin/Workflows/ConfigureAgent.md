# ConfigureAgent

Create or modify agent principals within a team.

## Steps

1. **Gather info** — Agent name, purpose, primary team
2. **Create principal** — Generate agent with OBSERVE autonomy (default)
3. **Assign to team** — Set primary team membership
4. **Configure provider** — Set AI provider/model (optional, inherits team defaults)
5. **Confirm** — Show agent ID and initial capabilities

## Autonomy Levels

| Level | Vouch Score | Can Do |
|-------|-------------|--------|
| OBSERVE | < 20 | Read files, search |
| SUGGEST | 20-39 | Propose actions |
| ACT_SAFE | 40-59 | Reversible operations |
| ACT_FULL | 60-79 | All permitted operations |
| AUTONOMOUS | 80+ | Self-directed within scope |

## CLI Equivalent

```bash
engram agent create <name> --team <team> --provider <id> --model <model>
```
