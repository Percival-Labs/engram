# PolicyReport

Generate a report showing current policy configuration and compliance status.

## Steps

1. **Load org policy** — From ~/.engram/org/policy.json
2. **Load teams** — All team configurations
3. **Check compliance** — For each configured framework, verify requirements:
   - Audit logging enabled?
   - Hash chain active?
   - Budget limits set?
   - Retention period configured?
4. **Generate report** — Formatted compliance status

## Output Format

```
Policy Compliance Report
========================
Org: {org_name}
Policy version: {version}
Last updated: {date}

Hard Floors:
  Max autonomy: {level}
  Audit required: {yes/no}
  Blocked tools: {list}

Budget:
  Daily token limit: {limit}
  Monthly cost cap: ${amount}

Compliance Frameworks:
  SOC 2:      {configured/not configured}
  EU AI Act:  {configured/not configured}
  NIST AI RMF: {configured/not configured}

Teams: {count}
Agents: {count}
Audit entries: {count}
```
