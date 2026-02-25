import { select, input, password, confirm } from '@inquirer/prompts';
import { saveConfig, getEngramHome, type EngramConfig } from '../lib/config';
import { listProviders, getProvider } from '../lib/providers/index';
import type { Model } from '../lib/providers/types';
import {
  askAIName,
  askUserName,
  askTimezone,
  askPersonalitySlider,
} from '../lib/prompts';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { renderConstitutionMd, renderContextMd, type InitConfig } from '../lib/templates';

export async function setup(): Promise<void> {
  // ── Identity ────────────────────────────────────────────────
  const userName = await askUserName();
  const aiName = await askAIName();
  const timezone = await askTimezone();

  // ── Personality ─────────────────────────────────────────────
  console.log('');
  console.log('  Personality calibration (0-100 for each trait):');
  console.log('');

  const humor = await askPersonalitySlider('Humor', '0=dry, 100=witty', 50);
  const excitement = await askPersonalitySlider('Excitement', '0=reserved, 100=enthusiastic', 50);
  const curiosity = await askPersonalitySlider('Curiosity', '0=focused, 100=exploratory', 70);
  const precision = await askPersonalitySlider('Precision', '0=approximate, 100=exact', 80);
  const professionalism = await askPersonalitySlider('Professionalism', '0=casual, 100=formal', 60);
  const directness = await askPersonalitySlider('Directness', '0=diplomatic, 100=blunt', 70);
  const playfulness = await askPersonalitySlider('Playfulness', '0=serious, 100=playful', 50);

  const personality = { humor, excitement, curiosity, precision, professionalism, directness, playfulness };

  // ── Provider ────────────────────────────────────────────────
  console.log('');

  const providers = listProviders();
  const providerId = await select({
    message: 'Which AI provider?',
    choices: providers.map(p => ({
      name: `${p.name}${p.requiresApiKey ? '' : ' (no API key needed)'}`,
      value: p.id,
    })),
  });

  const provider = getProvider(providerId);
  let apiKey: string | undefined;

  // API key input with validation
  if (provider.requiresApiKey) {
    let valid = false;
    while (!valid) {
      apiKey = await password({
        message: `${provider.name} API key:`,
        mask: '*',
      });

      if (!apiKey.trim()) {
        console.log('  \x1b[33mAPI key cannot be empty.\x1b[0m');
        continue;
      }

      process.stdout.write('  Validating key... ');
      valid = await provider.validateKey(apiKey);

      if (valid) {
        console.log('\x1b[32mValid!\x1b[0m');
      } else {
        console.log('\x1b[31mInvalid key. Please try again.\x1b[0m');
      }
    }
  } else {
    // For Ollama — check if it's running
    process.stdout.write('  Checking connection... ');
    const running = await provider.validateKey('');

    if (running) {
      console.log('\x1b[32mConnected!\x1b[0m');
    } else {
      console.log('\x1b[33mNot detected.\x1b[0m');
      console.log('  \x1b[90mMake sure Ollama is running: ollama serve\x1b[0m');
      console.log('  \x1b[90mYou can still complete setup and connect later.\x1b[0m');
    }
  }

  // ── Model selection ─────────────────────────────────────────
  console.log('');
  process.stdout.write('  Loading models... ');
  const models = await provider.listModels(apiKey);
  console.log('done.');

  let modelId: string;

  if (models.length === 0) {
    console.log('  \x1b[33mNo models found.\x1b[0m');
    modelId = await input({
      message: 'Enter model name manually:',
      default: providerId === 'ollama' ? 'llama3.2' : 'gpt-4o',
    });
  } else {
    modelId = await select({
      message: 'Which model?',
      choices: models.map(m => ({
        name: m.name,
        value: m.id,
      })),
    });
  }

  // ── Save config ─────────────────────────────────────────────
  const config: EngramConfig = {
    version: 1,
    userName,
    aiName,
    timezone,
    personality,
    provider: {
      id: providerId,
      apiKey,
      model: modelId,
      ...(provider.defaultBaseUrl !== getProvider(providerId).defaultBaseUrl
        ? { baseUrl: provider.defaultBaseUrl }
        : {}),
    },
  };

  saveConfig(config);

  // ── Create infrastructure files ─────────────────────────────
  const home = getEngramHome();
  mkdirSync(join(home, 'memory'), { recursive: true });
  mkdirSync(join(home, 'conversations'), { recursive: true });

  const initConfig: InitConfig = { aiName, userName, timezone, personality };

  // Write constitution and context if they don't exist
  const constitutionPath = join(home, 'constitution.md');
  if (!existsSync(constitutionPath)) {
    writeFileSync(constitutionPath, renderConstitutionMd(initConfig));
  }

  const contextPath = join(home, 'context.md');
  if (!existsSync(contextPath)) {
    writeFileSync(contextPath, renderContextMd(initConfig));
  }

  // ── Also set up Claude Code? ────────────────────────────────
  console.log('');
  const setupClaudeCode = await confirm({
    message: 'Also set up Claude Code infrastructure (~/.claude/)?',
    default: false,
  });

  if (setupClaudeCode) {
    // Dynamic import to avoid circular dependency issues
    const { init } = await import('./init');
    console.log('');
    await init();
  }

  // ── Done ────────────────────────────────────────────────────
  console.log('');
  console.log(`  \x1b[32m\x1b[1mSetup complete!\x1b[0m`);
  console.log(`  \x1b[90mConfig saved to ~/.engram/config.json\x1b[0m`);
  console.log('');

  const startChat = await confirm({
    message: `Start chatting with ${aiName} now?`,
    default: true,
  });

  if (startChat) {
    // Import and run chat directly
    const { chat: startChatSession } = await import('./chat');
    await startChatSession();
  }
}
