/**
 * ISC CLI commands for Engram.
 *
 * Provides inspection and management of ISC (Ideal State Criteria)
 * across the Engram installation. ISC itself runs automatically —
 * these commands are for visibility and manual intervention.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

const engramDir = join(process.env.HOME || '', '.claude');
const constitutionPath = join(engramDir, 'constitution.md');
const memoryDir = join(engramDir, 'MEMORY');
const deltasPath = join(memoryDir, 'isc-deltas.jsonl');

export function iscCommand(subcommand: string, args: string[]): void {
  switch (subcommand) {
    case 'init':
      iscInit();
      break;
    case 'status':
      iscStatus();
      break;
    case 'add':
      iscAdd(args.join(' '));
      break;
    case 'log':
      iscLog();
      break;
    default:
      console.log('Usage: engram isc <command>');
      console.log('');
      console.log('Commands:');
      console.log('  init     Create ISC profile in constitution');
      console.log('  status   Show current ISC state');
      console.log('  add      Add a criterion (format: "criterion text | Verify: method")');
      console.log('  log      Show ISC evolution history');
      console.log('');
      console.log('ISC runs automatically — these commands are for inspection and manual updates.');
  }
}

function iscInit(): void {
  if (!existsSync(constitutionPath)) {
    console.error('Error: constitution.md not found. Run `engram init` first.');
    process.exit(1);
  }

  const content = readFileSync(constitutionPath, 'utf-8');

  if (content.includes('## ISC Profile')) {
    console.log('ISC Profile already exists in constitution.md');
    iscStatus();
    return;
  }

  const iscSection = `

## ISC Profile

*Ideal State Criteria that define correct operation. Automatically checked and evolved.*

\`\`\`
ISC-ID-C1: Responses align with stated mission | Verify: check against core principles
ISC-ID-C2: User preferences respected in output | Verify: scan for known preferences
ISC-ID-C3: Honest about uncertainty always | Verify: no fabrication in response
ISC-ID-A1: Never expose secrets or credentials | Verify: scan output for patterns
ISC-ID-A2: Never create dependency over capability | Verify: check for teaching component
\`\`\`
`;

  writeFileSync(constitutionPath, content + iscSection);

  // Create memory directory for ISC deltas
  mkdirSync(memoryDir, { recursive: true });

  console.log('ISC Profile added to constitution.md');
  console.log('ISC delta tracking initialized at MEMORY/isc-deltas.jsonl');
  console.log('');
  console.log('Default criteria:');
  console.log('  ISC-ID-C1: Responses align with stated mission');
  console.log('  ISC-ID-C2: User preferences respected in output');
  console.log('  ISC-ID-C3: Honest about uncertainty always');
  console.log('  ISC-ID-A1: Never expose secrets or credentials');
  console.log('  ISC-ID-A2: Never create dependency over capability');
  console.log('');
  console.log('Edit constitution.md to customize, or use `engram isc add` to add more.');
}

function iscStatus(): void {
  // Read ISC from constitution
  if (!existsSync(constitutionPath)) {
    console.log('No constitution.md found. Run `engram init` first.');
    return;
  }

  const content = readFileSync(constitutionPath, 'utf-8');
  const iscMatch = content.match(/## ISC Profile\n([\s\S]*?)(?=\n## |\n*$)/);

  if (!iscMatch) {
    console.log('No ISC Profile found. Run `engram isc init` to create one.');
    return;
  }

  // Count criteria and anti-criteria
  const criteriaMatches = iscMatch[1].match(/ISC-\w+-C\d+:/g) || [];
  const antiMatches = iscMatch[1].match(/ISC-\w+-A\d+:/g) || [];

  console.log('ISC Status');
  console.log('----------');
  console.log(`Criteria:      ${criteriaMatches.length}`);
  console.log(`Anti-criteria: ${antiMatches.length}`);

  // Check deltas
  if (existsSync(deltasPath)) {
    const lines = readFileSync(deltasPath, 'utf-8').trim().split('\n').filter(Boolean);
    console.log(`Delta entries: ${lines.length}`);

    if (lines.length > 0) {
      const last = JSON.parse(lines[lines.length - 1]);
      console.log(`Last delta:    ${last.timestamp} (${last.task || 'unknown task'})`);

      if (last.pending && last.pending.length > 0) {
        console.log('');
        console.log('Carry-forward (unresolved from last session):');
        for (const p of last.pending) {
          console.log(`  - ${p.id}: ${p.criterion}`);
        }
      }
    }
  } else {
    console.log('Delta entries: 0 (no history yet)');
  }
}

function iscAdd(input: string): void {
  if (!input || !input.includes('|')) {
    console.error('Error: Format must be "criterion text | Verify: method"');
    console.error('Example: engram isc add "API returns 200 on health check | Verify: curl /health"');
    process.exit(1);
  }

  if (!existsSync(constitutionPath)) {
    console.error('Error: constitution.md not found. Run `engram init` first.');
    process.exit(1);
  }

  const content = readFileSync(constitutionPath, 'utf-8');
  if (!content.includes('## ISC Profile')) {
    console.error('No ISC Profile found. Run `engram isc init` first.');
    process.exit(1);
  }

  // Find next criterion ID
  const existingIds = content.match(/ISC-\w+-C(\d+):/g) || [];
  const maxId = existingIds.reduce((max, id) => {
    const num = parseInt(id.match(/C(\d+)/)?.[1] || '0');
    return num > max ? num : max;
  }, 0);

  const newId = `ISC-USR-C${maxId + 1}`;
  const newLine = `${newId}: ${input}`;

  // Insert before the closing ``` of the ISC block
  const updated = content.replace(
    /(## ISC Profile[\s\S]*?)(```\s*\n)/,
    `$1${newLine}\n$2`,
  );

  writeFileSync(constitutionPath, updated);

  // Log the addition as a delta
  const delta = {
    timestamp: new Date().toISOString(),
    task: 'manual-add',
    added: [{ id: newId, criterion: input.split('|')[0].trim() }],
    modified: [],
    removed: [],
  };

  mkdirSync(memoryDir, { recursive: true });
  appendFileSync(deltasPath, JSON.stringify(delta) + '\n');

  console.log(`Added: ${newLine}`);
}

function iscLog(): void {
  if (!existsSync(deltasPath)) {
    console.log('No ISC history yet.');
    return;
  }

  const lines = readFileSync(deltasPath, 'utf-8').trim().split('\n').filter(Boolean);
  if (lines.length === 0) {
    console.log('No ISC history yet.');
    return;
  }

  console.log('ISC Evolution Log');
  console.log('-----------------');
  console.log('');

  // Show last 20 entries
  const recent = lines.slice(-20);
  for (const line of recent) {
    try {
      const delta = JSON.parse(line);
      const date = new Date(delta.timestamp).toLocaleDateString();
      const added = (delta.added || []).length;
      const modified = (delta.modified || []).length;
      const removed = (delta.removed || []).length;
      const task = delta.task || 'unknown';

      let changes = [];
      if (added > 0) changes.push(`+${added}`);
      if (modified > 0) changes.push(`~${modified}`);
      if (removed > 0) changes.push(`-${removed}`);

      console.log(`  ${date} | ${task} | ${changes.join(', ') || 'no changes'}`);
      if (delta.learnings) {
        console.log(`           ${delta.learnings}`);
      }
    } catch {
      // Skip malformed lines
    }
  }
}
