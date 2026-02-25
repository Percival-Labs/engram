#!/usr/bin/env node
/**
 * AuditLogger.hook.ts - Hash-Chained Audit Trail (Stop)
 *
 * PURPOSE: Creates tamper-evident audit entries after each AI response.
 * Each entry includes SHA-256 hash of previous entry for chain integrity.
 *
 * TRIGGER: Stop
 *
 * INPUT:
 * - stdin: Stop event JSON (session_id, response metadata)
 *
 * OUTPUT:
 * - stdout: None (never blocks)
 * - stderr: Status messages
 * - exit(0): Always (non-blocking)
 *
 * SIDE EFFECTS:
 * - Appends to: ~/.engram/memory/audit/chain.jsonl (or MEMORY/AUDIT/chain.jsonl fallback)
 *
 * INTER-HOOK RELATIONSHIPS:
 * - DEPENDS ON: ~/.engram/org/policy.json, ~/.engram/config.json
 * - COORDINATES WITH: None (post-response logging)
 * - MUST RUN BEFORE: None
 * - MUST RUN AFTER: AI response generation
 *
 * ERROR HANDLING:
 * - Missing audit dir: Created automatically
 * - Missing chain file: Initializes with "genesis" as first prev_hash
 * - No org policy: Skips audit (no requirement)
 * - Write failures: Logged to stderr, exits gracefully
 *
 * PERFORMANCE:
 * - Non-blocking: Yes
 * - Typical execution: <15ms (SHA-256 hashing + file append)
 * - Design: Append-only log, no reads except last line for chain
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { readStdinText } from './lib/compat';
import { engramPath } from './lib/paths';

// ========================================
// Types
// ========================================

interface HookInput {
  session_id?: string;
  [key: string]: unknown;
}

interface OrgPolicy {
  require_audit?: boolean;
  [key: string]: unknown;
}

interface EngramConfig {
  autonomy_level?: string;
  principal_type?: string;
  userName?: string;
  team_ids?: string[];
  org_id?: string;
}

interface AuditEntry {
  timestamp: string;
  principal_id: string;
  team_id: string | undefined;
  org_id: string | undefined;
  action: string;
  autonomy_level: string;
  decision: string;
  prev_hash: string;
  hash: string;
}

// ========================================
// Config Loading
// ========================================

const engramHome = join(homedir(), '.engram');

function loadJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    console.error(`[AuditLogger] Failed to parse: ${path}`);
    return null;
  }
}

// ========================================
// Audit Path Resolution
// ========================================

function getAuditDir(): string {
  // Prefer ~/.engram/memory/audit/
  const engramAuditDir = join(engramHome, 'memory', 'audit');
  if (existsSync(engramAuditDir) || existsSync(engramHome)) {
    return engramAuditDir;
  }

  // Fall back to ~/.claude/MEMORY/AUDIT/
  return engramPath('MEMORY', 'AUDIT');
}

function getChainPath(): string {
  return join(getAuditDir(), 'chain.jsonl');
}

// ========================================
// Hash Chain Logic
// ========================================

function getLastHash(chainPath: string): string {
  if (!existsSync(chainPath)) {
    return 'genesis';
  }

  try {
    const content = readFileSync(chainPath, 'utf-8').trim();
    if (!content) return 'genesis';

    // Get the last non-empty line
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) return 'genesis';

    const lastLine = lines[lines.length - 1];
    const lastEntry = JSON.parse(lastLine) as AuditEntry;
    return lastEntry.hash || 'genesis';
  } catch {
    console.error('[AuditLogger] Failed to read last hash, using genesis');
    return 'genesis';
  }
}

function computeHash(entry: AuditEntry): string {
  const content = JSON.stringify({ ...entry, hash: undefined }) + entry.prev_hash;
  return createHash('sha256').update(content).digest('hex');
}

// ========================================
// Main
// ========================================

async function main(): Promise<void> {
  try {
    const text = await readStdinText();

    let input: HookInput = {};
    if (text.trim()) {
      try {
        input = JSON.parse(text);
      } catch {
        console.error('[AuditLogger] Failed to parse stdin JSON');
      }
    }

    // Load org policy - if no policy and no audit requirement, skip
    const orgPolicyPath = join(engramHome, 'org', 'policy.json');
    const orgPolicy = loadJsonFile<OrgPolicy>(orgPolicyPath);

    if (!orgPolicy && !existsSync(orgPolicyPath)) {
      // No org policy at all - skip audit (free tier)
      process.exit(0);
    }

    if (orgPolicy && orgPolicy.require_audit === false) {
      // Org explicitly disabled audit
      process.exit(0);
    }

    // Load agent config
    const configPath = join(engramHome, 'config.json');
    const config = loadJsonFile<EngramConfig>(configPath);

    // Resolve audit chain path
    const chainPath = getChainPath();
    const auditDir = getAuditDir();

    // Ensure audit directory exists
    if (!existsSync(auditDir)) {
      mkdirSync(auditDir, { recursive: true });
    }

    // Get previous hash for chain integrity
    const previousHash = getLastHash(chainPath);

    // Build audit entry
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      principal_id: config?.userName || 'unknown',
      team_id: config?.team_ids?.[0] || undefined,
      org_id: config?.org_id || undefined,
      action: 'ai_response',
      autonomy_level: config?.autonomy_level || 'AUTONOMOUS',
      decision: 'allow',
      prev_hash: previousHash,
      hash: '', // computed below
    };

    // Compute SHA-256 hash for chain integrity
    entry.hash = computeHash(entry);

    // Append entry to chain
    const line = JSON.stringify(entry) + '\n';
    appendFileSync(chainPath, line, 'utf-8');

    console.error(`[AuditLogger] Recorded audit entry (chain hash: ${entry.hash.slice(0, 12)}...)`);
    process.exit(0);
  } catch (error) {
    console.error(`[AuditLogger] Error: ${error}`);
    process.exit(0);
  }
}

main();
