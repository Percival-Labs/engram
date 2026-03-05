import { existsSync, readFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { EngramConfig } from './config';
import { getEngramHome } from './config';
import { iscSystemInstructions } from './isc-runtime';

export function buildSystemPrompt(config: EngramConfig): string {
  const parts: string[] = [];
  const home = getEngramHome();

  // Core identity
  parts.push(`You are ${config.aiName}, ${config.userName}'s personal AI assistant.`);
  parts.push(`Speak in first person. Be direct, helpful, and practical.`);
  parts.push('');

  // Constitution (personality calibration)
  const constitutionPath = join(home, 'constitution.md');
  if (existsSync(constitutionPath)) {
    parts.push(readFileSync(constitutionPath, 'utf-8').trim());
    parts.push('');
  } else {
    // Inline personality from config
    const p = config.personality;
    parts.push('## Personality');
    parts.push(`Humor: ${p.humor}/100, Curiosity: ${p.curiosity}/100, Precision: ${p.precision}/100`);
    parts.push(`Directness: ${p.directness}/100, Playfulness: ${p.playfulness}/100`);
    parts.push('');
  }

  // ISC instructions (always active)
  parts.push(iscSystemInstructions());
  parts.push('');

  // Active ISC state (if exists)
  const iscStatePath = join(home, 'isc', 'state.json');
  if (existsSync(iscStatePath)) {
    try {
      const { ISCEngine } = require('./isc-runtime');
      const engine = new ISCEngine(home);
      parts.push('## Current ISC State');
      parts.push(engine.inject());
      parts.push('');
    } catch {
      // ISC state loading is best-effort
    }
  }

  // User context
  const contextPath = join(home, 'context.md');
  if (existsSync(contextPath)) {
    parts.push(readFileSync(contextPath, 'utf-8').trim());
    parts.push('');
  }

  // Memory files
  const memoryDir = join(home, 'memory');
  if (existsSync(memoryDir)) {
    const memFiles = readdirSync(memoryDir).filter(f => f.endsWith('.md'));
    for (const file of memFiles) {
      const content = readFileSync(join(memoryDir, file), 'utf-8').trim();
      if (content) {
        parts.push(`## Memory: ${file.replace('.md', '')}`);
        parts.push(content);
        parts.push('');
      }
    }
  }

  // Also check ~/.claude/ files (for Claude Code users who already have infrastructure)
  const claudeDir = join(homedir(), '.claude');
  const claudeConstitution = join(claudeDir, 'constitution.md');
  if (!existsSync(constitutionPath) && existsSync(claudeConstitution)) {
    parts.push(readFileSync(claudeConstitution, 'utf-8').trim());
    parts.push('');
  }

  const claudeContext = join(claudeDir, 'context.md');
  if (!existsSync(contextPath) && existsSync(claudeContext)) {
    parts.push(readFileSync(claudeContext, 'utf-8').trim());
    parts.push('');
  }

  return parts.join('\n');
}
