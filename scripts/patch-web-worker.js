#!/usr/bin/env node
// Patches web-worker module for Bun compatibility.
// Bun's worker threads crash on dispatchEvent with non-native Event objects.
// This wraps the error handler in a try/catch to prevent crashes.
//
// Run automatically via postinstall or manually after `bun install`.

const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, '..', 'node_modules', 'web-worker', 'cjs', 'node.js'),
  path.join(__dirname, '..', 'node_modules', 'web-worker', 'node.js'),
];

const ORIGINAL = `threads.parentPort.on('error', err => {
    err.type = 'Error';
    self.dispatchEvent(err);
  });`;

const PATCHED = `threads.parentPort.on('error', err => {
    try {
      const event = new Event('error');
      event.error = err;
      event.message = err.message;
      self.dispatchEvent(event);
    } catch (_) {
      // Bun worker thread compat: dispatchEvent may reject non-native Event instances
    }
  });`;

// ESM variant (tabs instead of spaces)
const ORIGINAL_ESM = `\tthreads.parentPort.on('error', err => {
\t\terr.type = 'Error';
\t\tself.dispatchEvent(err);
\t});`;

const PATCHED_ESM = `\tthreads.parentPort.on('error', err => {
\t\ttry {
\t\t\tconst event = new Event('error');
\t\t\tevent.error = err;
\t\t\tevent.message = err.message;
\t\t\tself.dispatchEvent(event);
\t\t} catch (_) {
\t\t\t// Bun worker thread compat: dispatchEvent may reject non-native Event instances
\t\t}
\t});`;

let patched = 0;

for (const file of files) {
  if (!fs.existsSync(file)) continue;

  let content = fs.readFileSync(file, 'utf-8');
  const isESM = file.endsWith('node.js') && !file.includes('cjs');

  if (isESM && content.includes(ORIGINAL_ESM)) {
    content = content.replace(ORIGINAL_ESM, PATCHED_ESM);
    fs.writeFileSync(file, content);
    patched++;
  } else if (!isESM && content.includes(ORIGINAL)) {
    content = content.replace(ORIGINAL, PATCHED);
    fs.writeFileSync(file, content);
    patched++;
  }
}

if (patched > 0) {
  console.log(`  Patched ${patched} web-worker file(s) for Bun compatibility`);
}
