---
name: Compliance
description: Audit and compliance workflows for enterprise governance. USE WHEN audit OR compliance OR export OR soc2 OR eu ai act OR nist OR governance report OR audit trail.
---

# Compliance

Enterprise compliance workflows for generating audit reports, verifying policy adherence, and exporting data for regulatory frameworks.

- **ExportAudit**: Generate compliance-ready audit exports
- **VerifyChain**: Validate audit chain integrity
- **PolicyReport**: Generate policy compliance report

## Workflow Routing

| Intent | Workflow | When to use |
|--------|----------|-------------|
| Export audit data | [ExportAudit](Workflows/ExportAudit.md) | "export audit", "compliance report", "SOC 2 export" |
| Verify integrity | [VerifyChain](Workflows/VerifyChain.md) | "verify audit", "check chain", "integrity check" |
| Policy compliance | [PolicyReport](Workflows/PolicyReport.md) | "policy report", "are we compliant", "governance status" |

## Supported Frameworks

| Framework | Export Key | Status |
|-----------|-----------|--------|
| SOC 2 Type II | soc2 | Phase 3 |
| EU AI Act | eu-ai-act | Phase 3 |
| NIST AI RMF | nist-ai-rmf | Phase 3 |
| ISO 42001 | iso-42001 | Phase 3 |

## Examples

**Example 1: SOC 2 export**
> User: "Export our SOC 2 audit data for January"
Routes to: `ExportAudit` — filters chain.jsonl by date, formats for SOC 2 controls.

**Example 2: Chain verification**
> User: "Verify our audit trail is intact"
Routes to: `VerifyChain` — recomputes all hashes, reports any breaks.
