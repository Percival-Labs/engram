/**
 * Built-in Tools — Registration
 *
 * Registers all built-in tools with a ToolRegistry instance.
 */

import type { ToolRegistry } from '../registry';
import { readFileTool } from './read-file';
import { writeFileTool } from './write-file';
import { editFileTool } from './edit-file';
import { runCommandTool } from './run-command';

export function registerBuiltins(registry: ToolRegistry): void {
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(editFileTool);
  registry.register(runCommandTool);
}
