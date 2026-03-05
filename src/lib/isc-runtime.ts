/**
 * ISC Runtime Engine
 *
 * Provides ISC (Ideal State Criteria) as a runtime primitive for Engram agents.
 * Unlike the CLI `engram isc` commands (inspection tools), this module is
 * designed to be imported by agent runtimes and embedded in execution loops.
 *
 * Core operations:
 * - generate() — Create ISC criteria from a task description
 * - track()    — Record phase boundary state
 * - verify()   — Check all criteria, return pass/fail report
 * - persist()  — Save ISC state to disk for cross-restart continuity
 * - load()     — Restore ISC state from disk
 * - inject()   — Format ISC state for system prompt injection
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

// ── Types ────────────────────────────────────────────────────

export type CriterionPriority = 'CRITICAL' | 'IMPORTANT' | 'NICE';
export type CriterionStatus = 'pending' | 'passed' | 'failed';

export interface ISCCriterion {
  id: string;
  text: string;
  verify: string;
  priority: CriterionPriority;
  status: CriterionStatus;
  /** When status last changed */
  updatedAt?: string;
  /** Optional notes from verification */
  notes?: string;
}

export interface ISCAntiCriterion {
  id: string;
  text: string;
  verify: string;
  /** If violated, what happened */
  violated?: boolean;
  violationNote?: string;
}

export interface ISCDelta {
  timestamp: string;
  phase: string;
  task: string;
  added: Array<{ id: string; text: string }>;
  modified: Array<{ id: string; was: string; now: string }>;
  removed: Array<{ id: string; reason: string }>;
  statusChanges: Array<{ id: string; from: CriterionStatus; to: CriterionStatus }>;
  learnings?: string;
}

export interface ISCState {
  task: string;
  phase: string;
  criteria: ISCCriterion[];
  antiCriteria: ISCAntiCriterion[];
  deltas: ISCDelta[];
  createdAt: string;
  updatedAt: string;
}

// ── ISC Engine ───────────────────────────────────────────────

export class ISCEngine {
  private state: ISCState;
  private stateDir: string;

  constructor(stateDir: string, task?: string) {
    this.stateDir = stateDir;
    mkdirSync(join(stateDir, 'isc'), { recursive: true });

    // Try loading existing state
    const existing = this.load();
    if (existing) {
      this.state = existing;
      if (task) this.state.task = task;
    } else {
      this.state = {
        task: task ?? 'unspecified',
        phase: 'INIT',
        criteria: [],
        antiCriteria: [],
        deltas: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  // ── Generate ─────────────────────────────────────────────

  /**
   * Add criteria from a structured definition.
   * Typically called after an LLM generates criteria from a task description.
   */
  addCriteria(criteria: Array<Omit<ISCCriterion, 'status' | 'updatedAt'>>): void {
    const added: ISCDelta['added'] = [];

    for (const c of criteria) {
      // Skip duplicates
      if (this.state.criteria.some(existing => existing.id === c.id)) continue;

      this.state.criteria.push({
        ...c,
        status: 'pending',
        updatedAt: new Date().toISOString(),
      });
      added.push({ id: c.id, text: c.text });
    }

    if (added.length > 0) {
      this.recordDelta({ added });
    }
  }

  addAntiCriteria(anti: Array<Omit<ISCAntiCriterion, 'violated'>>): void {
    for (const a of anti) {
      if (this.state.antiCriteria.some(existing => existing.id === a.id)) continue;
      this.state.antiCriteria.push({ ...a, violated: false });
    }
    this.persist();
  }

  // ── Track ────────────────────────────────────────────────

  /**
   * Record a phase transition. Captures current state as a delta.
   */
  setPhase(phase: string): void {
    const oldPhase = this.state.phase;
    this.state.phase = phase;
    this.recordDelta({}, `Phase: ${oldPhase} → ${phase}`);
  }

  /**
   * Update a criterion's status.
   */
  updateStatus(id: string, status: CriterionStatus, notes?: string): void {
    const criterion = this.state.criteria.find(c => c.id === id);
    if (!criterion) return;

    const oldStatus = criterion.status;
    criterion.status = status;
    criterion.updatedAt = new Date().toISOString();
    if (notes) criterion.notes = notes;

    this.recordDelta({
      statusChanges: [{ id, from: oldStatus, to: status }],
    });
  }

  /**
   * Modify a criterion's text (criteria evolution).
   */
  modifyCriterion(id: string, newText: string, newVerify?: string): void {
    const criterion = this.state.criteria.find(c => c.id === id);
    if (!criterion) return;

    const was = criterion.text;
    criterion.text = newText;
    if (newVerify) criterion.verify = newVerify;
    criterion.updatedAt = new Date().toISOString();

    this.recordDelta({
      modified: [{ id, was, now: newText }],
    });
  }

  /**
   * Remove a criterion with a reason.
   */
  removeCriterion(id: string, reason: string): void {
    const idx = this.state.criteria.findIndex(c => c.id === id);
    if (idx === -1) return;

    const removed = this.state.criteria.splice(idx, 1)[0];
    this.recordDelta({
      removed: [{ id, reason }],
    });
  }

  /**
   * Flag an anti-criterion as violated.
   */
  flagViolation(id: string, note: string): void {
    const anti = this.state.antiCriteria.find(a => a.id === id);
    if (!anti) return;

    anti.violated = true;
    anti.violationNote = note;
    this.persist();
  }

  // ── Verify ───────────────────────────────────────────────

  /**
   * Check all criteria. Returns a verification report.
   */
  verify(): ISCVerifyReport {
    const total = this.state.criteria.length;
    const passed = this.state.criteria.filter(c => c.status === 'passed').length;
    const failed = this.state.criteria.filter(c => c.status === 'failed').length;
    const pending = this.state.criteria.filter(c => c.status === 'pending').length;

    const criticalFailed = this.state.criteria.filter(
      c => c.priority === 'CRITICAL' && c.status === 'failed'
    );
    const criticalPending = this.state.criteria.filter(
      c => c.priority === 'CRITICAL' && c.status === 'pending'
    );

    const violations = this.state.antiCriteria.filter(a => a.violated);

    const shipReady = criticalFailed.length === 0
      && criticalPending.length === 0
      && violations.length === 0;

    return {
      total,
      passed,
      failed,
      pending,
      criticalFailed,
      criticalPending,
      violations,
      shipReady,
      phase: this.state.phase,
      task: this.state.task,
    };
  }

  // ── Inject ───────────────────────────────────────────────

  /**
   * Format current ISC state for injection into a system prompt or
   * conversation context. Returns a markdown string.
   */
  inject(): string {
    const report = this.verify();
    const lines: string[] = [];

    lines.push('```');
    lines.push('ISC TRACKER');
    lines.push(`Phase: ${this.state.phase}`);
    lines.push(`Task: ${this.state.task}`);
    lines.push(`Criteria: ${report.total} total`);
    lines.push(`Anti:     ${this.state.antiCriteria.length} total`);
    lines.push(`Status: ${report.passed} passed / ${report.pending} pending / ${report.failed} failed`);
    lines.push(`Ship ready: ${report.shipReady ? 'YES' : 'NO'}`);

    if (report.criticalFailed.length > 0) {
      lines.push('');
      lines.push('CRITICAL FAILURES:');
      for (const c of report.criticalFailed) {
        lines.push(`  ! ${c.id}: ${c.text}`);
        if (c.notes) lines.push(`    Note: ${c.notes}`);
      }
    }

    if (report.violations.length > 0) {
      lines.push('');
      lines.push('ANTI-CRITERIA VIOLATIONS:');
      for (const v of report.violations) {
        lines.push(`  ! ${v.id}: ${v.text}`);
        if (v.violationNote) lines.push(`    ${v.violationNote}`);
      }
    }

    // Show all criteria with status
    lines.push('');
    lines.push('Criteria:');
    for (const c of this.state.criteria) {
      const icon = c.status === 'passed' ? '[x]' : c.status === 'failed' ? '[!]' : '[ ]';
      const pri = c.priority === 'CRITICAL' ? '*' : c.priority === 'IMPORTANT' ? '+' : ' ';
      lines.push(`  ${icon}${pri} ${c.id}: ${c.text} | Verify: ${c.verify}`);
    }

    if (this.state.antiCriteria.length > 0) {
      lines.push('');
      lines.push('Anti-criteria:');
      for (const a of this.state.antiCriteria) {
        const icon = a.violated ? '[!]' : '[ok]';
        lines.push(`  ${icon} ${a.id}: ${a.text} | Verify: ${a.verify}`);
      }
    }

    // Recent deltas (last 3)
    const recentDeltas = this.state.deltas.slice(-3);
    if (recentDeltas.length > 0) {
      lines.push('');
      lines.push('Recent changes:');
      for (const d of recentDeltas) {
        const parts: string[] = [];
        if (d.added.length) parts.push(`+${d.added.length} added`);
        if (d.modified.length) parts.push(`~${d.modified.length} modified`);
        if (d.removed.length) parts.push(`-${d.removed.length} removed`);
        if (d.statusChanges.length) parts.push(`${d.statusChanges.length} status changes`);
        lines.push(`  ${d.phase}: ${parts.join(', ') || 'phase transition'}`);
      }
    }

    lines.push('```');
    return lines.join('\n');
  }

  // ── Persist / Load ───────────────────────────────────────

  /**
   * Save current state to disk.
   */
  persist(): void {
    this.state.updatedAt = new Date().toISOString();
    const statePath = join(this.stateDir, 'isc', 'state.json');
    writeFileSync(statePath, JSON.stringify(this.state, null, 2));
  }

  /**
   * Load state from disk. Returns null if no state exists.
   */
  load(): ISCState | null {
    const statePath = join(this.stateDir, 'isc', 'state.json');
    if (!existsSync(statePath)) return null;
    try {
      return JSON.parse(readFileSync(statePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Append a delta to the persistent log (JSONL).
   */
  private appendDeltaLog(delta: ISCDelta): void {
    const logPath = join(this.stateDir, 'isc', 'deltas.jsonl');
    appendFileSync(logPath, JSON.stringify(delta) + '\n');
  }

  // ── Accessors ────────────────────────────────────────────

  getState(): Readonly<ISCState> {
    return this.state;
  }

  getCriteria(): ReadonlyArray<ISCCriterion> {
    return this.state.criteria;
  }

  getAntiCriteria(): ReadonlyArray<ISCAntiCriterion> {
    return this.state.antiCriteria;
  }

  getPhase(): string {
    return this.state.phase;
  }

  // ── Internal ─────────────────────────────────────────────

  private recordDelta(
    partial: Partial<Omit<ISCDelta, 'timestamp' | 'phase' | 'task'>>,
    learnings?: string,
  ): void {
    const delta: ISCDelta = {
      timestamp: new Date().toISOString(),
      phase: this.state.phase,
      task: this.state.task,
      added: partial.added ?? [],
      modified: partial.modified ?? [],
      removed: partial.removed ?? [],
      statusChanges: partial.statusChanges ?? [],
      learnings,
    };

    this.state.deltas.push(delta);

    // Keep only last 50 deltas in memory (full log on disk)
    if (this.state.deltas.length > 50) {
      this.state.deltas = this.state.deltas.slice(-50);
    }

    this.appendDeltaLog(delta);
    this.persist();
  }
}

// ── Verify Report ──────────────────────────────────────────

export interface ISCVerifyReport {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  criticalFailed: ISCCriterion[];
  criticalPending: ISCCriterion[];
  violations: ISCAntiCriterion[];
  shipReady: boolean;
  phase: string;
  task: string;
}

// ── Convenience: ISC prompt block generator ────────────────

/**
 * Generate an ISC instruction block for inclusion in system prompts.
 * This tells the LLM HOW to use ISC, not what the current state is.
 * Pair with engine.inject() for the current state.
 */
export function iscSystemInstructions(): string {
  return `## ISC — Ideal State Criteria (Always Active)

ISC is always running. Every non-trivial task gets criteria generated, tracked, and verified.

When you begin a task:
1. Generate ISC criteria (CRITICAL/IMPORTANT/NICE priorities)
2. Generate anti-criteria (things that must NOT happen)
3. Track at phase boundaries (report ISC TRACKER)
4. Verify before marking complete

Format for criteria:
  ISC-XX-C#: 8-12 word criterion | Verify: verification method
  ISC-XX-A#: anti-criterion (must NOT happen) | Verify: detection method

Where XX is a 2-letter task code (e.g., RC for RevenueCat, AG for Agent).

Update ISC state by calling the isc_update tool with actions:
- add_criterion: { id, text, verify, priority }
- add_anti: { id, text, verify }
- update_status: { id, status, notes }
- set_phase: { phase }
- flag_violation: { id, note }

ISC state persists across restarts. Check it at every phase boundary.`;
}
