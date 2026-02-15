/**
 * Node-compatible replacements for Bun-specific APIs.
 *
 * Bun supports all Node APIs, so these work in both runtimes.
 * This lets hooks run under plain `node` after bundling.
 */

import { execSync } from 'child_process';

/**
 * Read all text from stdin (replaces Bun.stdin.text()).
 * Returns empty string if stdin is a TTY or times out.
 */
export function readStdinText(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }

    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));

    // Timeout fallback — Claude Code hooks should deliver stdin fast
    setTimeout(() => resolve(data), 200);
  });
}

/**
 * Execute a shell command and return stdout (replaces Bun.spawn).
 */
export function execCommand(cmd: string, env?: Record<string, string | undefined>): string {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      env: { ...process.env, ...env },
      timeout: 5000,
    }).trim();
  } catch {
    return '';
  }
}
