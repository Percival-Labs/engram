# ReviewAutonomy

Review and understand an agent's current autonomy level and capabilities.

## Steps

1. **Identify agent** — By name or ID
2. **Load context** — Get agent principal, team config, org policy
3. **Resolve effective level** — min(org ceiling, team ceiling, vouch score)
4. **Show capabilities** — What this autonomy level permits
5. **Suggest improvements** — How to increase autonomy (build Vouch score)

## Output Format

```
Agent: {name} ({id})
Team: {team_name}
Vouch Score: {score}/100
Effective Autonomy: {level}

Capabilities at {level}:
  ✓ Read files and search
  ✓ Propose actions
  ✗ Execute write operations
  ✗ Run bash commands
  ✗ Self-directed action

To increase autonomy: Build Vouch score through successful task completion.
```
