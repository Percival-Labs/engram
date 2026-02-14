#!/usr/bin/env bun
/**
 * Centralized Path Resolution
 *
 * Handles environment variable expansion for portable framework configuration.
 * Claude Code doesn't expand $HOME in settings.json env values, so we do it here.
 *
 * Usage:
 *   import { getEngramDir, getSettingsPath } from './lib/paths';
 *   const frameworkDir = getEngramDir(); // Always returns expanded absolute path
 */

import { homedir } from 'os';
import { join } from 'path';

/**
 * Expand shell variables in a path string
 * Supports: $HOME, ${HOME}, ~
 */
export function expandPath(path: string): string {
  const home = homedir();

  return path
    .replace(/^\$HOME(?=\/|$)/, home)
    .replace(/^\$\{HOME\}(?=\/|$)/, home)
    .replace(/^~(?=\/|$)/, home);
}

/**
 * Get the framework directory (expanded)
 * Priority: ENGRAM_DIR env var (expanded) -> ~/.claude
 */
export function getEngramDir(): string {
  const envDir = process.env.ENGRAM_DIR || process.env.PAI_DIR;

  if (envDir) {
    return expandPath(envDir);
  }

  return join(homedir(), '.claude');
}

/**
 * Get the settings.json path
 */
export function getSettingsPath(): string {
  return join(getEngramDir(), 'settings.json');
}

/**
 * Get a path relative to the framework directory
 */
export function engramPath(...segments: string[]): string {
  return join(getEngramDir(), ...segments);
}

/**
 * Get the hooks directory
 */
export function getHooksDir(): string {
  return engramPath('hooks');
}

/**
 * Get the skills directory
 */
export function getSkillsDir(): string {
  return engramPath('skills');
}

/**
 * Get the MEMORY directory
 */
export function getMemoryDir(): string {
  return engramPath('MEMORY');
}
