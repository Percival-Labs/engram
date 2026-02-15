#!/usr/bin/env node
/**
 * GreetingHook.hook.ts - Simple Session Greeting (SessionStart)
 *
 * PURPOSE:
 * Displays a simple greeting at session start with the configured
 * AI assistant name and user name from settings.json.
 *
 * TRIGGER: SessionStart
 *
 * OUTPUT:
 * - stdout: Greeting message
 * - exit(0): Always
 */

import { readFileSync, existsSync } from 'fs';
import { getEngramDir, getSettingsPath } from './lib/paths';

try {
  const settingsPath = getSettingsPath();
  if (!existsSync(settingsPath)) {
    console.log('AI Infrastructure ready.');
    process.exit(0);
  }

  const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  const aiName = settings.daidentity?.name || 'Assistant';
  const userName = settings.principal?.name || 'there';

  console.log(`${aiName} ready. Hello, ${userName}.`);
  process.exit(0);
} catch {
  console.log('AI Infrastructure ready.');
  process.exit(0);
}
