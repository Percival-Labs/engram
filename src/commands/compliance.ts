import { loadOrgPolicy } from '../lib/config';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ── Types ────────────────────────────────────────────────────────

interface ExportOptions {
  from?: string;
  to?: string;
  format?: string;
}

interface AuditRecord {
  timestamp: string;
  principal_id: string;
  team_id?: string;
  org_id?: string;
  action: string;
  tool?: string;
  tool_input_summary?: string;
  autonomy_level: string;
  decision: string;
  reason?: string;
  prev_hash: string;
  hash: string;
}

// ── Constants ────────────────────────────────────────────────────

const VALID_FRAMEWORKS = ['soc2', 'eu-ai-act', 'nist-ai-rmf', 'iso-42001'] as const;

const AUDIT_CHAIN_PATHS = [
  join(homedir(), '.claude', 'MEMORY', 'AUDIT', 'chain.jsonl'),
  join(homedir(), '.engram', 'memory', 'audit', 'chain.jsonl'),
];

const EXPORT_DIRS = [
  join(homedir(), '.claude', 'MEMORY', 'AUDIT', 'exports'),
  join(homedir(), '.engram', 'memory', 'audit', 'exports'),
];

// ── Helpers ──────────────────────────────────────────────────────

function findAuditChain(): string {
  for (const path of AUDIT_CHAIN_PATHS) {
    if (existsSync(path)) return path;
  }
  // Default to first path, will create if needed
  return AUDIT_CHAIN_PATHS[0];
}

function findExportDir(): string {
  // Use whichever audit directory already exists
  for (let i = 0; i < AUDIT_CHAIN_PATHS.length; i++) {
    if (existsSync(AUDIT_CHAIN_PATHS[i])) return EXPORT_DIRS[i];
  }
  return EXPORT_DIRS[0];
}

function parseAuditEntries(chainPath: string): AuditRecord[] {
  if (!existsSync(chainPath)) return [];

  const content = readFileSync(chainPath, 'utf-8').trim();
  if (!content) return [];

  const entries: AuditRecord[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // Skip malformed lines
    }
  }
  return entries;
}

function filterByDateRange(entries: AuditRecord[], from?: string, to?: string): AuditRecord[] {
  return entries.filter(entry => {
    if (from && entry.timestamp < from) return false;
    if (to && entry.timestamp > to) return false;
    return true;
  });
}

function toCsv(entries: AuditRecord[]): string {
  if (entries.length === 0) return '';

  const headers = [
    'timestamp',
    'principal_id',
    'team_id',
    'org_id',
    'action',
    'tool',
    'tool_input_summary',
    'autonomy_level',
    'decision',
    'reason',
    'prev_hash',
    'hash',
  ];

  const headerRow = headers.join(',');
  const dataRows = entries.map(entry =>
    headers.map(h => {
      const val = (entry as any)[h];
      if (val == null) return '';
      const str = String(val);
      // Escape fields containing commas, quotes, or newlines
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(',')
  );

  return [headerRow, ...dataRows].join('\n') + '\n';
}

// ── Command ──────────────────────────────────────────────────────

/**
 * Export audit data for a specific compliance framework.
 */
export function complianceExport(framework: string, options: ExportOptions): void {
  // ── Validate framework ────────────────────────────────────────
  if (!VALID_FRAMEWORKS.includes(framework as any)) {
    console.log(`  \x1b[33mUnsupported framework: "${framework}"\x1b[0m`);
    console.log(`  \x1b[90mSupported frameworks: ${VALID_FRAMEWORKS.join(', ')}\x1b[0m`);
    return;
  }

  // ── Load audit chain ──────────────────────────────────────────
  const chainPath = findAuditChain();

  if (!existsSync(chainPath)) {
    // Create empty chain file
    const chainDir = join(chainPath, '..');
    mkdirSync(chainDir, { recursive: true });
    writeFileSync(chainPath, '');
    console.log(`  \x1b[33mNo audit chain found. Created empty chain at:\x1b[0m`);
    console.log(`  \x1b[90m${chainPath}\x1b[0m`);
    console.log('');
  }

  const entries = parseAuditEntries(chainPath);

  // ── Filter by date range ──────────────────────────────────────
  const filtered = filterByDateRange(entries, options.from, options.to);

  // ── Format output ─────────────────────────────────────────────
  const format = options.format || 'json';
  let output: string;
  let ext: string;

  if (format === 'csv') {
    output = toCsv(filtered);
    ext = 'csv';
  } else if (format === 'json') {
    output = JSON.stringify(filtered, null, 2) + '\n';
    ext = 'json';
  } else {
    console.log(`  \x1b[33mUnsupported format: "${format}"\x1b[0m`);
    console.log(`  \x1b[90mSupported formats: json, csv\x1b[0m`);
    return;
  }

  // ── Write export file ─────────────────────────────────────────
  const exportDir = findExportDir();
  mkdirSync(exportDir, { recursive: true });

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `${framework}-${dateStamp}.${ext}`;
  const outputPath = join(exportDir, filename);

  writeFileSync(outputPath, output);

  // ── Print summary ─────────────────────────────────────────────
  console.log('');
  console.log(`  \x1b[1mCompliance Export: ${framework}\x1b[0m`);
  console.log('');

  if (options.from || options.to) {
    const range = [
      options.from ? `from ${options.from}` : '',
      options.to ? `to ${options.to}` : '',
    ].filter(Boolean).join(' ');
    console.log(`  \x1b[90mDate range: ${range}\x1b[0m`);
  }

  console.log(`  \x1b[32mExported ${filtered.length} entries to ${outputPath}\x1b[0m`);
  console.log('');
}
