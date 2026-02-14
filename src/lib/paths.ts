import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export function getTargetDir(): string {
  return join(homedir(), '.claude');
}

export function getSkillsDir(): string {
  return join(getTargetDir(), 'skills');
}

export function getHooksDir(): string {
  return join(getTargetDir(), 'hooks');
}

export function getMemoryDir(): string {
  return join(getTargetDir(), 'MEMORY');
}

/**
 * Find the framework root directory.
 * Works from both:
 *   - src/lib/paths.ts (dev: __dirname = src/lib, up 2 levels)
 *   - dist/cli.js (bundled: __dirname = dist, up 1 level)
 *
 * Detection: walk upward from __dirname until we find package.json
 */
export function getFrameworkRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  let dir = dirname(__filename);

  // Walk up looking for package.json with our name
  for (let i = 0; i < 5; i++) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      // Verify it's our package (not some parent node_modules)
      try {
        const raw = readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(raw);
        if (pkg.name === 'engram-harness') {
          return dir;
        }
      } catch {
        // JSON parse failed, keep going
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  // Fallback: assume we're in dist/ or src/lib/
  const thisDir = dirname(__filename);
  if (thisDir.endsWith('dist')) {
    return dirname(thisDir);
  }
  // src/lib or src/commands
  return join(thisDir, '..', '..');
}
