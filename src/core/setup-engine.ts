/**
 * Engram Setup Engine
 *
 * Programmatic setup — no inquirer prompts, no terminal interaction.
 * Desktop app wizard calls these methods and controls the UI itself.
 */

import { saveConfig, getEngramHome, type EngramConfig } from '../lib/config';
import { listProviders, getProvider } from '../lib/providers/index';
import type { Model } from '../lib/providers/types';
import { renderConstitutionMd, renderContextMd, type InitConfig } from '../lib/templates';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type {
  SetupAnswers,
  SetupResult,
  ValidationResult,
  PrerequisiteCheck,
  InstallEvent,
  PersonalityConfig,
} from './types';

export class SetupEngine {
  /**
   * List available providers for the wizard to display.
   */
  getProviders(): Array<{ id: string; name: string; requiresApiKey: boolean }> {
    return listProviders().map(p => ({
      id: p.id,
      name: p.name,
      requiresApiKey: p.requiresApiKey,
    }));
  }

  /**
   * Validate a provider's API key or connection.
   */
  async validateProvider(id: string, apiKey?: string): Promise<ValidationResult> {
    try {
      const provider = getProvider(id);
      const valid = await provider.validateKey(apiKey ?? '');
      return {
        valid,
        message: valid
          ? 'Connected successfully'
          : provider.requiresApiKey
            ? 'Invalid API key'
            : 'Provider not reachable',
      };
    } catch (err) {
      return {
        valid: false,
        message: err instanceof Error ? err.message : 'Validation failed',
      };
    }
  }

  /**
   * List available models for a provider.
   */
  async listModels(providerId: string, apiKey?: string): Promise<Model[]> {
    const provider = getProvider(providerId);
    return provider.listModels(apiKey);
  }

  /**
   * Complete setup with all answers collected by the wizard.
   * Creates config, infrastructure files, and returns result.
   */
  async completeSetup(answers: SetupAnswers): Promise<SetupResult> {
    try {
      // Build config
      const config: EngramConfig = {
        version: 1,
        userName: answers.userName,
        aiName: answers.aiName,
        timezone: answers.timezone,
        personality: answers.personality,
        provider: {
          id: answers.provider.id,
          apiKey: answers.provider.apiKey,
          model: answers.provider.model,
          ...(answers.provider.baseUrl ? { baseUrl: answers.provider.baseUrl } : {}),
        },
      };

      // If using Gateway, configure the provider to point to it
      if (answers.gatewayToken) {
        config.provider.id = 'percival';
        config.provider.apiKey = answers.gatewayToken;
        config.provider.baseUrl = 'https://gateway.percival-labs.ai/auto/v1';
      }

      // Save config
      saveConfig(config);

      // Create infrastructure
      const home = getEngramHome();
      mkdirSync(join(home, 'memory'), { recursive: true });
      mkdirSync(join(home, 'conversations'), { recursive: true });

      const initConfig: InitConfig = {
        aiName: answers.aiName,
        userName: answers.userName,
        timezone: answers.timezone,
        personality: answers.personality,
      };

      const constitutionPath = join(home, 'constitution.md');
      if (!existsSync(constitutionPath)) {
        writeFileSync(constitutionPath, renderConstitutionMd(initConfig));
      }

      const contextPath = join(home, 'context.md');
      if (!existsSync(contextPath)) {
        writeFileSync(contextPath, renderContextMd(initConfig));
      }

      return {
        success: true,
        configPath: join(home, 'config.json'),
        message: 'Setup complete',
      };
    } catch (err) {
      return {
        success: false,
        configPath: '',
        message: err instanceof Error ? err.message : 'Setup failed',
      };
    }
  }

  /**
   * Check system prerequisites.
   */
  async checkPrerequisites(): Promise<PrerequisiteCheck[]> {
    const checks: PrerequisiteCheck[] = [];

    // Node.js
    checks.push({
      name: 'Node.js',
      installed: true, // If we're running, Node exists
      version: process.version,
      required: '>=20.0.0',
    });

    // Engram CLI
    const { existsSync: exists } = await import('fs');
    const { getEngramHome } = await import('../lib/config');
    checks.push({
      name: 'Engram Config',
      installed: exists(join(getEngramHome(), 'config.json')),
    });

    return checks;
  }

  /**
   * Map 3 simplified sliders (casual-professional, brief-detailed, serious-playful)
   * to the full 7-trait personality config.
   */
  static mapSimplifiedPersonality(sliders: {
    formality: number;   // 0=casual, 100=professional
    detail: number;      // 0=brief, 100=detailed
    tone: number;        // 0=serious, 100=playful
  }): PersonalityConfig {
    return {
      humor: Math.round(sliders.tone * 0.7),           // playful → humorous
      excitement: Math.round(50 + (sliders.tone - 50) * 0.4),  // slight correlation
      curiosity: Math.round(50 + sliders.detail * 0.3), // detailed → curious
      precision: Math.round(40 + sliders.detail * 0.5), // detailed → precise
      professionalism: sliders.formality,
      directness: Math.round(80 - sliders.detail * 0.3), // brief → direct
      playfulness: sliders.tone,
    };
  }
}
