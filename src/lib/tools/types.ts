/**
 * Tool System Types
 *
 * Defines the contract for tool handlers and their results.
 * Tools are gated by autonomy level — an agent can only use
 * tools at or below its granted autonomy.
 */

import type { ToolDefinition } from '../providers/types';
import type { AutonomyLevel } from '../team-types';

export interface ToolHandler {
  definition: ToolDefinition;
  requiredAutonomy: AutonomyLevel;
  execute(input: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolResult {
  content: string;
  is_error?: boolean;
}
