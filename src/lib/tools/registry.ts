/**
 * Tool Registry
 *
 * Central registry for tool handlers. Supports autonomy-based filtering
 * so agents only see tools they're permitted to use.
 */

import type { ToolDefinition } from '../providers/types';
import type { AutonomyLevel } from '../team-types';
import { AUTONOMY_RANK } from '../team-types';
import type { ToolHandler } from './types';

export class ToolRegistry {
  private handlers = new Map<string, ToolHandler>();

  /** Register a tool handler. Overwrites any existing handler with the same name. */
  register(handler: ToolHandler): void {
    this.handlers.set(handler.definition.name, handler);
  }

  /** Look up a tool handler by name. */
  get(name: string): ToolHandler | undefined {
    return this.handlers.get(name);
  }

  /** Return all registered tool definitions. */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.handlers.values()).map((h) => h.definition);
  }

  /**
   * Return only tool handlers accessible at the given autonomy level.
   * A tool is accessible when its requiredAutonomy rank <= the given level's rank.
   */
  filterByAutonomy(level: AutonomyLevel): ToolHandler[] {
    const ceiling = AUTONOMY_RANK[level];
    return Array.from(this.handlers.values()).filter(
      (h) => AUTONOMY_RANK[h.requiredAutonomy] <= ceiling,
    );
  }

  /** Return definitions only for tools accessible at the given autonomy level. */
  getFilteredDefinitions(level: AutonomyLevel): ToolDefinition[] {
    return this.filterByAutonomy(level).map((h) => h.definition);
  }
}
