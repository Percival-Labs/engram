import { readFileSync, statSync } from 'fs';
import { parse as parseYaml } from 'yaml';

const MAX_HARNESS_SIZE = 1024 * 1024; // 1 MB

// ── Interfaces ─────────────────────────────────────────────────

export interface HarnessConfig {
  name: string;
  creator: string;
  platform: string;
  personality: Record<string, number>;
  model: { local: string; fallback: string };
  channels: Record<string, ChannelConfig>;
  vouch: {
    minScore: number;
    trustedTools: Record<string, number>;
  };
  security?: {
    readOnlyWeb?: boolean;
    noExternalExecution?: boolean;
  };
  gateway?: {
    port?: number;
  };
}

export interface ChannelConfig {
  submolts?: string[];
  postFrequency?: string;
  feedCheckInterval?: string;
  [key: string]: unknown;
}

export interface HarnessSections {
  identity: string;
  knowledgeBase: string;
  engagementRules: string;
  topicPriorities: string;
  postingCadence: string;
  voice: string;
  cDFilter: string;
  autonomy: string;
  securityProtocol: string;
  successMetrics: string;
  raw: string;
}

export interface ParsedHarness {
  config: HarnessConfig;
  sections: HarnessSections;
}

// ── Section heading → field mapping ────────────────────────────

const SECTION_MAP: Record<string, keyof HarnessSections> = {
  'identity': 'identity',
  'who you are': 'identity',
  'knowledge base': 'knowledgeBase',
  'engagement rules': 'engagementRules',
  'topic priorities': 'topicPriorities',
  'posting cadence': 'postingCadence',
  'voice': 'voice',
  'the c > d filter': 'cDFilter',
  'c > d filter': 'cDFilter',
  'autonomy boundaries': 'autonomy',
  'security protocol': 'securityProtocol',
  'what success looks like': 'successMetrics',
  'success metrics': 'successMetrics',
};

// ── Parser ─────────────────────────────────────────────────────

export function parseHarness(filePath: string): ParsedHarness {
  const size = statSync(filePath).size;
  if (size > MAX_HARNESS_SIZE) {
    throw new Error(`Harness file exceeds maximum size (${MAX_HARNESS_SIZE} bytes)`);
  }
  const content = readFileSync(filePath, 'utf-8');
  return parseHarnessContent(content);
}

export function parseHarnessContent(content: string): ParsedHarness {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    throw new Error('Harness file must have YAML frontmatter (---\\n...\\n---)');
  }

  const yamlStr = frontmatterMatch[1];
  const body = content.slice(frontmatterMatch[0].length).trim();

  const config = parseYaml(yamlStr) as Partial<HarnessConfig>;
  validateConfig(config);

  const sections = extractSections(body);

  return { config: config as HarnessConfig, sections };
}

// ── Validation ─────────────────────────────────────────────────

function validateConfig(config: Partial<HarnessConfig>): asserts config is HarnessConfig {
  const missing: string[] = [];

  if (typeof config.name !== 'string' || !config.name.trim()) missing.push('name');
  if (typeof config.platform !== 'string' || !config.platform.trim()) missing.push('platform');
  if (typeof config.model?.local !== 'string' || !config.model.local.trim()) missing.push('model.local');
  if (typeof config.model?.fallback !== 'string' || !config.model.fallback.trim()) missing.push('model.fallback');
  if (!config.personality || typeof config.personality !== 'object' || Object.keys(config.personality).length === 0) {
    missing.push('personality');
  }

  if (missing.length > 0) {
    throw new Error(`Harness missing required fields: ${missing.join(', ')}`);
  }

  // Validate name is safe for filesystem use (no path separators, null bytes, control chars)
  if (/[\/\\:\x00-\x1f]/.test(config.name!) || config.name === '.' || config.name === '..') {
    throw new Error(`Invalid agent name: "${config.name}" — must not contain path separators or control characters`);
  }

  // Validate personality keys are identifiers and values are numbers
  for (const [key, value] of Object.entries(config.personality!)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(key)) {
      throw new Error(`Invalid personality key: "${key}" — must be alphanumeric identifier`);
    }
    if (typeof value !== 'number' || !isFinite(value)) {
      throw new Error(`Personality value for "${key}" must be a finite number, got: ${value}`);
    }
  }

  // Sanitize creator — strip newlines and markdown structural characters
  if (config.creator && typeof config.creator === 'string') {
    config.creator = config.creator.replace(/[\n\r]/g, ' ').replace(/^#+\s/g, '').trim();
  }

  // Defaults
  if (!config.vouch) {
    config.vouch = { minScore: 200, trustedTools: {} };
  }
  if (!config.channels) {
    config.channels = {};
  }
  if (!config.creator) {
    config.creator = '';
  }
}

// ── Section extraction ─────────────────────────────────────────

function extractSections(body: string): HarnessSections {
  const sections: HarnessSections = {
    identity: '',
    knowledgeBase: '',
    engagementRules: '',
    topicPriorities: '',
    postingCadence: '',
    voice: '',
    cDFilter: '',
    autonomy: '',
    securityProtocol: '',
    successMetrics: '',
    raw: body,
  };

  // Split on ## headings — keeps heading text with its content
  const parts = body.split(/^## /m);

  for (const part of parts) {
    if (!part.trim()) continue;

    const newlineIdx = part.indexOf('\n');
    if (newlineIdx === -1) continue;

    const heading = part.slice(0, newlineIdx).trim().toLowerCase();
    const content = part.slice(newlineIdx + 1).trim();

    const field = SECTION_MAP[heading];
    if (field && field !== 'raw') {
      sections[field] = content;
    }
  }

  return sections;
}
