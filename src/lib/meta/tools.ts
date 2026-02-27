/**
 * Meta-Agent Tools
 *
 * Special tools that let the meta-agent create team and chain configurations.
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';
import { getEngramHome } from '../config';
import type { ToolHandler, ToolResult } from '../tools/types';
import type { ToolRegistry } from '../tools/registry';
import { critiqueConfig } from './critic';

const createTeamConfigTool: ToolHandler = {
  definition: {
    name: 'create_team_config',
    description: 'Create a team YAML configuration file with roles, tools, and orchestration settings',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Team identifier (lowercase, hyphens ok)',
        },
        config: {
          type: 'object',
          description: 'Full team config object with name, roles, and orchestrator',
        },
      },
      required: ['name', 'config'],
    },
  },
  requiredAutonomy: 'ACT_SAFE',
  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const name = String(input.name);
    const config = input.config as Record<string, unknown>;

    // Validate via critic
    const critique = critiqueConfig(config, 'team');
    if (!critique.valid) {
      return {
        content: `Validation failed:\n${critique.issues.join('\n')}`,
        is_error: true,
      };
    }

    // Write YAML
    const teamDir = join(getEngramHome(), 'teams', name);
    mkdirSync(teamDir, { recursive: true });
    const yamlPath = join(teamDir, 'team.yaml');
    writeFileSync(yamlPath, YAML.stringify(config));

    let result = `Team config created: ${yamlPath}`;
    if (critique.warnings.length > 0) {
      result += `\n\nWarnings:\n${critique.warnings.join('\n')}`;
    }
    return { content: result };
  },
};

const createChainConfigTool: ToolHandler = {
  definition: {
    name: 'create_chain_config',
    description: 'Create a chain YAML configuration file with sequential steps',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Chain identifier (lowercase, hyphens ok)',
        },
        config: {
          type: 'object',
          description: 'Full chain config object with name and steps',
        },
      },
      required: ['name', 'config'],
    },
  },
  requiredAutonomy: 'ACT_SAFE',
  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const name = String(input.name);
    const config = input.config as Record<string, unknown>;

    // Validate via critic
    const critique = critiqueConfig(config, 'chain');
    if (!critique.valid) {
      return {
        content: `Validation failed:\n${critique.issues.join('\n')}`,
        is_error: true,
      };
    }

    // Write YAML
    const chainsDir = join(getEngramHome(), 'chains');
    mkdirSync(chainsDir, { recursive: true });
    const yamlPath = join(chainsDir, `${name}.yaml`);
    writeFileSync(yamlPath, YAML.stringify(config));

    let result = `Chain config created: ${yamlPath}`;
    if (critique.warnings.length > 0) {
      result += `\n\nWarnings:\n${critique.warnings.join('\n')}`;
    }
    return { content: result };
  },
};

const listExistingConfigsTool: ToolHandler = {
  definition: {
    name: 'list_existing_configs',
    description: 'List existing team and chain configurations',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['teams', 'chains', 'all'],
          description: 'Which configs to list (default: all)',
        },
      },
    },
  },
  requiredAutonomy: 'OBSERVE',
  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const type = String(input.type ?? 'all');
    const parts: string[] = [];

    if (type === 'teams' || type === 'all') {
      const teamsDir = join(getEngramHome(), 'teams');
      const teams: string[] = [];
      if (existsSync(teamsDir)) {
        for (const entry of readdirSync(teamsDir)) {
          const teamYaml = join(teamsDir, entry, 'team.yaml');
          try {
            if (statSync(join(teamsDir, entry)).isDirectory() && existsSync(teamYaml)) {
              teams.push(entry);
            }
          } catch { /* skip */ }
        }
      }
      parts.push(`Teams: ${teams.length > 0 ? teams.join(', ') : '(none)'}`);
    }

    if (type === 'chains' || type === 'all') {
      const chainsDir = join(getEngramHome(), 'chains');
      const chains: string[] = [];
      if (existsSync(chainsDir)) {
        for (const entry of readdirSync(chainsDir)) {
          if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
            chains.push(entry.replace(/\.ya?ml$/, ''));
          }
        }
      }
      parts.push(`Chains: ${chains.length > 0 ? chains.join(', ') : '(none)'}`);
    }

    return { content: parts.join('\n') };
  },
};

export function registerMetaTools(registry: ToolRegistry): void {
  registry.register(createTeamConfigTool);
  registry.register(createChainConfigTool);
  registry.register(listExistingConfigsTool);
}
