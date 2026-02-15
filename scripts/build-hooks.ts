#!/usr/bin/env bun
/**
 * Build hooks into standalone Node-compatible .mjs files.
 *
 * Each hook gets bundled with all its dependencies (lib/*, yaml package)
 * into a single self-contained file that runs with plain `node`.
 * No bun runtime required at execution time.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';

const HOOKS_DIR = join(import.meta.dir, '..', 'hooks');
const OUT_DIR = join(import.meta.dir, '..', 'dist', 'hooks');
const SHEBANG = '#!/usr/bin/env node\n';

async function main() {
  // Find all hook files
  const hookFiles = readdirSync(HOOKS_DIR).filter(f => f.endsWith('.hook.ts'));

  console.log(`Building ${hookFiles.length} hooks...`);

  mkdirSync(OUT_DIR, { recursive: true });

  for (const hookFile of hookFiles) {
    const entrypoint = join(HOOKS_DIR, hookFile);
    const outName = hookFile.replace('.ts', '.mjs');

    const result = await Bun.build({
      entrypoints: [entrypoint],
      outdir: OUT_DIR,
      target: 'node',
      format: 'esm',
      naming: outName,
      minify: false,
    });

    if (!result.success) {
      console.error(`FAILED: ${hookFile}`);
      for (const log of result.logs) {
        console.error(`  ${log}`);
      }
      process.exit(1);
    }

    // Prepend shebang and make executable
    const outPath = join(OUT_DIR, outName);
    const content = readFileSync(outPath, 'utf-8');

    // Strip any existing shebang from bundle output
    const cleaned = content.replace(/^#!.*\n/, '');
    writeFileSync(outPath, SHEBANG + cleaned);
    chmodSync(outPath, 0o755);

    console.log(`  ${hookFile} → dist/hooks/${outName}`);
  }

  // Also copy the patterns.example.yaml
  const patternsSource = join(HOOKS_DIR, 'patterns.example.yaml');
  try {
    const patternsContent = readFileSync(patternsSource, 'utf-8');
    writeFileSync(join(OUT_DIR, 'patterns.example.yaml'), patternsContent);
    console.log('  patterns.example.yaml → dist/hooks/patterns.example.yaml');
  } catch {
    console.log('  (no patterns.example.yaml to copy)');
  }

  console.log(`\nDone. ${hookFiles.length} hooks built to dist/hooks/`);
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
