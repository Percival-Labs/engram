# TeamManagement Specification

> Version: 0.1.0 | Status: DRAFT | Added: v0.4.0
> Additive layer — does NOT modify existing Architecture, SkillSystem, HookLifecycle, MemorySystem, SecurityModel, or LayeredContext specs.

## Overview

Team Management extends Engram from a single-user personal AI into a multi-principal system where humans and agents collaborate within teams, governed by cascading policies. The free tier is completely unaffected — team/enterprise features activate only when team or org configuration is present.

## Core Model

### Principal

A **Principal** is any entity with identity, trust, and the ability to act within Engram. Humans and agents are both Principals — they share Nostr identity, Vouch trust score, and team membership. They differ only in lifecycle and autonomy boundaries.

```typescript
interface Principal {
  id: string;                          // Unique identifier (UUID)
  type: 'human' | 'agent';
  nostr_pubkey?: string;               // Nostr identity (hex or npub)
  vouch_score?: number;                // From Vouch API (0-100)
  display_name: string;
  created_at: string;                  // ISO 8601
  primary_team_id?: string;            // ONE team gives purpose
  secondary_team_ids?: string[];       // Additional teams grant skills + memory only
  autonomy_level: AutonomyLevel;
}
```

### Autonomy Levels

Agents earn autonomy via Vouch trust scores. The effective level is:
`min(org_ceiling, team_ceiling, vouch_derived_score)`

```
OBSERVE      → Can read, cannot act         (Vouch < 20)
SUGGEST      → Can propose actions           (Vouch 20-39)
ACT_SAFE     → Can execute reversible ops    (Vouch 40-59)
ACT_FULL     → Can execute any permitted op  (Vouch 60-79)
AUTONOMOUS   → Self-directed within scope    (Vouch 80+)
```

Each level is a strict superset of the one below. An agent at ACT_SAFE can do everything SUGGEST and OBSERVE can do.

### Team

A **Team** is a collaboration scope. Each agent derives purpose from ONE primary team. Secondary team memberships grant only skills and shared memory — not purpose, not identity.

```typescript
interface Team {
  id: string;                          // UUID
  name: string;
  description: string;
  created_at: string;
  created_by: string;                  // Principal ID of creator
  org_id?: string;                     // null for independent teams
  members: TeamMember[];
  shared_skills_dir: string;           // Path to shared skills
  shared_memory_dir: string;           // Path to shared memory namespace
  defaults: TeamDefaults;
  autonomy_ceiling: AutonomyLevel;     // Max autonomy for any member
}

interface TeamMember {
  principal_id: string;
  role: 'owner' | 'admin' | 'member' | 'observer';
  joined_at: string;
  invited_by: string;
}

interface TeamDefaults {
  provider?: ProviderConfig;           // Default AI provider
  personality?: Partial<PersonalityConfig>;
  model?: string;
  skills?: string[];                   // Skills available to all team members
}
```

### Organization

An **Organization** wraps multiple teams with hard-floor governance. The policy cascade ensures compliance cannot be loosened at lower levels.

```typescript
interface OrgPolicy {
  org_id: string;
  org_name: string;
  version: number;                     // Monotonically increasing
  updated_at: string;
  updated_by: string;                  // Principal ID

  hard_floors: HardFloors;            // Can only tighten, never loosen
  soft_defaults: SoftDefaults;        // Most specific wins

  budget?: BudgetPolicy;
  compliance?: CompliancePolicy;
}

interface HardFloors {
  max_autonomy: AutonomyLevel;         // Org-wide ceiling
  blocked_tools: string[];             // Tools no one can use
  blocked_providers: string[];         // Providers not allowed
  require_audit: boolean;              // Force audit logging
  max_context_window?: number;         // Token limit per request
  data_classification_floor: 'public' | 'internal' | 'confidential' | 'restricted';
}

interface SoftDefaults {
  provider?: ProviderConfig;
  model?: string;
  personality?: Partial<PersonalityConfig>;
}

interface BudgetPolicy {
  daily_token_limit?: number;          // Per-principal
  daily_cost_limit_cents?: number;     // Per-principal
  monthly_cost_limit_cents?: number;   // Org-wide
  alert_threshold_percent: number;     // Alert at this % of limit
}

interface CompliancePolicy {
  frameworks: string[];                // e.g. ['soc2', 'eu-ai-act', 'nist-ai-rmf']
  audit_retention_days: number;
  require_hash_chain: boolean;         // Tamper-evident audit log
  export_schedule?: string;            // Cron expression for auto-export
}
```

## Intent Cascade

Configuration resolves using CSS-specificity rules. Three categories of settings cascade differently:

### Hard Floors (Security/Compliance)

Can only **tighten**, never loosen. Applied in order: Org → Team → Principal.

```
Example: Org sets max_autonomy = ACT_SAFE
         Team tries to set max_autonomy = AUTONOMOUS
         → Ignored. Team gets ACT_SAFE (org floor wins)

         Team sets max_autonomy = SUGGEST
         → Applied. Team gets SUGGEST (tighter is allowed)
```

Hard floor fields: `max_autonomy`, `blocked_tools`, `blocked_providers`, `require_audit`, `data_classification_floor`.

### Soft Defaults (Model/Personality)

Most **specific** wins. Applied in order: Principal > Team > Org > System.

```
Example: Org sets model = claude-sonnet-4-6
         Team sets nothing
         Principal sets model = claude-haiku-4-5-20251001
         → Principal gets claude-haiku-4-5-20251001
```

Soft default fields: `provider`, `model`, `personality`.

### Additive (Skills/Hooks)

**Union** of all levels. Skills from org, team, and principal are all available.

```
Example: Org provides: [Compliance, Audit]
         Team provides: [Research, CodeReview]
         Principal has: [DoWork, Reflect]
         → Available skills: [Compliance, Audit, Research, CodeReview, DoWork, Reflect]
```

### Resolution Function

```typescript
function resolveEngram(
  orgPolicy: OrgPolicy | null,
  teamConfig: Team | null,
  principalConfig: EngramConfig
): ResolvedConfig {
  return {
    // Hard floors: tightest wins
    max_autonomy: min(
      orgPolicy?.hard_floors.max_autonomy ?? 'AUTONOMOUS',
      teamConfig?.autonomy_ceiling ?? 'AUTONOMOUS',
      principalConfig.autonomy_level ?? 'AUTONOMOUS'
    ),
    blocked_tools: union(
      orgPolicy?.hard_floors.blocked_tools ?? [],
      // teams and principals can ADD but not REMOVE blocks
    ),
    require_audit: orgPolicy?.hard_floors.require_audit || false,

    // Soft defaults: most specific wins
    provider: principalConfig.provider
      ?? teamConfig?.defaults.provider
      ?? orgPolicy?.soft_defaults.provider
      ?? systemDefault,
    model: principalConfig.provider.model
      ?? teamConfig?.defaults.model
      ?? orgPolicy?.soft_defaults.model
      ?? systemDefault,

    // Additive: union
    skills: union(
      orgPolicy?.skills ?? [],
      teamConfig?.defaults.skills ?? [],
      principalConfig.skills ?? []
    ),
  };
}
```

## File Structure

### Team Configuration

```
~/.engram/teams/
├── <team-id>/
│   ├── team.json            # Team metadata + members
│   ├── defaults.json        # Team soft defaults
│   ├── shared-skills/       # Skills available to all team members
│   │   └── <SkillName>/
│   │       └── SKILL.md
│   └── shared-memory/       # Team-scoped shared memory
│       ├── context.md
│       └── decisions.md
```

### Organization Configuration

```
~/.engram/org/
├── policy.json              # OrgPolicy (hard floors + soft defaults)
├── policy.history.jsonl     # Version history for rollback
├── members.json             # Org-level principal registry
└── teams.json               # Team directory
```

### Audit Trail

```
MEMORY/
├── AUDIT/
│   ├── chain.jsonl          # Hash-chained audit entries
│   ├── chain.checkpoint     # Latest verified hash
│   └── exports/             # Compliance export outputs
│       └── <framework>-<date>.json
```

## CLI Commands

### Team Management

```bash
engram team create <name>              # Create a new team
engram team list                       # List all teams
engram team invite <team> <email>      # Invite member to team
engram team remove <team> <member>     # Remove member from team
```

### Agent Management

```bash
engram agent create <name>             # Create an agent principal
  --team <team-id>                     # Assign to primary team
  --provider <id>                      # AI provider
  --model <model>                      # Model override

engram agent list                      # List all agents
  --team <team-id>                     # Filter by team

engram agent decommission <id>         # Graceful agent shutdown
  --archive                            # Archive memory/state

engram agent migrate <id> <team>       # Move to different team
```

### Organization Policy

```bash
engram org policy set <key> <value>    # Set policy field
engram org policy get [key]            # Get policy (or all)
engram org policy propagate            # Push policy to all teams
```

### Compliance

```bash
engram compliance export <framework>   # Export audit data
  --from <date>                        # Start date
  --to <date>                          # End date
  --format json|csv|pdf                # Output format
```

## Hooks

### PolicyEnforcer (PreToolUse)

Enforces org/team hard floors before any tool executes. Runs AFTER SecurityValidator (which handles file/command safety) and adds governance-layer checks.

**Checks:**
- Tool not in `blocked_tools`
- Action within principal's effective autonomy level
- Provider matches allowed list
- Data classification not violated

**Decisions:**
- `continue` — within policy
- `block` (exit 2) — hard floor violated
- `escalate` — action above autonomy level, route to human

### AuditLogger (Stop)

Enhanced audit trail with intent chain tracking. Every AI response is logged with:
- Principal ID, team ID, org ID
- Tool calls made
- Intent chain (which policy/team/user triggered this)
- SHA-256 hash chain linking to previous entry

### BudgetTracker (PreToolUse)

Tracks token/cost usage against budget limits. Before each tool call:
- Check current period spend against `daily_token_limit` / `daily_cost_limit`
- If over limit: block with budget exceeded message
- If approaching `alert_threshold_percent`: warn but allow

### EscalationHandler (PreToolUse)

Routes actions that exceed the principal's autonomy level to a human supervisor:
- OBSERVE trying to execute → escalate
- SUGGEST trying to write files → escalate
- ACT_SAFE trying to run destructive commands → escalate

Escalation creates a pending approval entry that a human with sufficient role can approve/deny.

## Product Tiers

| | Free | Team | Enterprise |
|---|---|---|---|
| **Core Engram** | Full | Full | Full |
| **Members** | 1 human | 5-50 | Unlimited |
| **Agents** | Unlimited (local) | 50 | Unlimited |
| **Teams** | N/A | Up to 10 | Unlimited + nested |
| **Policy** | Personal config | Team soft defaults | Org hard floors + cascade |
| **Vouch** | Optional personal | Team scores + staking | Private relay + federation |
| **Auth** | Nostr keypair | Email + Nostr | SSO/SAML + Nostr |
| **Governance** | Local audit.jsonl | 90-day cloud audit | Full compliance exports |
| **Dashboard** | N/A | Basic web | Full web + API |

**Critical**: Free tier stays exactly as it is today. No code paths change for existing users. Team/enterprise features activate only when `org_id` or `team_ids` are present in config.

## Vouch Integration

Trust scores come from the Vouch API (already deployed on Railway). The integration is read-only for Phase 1:

```typescript
async function getVouchScore(pubkey: string): Promise<number | null> {
  const url = `${VOUCH_API_URL}/v1/public/agents/${pubkey}/vouch-score`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.score ?? null;
}
```

Autonomy level derived from Vouch score:
- `score < 20` → OBSERVE
- `score 20-39` → SUGGEST
- `score 40-59` → ACT_SAFE
- `score 60-79` → ACT_FULL
- `score >= 80` → AUTONOMOUS

## Migration Path

### Free → Team

1. Run `engram team create <name>`
2. Existing config.json gets `team_ids` field added
3. Team shared directories created
4. Existing skills/memory untouched
5. User becomes team owner

### Team → Enterprise

1. Run `engram org policy set` to initialize org
2. Config.json gets `org_id` field added
3. Policy cascade begins enforcing
4. Existing team configs gain hard floors
5. Audit chain initialized

### Team/Enterprise → Free (Downgrade)

1. Remove `org_id` and `team_ids` from config
2. Personal skills and memory preserved
3. Shared team skills become inaccessible (not deleted)
4. Audit trail preserved locally
5. No functionality loss — only governance features removed

## Open Questions (Pending Decision)

1. **Enterprise staking**: Real Lightning sats or internal reputation points?
2. **Agent-to-agent trust**: Implicit within team or explicit Vouch staking?
3. **Public vs enterprise Vouch**: Separate domains or interconnected?
4. **Team tier pricing**: Per-member, per-agent, or flat + usage?
5. **Skill marketplace governance**: Open install or org-approved whitelist for enterprise?

## Compatibility Guarantees

- Existing `engram` commands work unchanged
- Existing hooks, skills, memory structure untouched
- New features are purely additive (new files, new optional config fields)
- Free tier behavior identical to current v0.1.3
- `engram bundle` still works (team features excluded from personal bundles)
- No new required dependencies
