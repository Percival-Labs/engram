import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildOpenClawSkill, generateManifest, exportOpenClaw } from './export-openclaw';

const TEST_DIR = join(tmpdir(), 'engram-export-test-' + Date.now());
const SKILLS_DIR = join(TEST_DIR, 'skills');
const OUTPUT_DIR = join(TEST_DIR, 'output');

function createSkillFixture(name: string, frontmatter: string, body: string, workflows?: Record<string, string>) {
  const skillDir = join(SKILLS_DIR, name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), `---\n${frontmatter}\n---\n\n${body}`);

  if (workflows) {
    const wfDir = join(skillDir, 'Workflows');
    mkdirSync(wfDir, { recursive: true });
    for (const [wfName, wfContent] of Object.entries(workflows)) {
      writeFileSync(join(wfDir, `${wfName}.md`), wfContent);
    }
  }
}

beforeEach(() => {
  mkdirSync(SKILLS_DIR, { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// ── buildOpenClawSkill tests ─────────────────────────────────────

describe('buildOpenClawSkill', () => {
  test('generates OpenClaw SKILL.md with correct YAML frontmatter', () => {
    const result = buildOpenClawSkill({
      name: 'Research',
      description: 'General-purpose web research with configurable depth.',
      body: '# Research\n\nStructured web research.',
      useWhenTriggers: ['research', 'look up', 'find out'],
    });

    expect(result).toContain('---');
    expect(result).toContain('name: Research');
    expect(result).toContain('description: General-purpose web research with configurable depth.');
    expect(result).toContain('version: 1.0.0');
    expect(result).toContain('metadata:');
    expect(result).toContain('openclaw:');
    expect(result).toContain('source: engram');
  });

  test('includes "When to Activate" section from USE WHEN triggers', () => {
    const result = buildOpenClawSkill({
      name: 'DoWork',
      description: 'Queue-based task management.',
      body: '# DoWork\n\nTask queue.',
      useWhenTriggers: ['do work', 'capture request', 'work queue'],
    });

    expect(result).toContain('## When to Activate');
    expect(result).toContain('do work');
    expect(result).toContain('capture request');
    expect(result).toContain('work queue');
  });

  test('preserves original body content after frontmatter', () => {
    const body = '# Research\n\nStructured web research at three depth levels.\n\n## Workflow Routing\n\nSome routing table.';
    const result = buildOpenClawSkill({
      name: 'Research',
      description: 'Research skill.',
      body,
      useWhenTriggers: [],
    });

    expect(result).toContain('Structured web research at three depth levels.');
    expect(result).toContain('## Workflow Routing');
  });

  test('handles skill with no USE WHEN triggers gracefully', () => {
    const result = buildOpenClawSkill({
      name: 'Simple',
      description: 'A simple skill.',
      body: '# Simple\n\nDoes simple things.',
      useWhenTriggers: [],
    });

    // Should still be valid SKILL.md
    expect(result).toContain('---');
    expect(result).toContain('name: Simple');
    // Should NOT have empty "When to Activate" section
    expect(result).not.toContain('## When to Activate');
  });

  test('YAML frontmatter is properly terminated with closing ---', () => {
    const result = buildOpenClawSkill({
      name: 'Test',
      description: 'Test skill.',
      body: '# Test',
      useWhenTriggers: [],
    });

    const parts = result.split('---');
    // Opening ---, frontmatter, closing --- = at least 3 parts
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });
});

// ── generateManifest tests ───────────────────────────────────────

describe('generateManifest', () => {
  test('generates valid manifest with correct schema', () => {
    const manifest = generateManifest([
      { name: 'Research', description: 'Web research.', path: 'skills/Research/SKILL.md' },
      { name: 'DoWork', description: 'Task queue.', path: 'skills/DoWork/SKILL.md' },
    ]);

    expect(manifest.generator).toBe('engram');
    expect(manifest.format).toBe('openclaw');
    expect(manifest.skills).toHaveLength(2);
    expect(manifest.exportedAt).toBeDefined();
    expect(manifest.version).toBeDefined();
  });

  test('manifest skills contain name, description, and path', () => {
    const manifest = generateManifest([
      { name: 'Research', description: 'Research skill.', path: 'skills/Research/SKILL.md' },
    ]);

    expect(manifest.skills[0]).toEqual({
      name: 'Research',
      description: 'Research skill.',
      path: 'skills/Research/SKILL.md',
    });
  });

  test('manifest exportedAt is valid ISO date', () => {
    const manifest = generateManifest([]);
    const date = new Date(manifest.exportedAt);
    expect(date.toISOString()).toBe(manifest.exportedAt);
  });

  test('empty skills array produces valid manifest', () => {
    const manifest = generateManifest([]);
    expect(manifest.skills).toEqual([]);
    expect(manifest.generator).toBe('engram');
  });
});

// ── exportOpenClaw integration tests ─────────────────────────────

describe('exportOpenClaw (integration)', () => {
  test('exports skills directory to OpenClaw format', async () => {
    createSkillFixture(
      'Research',
      'name: Research\ndescription: General-purpose web research. USE WHEN research OR look up.',
      '# Research\n\nStructured web research.',
      { QuickLookup: '## QuickLookup\n\nFast answers.' }
    );

    await exportOpenClaw({
      output: OUTPUT_DIR,
      skillsDir: SKILLS_DIR,
      format: 'openclaw',
    });

    // Check directory structure
    expect(existsSync(join(OUTPUT_DIR, 'skills', 'Research', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'manifest.json'))).toBe(true);

    // Check manifest content
    const manifest = JSON.parse(readFileSync(join(OUTPUT_DIR, 'manifest.json'), 'utf-8'));
    expect(manifest.generator).toBe('engram');
    expect(manifest.format).toBe('openclaw');
    expect(manifest.skills).toHaveLength(1);
    expect(manifest.skills[0].name).toBe('Research');

    // Check exported SKILL.md content
    const exported = readFileSync(join(OUTPUT_DIR, 'skills', 'Research', 'SKILL.md'), 'utf-8');
    expect(exported).toContain('name: Research');
    expect(exported).toContain('version: 1.0.0');
    expect(exported).toContain('openclaw:');
    expect(exported).toContain('Structured web research.');
  });

  test('exports multiple skills', async () => {
    createSkillFixture(
      'Research',
      'name: Research\ndescription: Web research.',
      '# Research\n\nResearch body.'
    );
    createSkillFixture(
      'DoWork',
      'name: DoWork\ndescription: Task queue. USE WHEN do work OR queue.',
      '# DoWork\n\nDoWork body.'
    );

    await exportOpenClaw({
      output: OUTPUT_DIR,
      skillsDir: SKILLS_DIR,
      format: 'openclaw',
    });

    expect(existsSync(join(OUTPUT_DIR, 'skills', 'Research', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'skills', 'DoWork', 'SKILL.md'))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(OUTPUT_DIR, 'manifest.json'), 'utf-8'));
    expect(manifest.skills).toHaveLength(2);
  });

  test('flattens workflows into exported skill body', async () => {
    createSkillFixture(
      'Research',
      'name: Research\ndescription: Research skill.',
      '# Research\n\nMain body.',
      {
        QuickLookup: '## QuickLookup\n\nFast factual answers.',
        DeepDive: '## DeepDive\n\nThorough investigation.',
      }
    );

    await exportOpenClaw({
      output: OUTPUT_DIR,
      skillsDir: SKILLS_DIR,
      format: 'openclaw',
    });

    const exported = readFileSync(join(OUTPUT_DIR, 'skills', 'Research', 'SKILL.md'), 'utf-8');
    expect(exported).toContain('DeepDive');
    expect(exported).toContain('QuickLookup');
    expect(exported).toContain('Fast factual answers.');
    expect(exported).toContain('Thorough investigation.');
  });

  test('handles empty skills directory gracefully', async () => {
    await exportOpenClaw({
      output: OUTPUT_DIR,
      skillsDir: SKILLS_DIR,
      format: 'openclaw',
    });

    expect(existsSync(join(OUTPUT_DIR, 'manifest.json'))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(OUTPUT_DIR, 'manifest.json'), 'utf-8'));
    expect(manifest.skills).toEqual([]);
  });

  test('handles nonexistent skills directory gracefully', async () => {
    await exportOpenClaw({
      output: OUTPUT_DIR,
      skillsDir: join(TEST_DIR, 'nonexistent'),
      format: 'openclaw',
    });

    expect(existsSync(join(OUTPUT_DIR, 'manifest.json'))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(OUTPUT_DIR, 'manifest.json'), 'utf-8'));
    expect(manifest.skills).toEqual([]);
  });

  test('skill without frontmatter is skipped', async () => {
    const skillDir = join(SKILLS_DIR, 'NoFrontmatter');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# Just Content\n\nNo frontmatter here.');

    await exportOpenClaw({
      output: OUTPUT_DIR,
      skillsDir: SKILLS_DIR,
      format: 'openclaw',
    });

    const manifest = JSON.parse(readFileSync(join(OUTPUT_DIR, 'manifest.json'), 'utf-8'));
    expect(manifest.skills).toEqual([]);
    expect(existsSync(join(OUTPUT_DIR, 'skills', 'NoFrontmatter'))).toBe(false);
  });
});
