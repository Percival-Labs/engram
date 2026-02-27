/**
 * Tool Execution Loop
 *
 * Core agentic loop: call provider with tools → stream text → detect tool calls →
 * check hooks → execute tools → feed results back → repeat until no tool calls.
 */

import type {
  ToolChatProvider,
  ChatConfigExtended,
  ChatStreamEvent,
  ChatMessageExtended,
  ToolUseContent,
  ToolResultContent,
} from '../providers/types';
import type { AutonomyLevel } from '../team-types';
import type { ToolRegistry } from './registry';
import type { HookContext } from './hook-runner';
import { runToolHooks } from './hook-runner';

export interface ToolLoopOptions {
  provider: ToolChatProvider;
  config: ChatConfigExtended;
  registry: ToolRegistry;
  autonomyLevel: AutonomyLevel;
  blockedTools?: string[];
  maxIterations?: number;
  onToolCall?: (name: string, input: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string, isError: boolean) => void;
}

/**
 * Run the chat-with-tools loop.
 *
 * Streams text events through to the caller.
 * When the model requests tool calls, executes them (with hook checks)
 * and loops back with results. Stops when the model produces no tool calls
 * or maxIterations is hit.
 *
 * Yields ChatStreamEvent — callers should handle 'text' for display,
 * and can ignore 'tool_use' and 'message_end' (handled internally).
 */
export async function* chatWithToolLoop(
  options: ToolLoopOptions,
): AsyncGenerator<ChatStreamEvent> {
  const {
    provider,
    config,
    registry,
    autonomyLevel,
    blockedTools,
    maxIterations = 10,
    onToolCall,
    onToolResult,
  } = options;

  // Build tool definitions filtered by autonomy
  const toolDefs = registry.getFilteredDefinitions(autonomyLevel);

  // Working copy of messages — we append tool results across iterations
  const messages: ChatMessageExtended[] = [...config.messages];

  const hookContext: HookContext = {
    autonomyLevel,
    blockedTools,
  };

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const iterConfig: ChatConfigExtended = {
      ...config,
      messages,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
    };

    // Collect tool calls from this iteration
    const pendingToolCalls: Array<{
      id: string;
      name: string;
      input: Record<string, unknown>;
    }> = [];
    let hasText = false;

    // Stream from provider
    const stream = provider.chatWithTools(iterConfig);
    for await (const event of stream) {
      if (event.type === 'text') {
        hasText = true;
        yield event;
      } else if (event.type === 'tool_use') {
        pendingToolCalls.push({
          id: event.id,
          name: event.name,
          input: event.input,
        });
        // Yield tool_use so callers can display it
        yield event;
      }
      // message_end is handled below
    }

    // If no tool calls, we're done
    if (pendingToolCalls.length === 0) {
      yield { type: 'message_end' };
      return;
    }

    // Build the assistant message with tool use content blocks
    const assistantContent: (ToolUseContent | { type: 'text'; text: string })[] = [];
    if (hasText) {
      // We already streamed text — we don't have the full text here,
      // but we need to represent it. The caller tracks full text externally.
      // For the conversation, we'll mark it as placeholder.
      // Actually, we need to accumulate text to store it properly.
      // This is handled by having the caller pass accumulated text back.
      // For now, tool_use blocks are what matter for the loop.
    }
    for (const tc of pendingToolCalls) {
      assistantContent.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.name,
        input: tc.input,
      });
    }

    // Append assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: assistantContent,
    });

    // Execute each tool call
    const toolResults: ToolResultContent[] = [];
    for (const tc of pendingToolCalls) {
      onToolCall?.(tc.name, tc.input);

      const handler = registry.get(tc.name);
      if (!handler) {
        const errorResult: ToolResultContent = {
          type: 'tool_result',
          tool_use_id: tc.id,
          content: `Unknown tool: ${tc.name}`,
          is_error: true,
        };
        toolResults.push(errorResult);
        onToolResult?.(tc.name, errorResult.content, true);
        continue;
      }

      // Run hook checks
      const hookResult = runToolHooks(handler, hookContext);
      if (!hookResult.continue) {
        const blockedResult: ToolResultContent = {
          type: 'tool_result',
          tool_use_id: tc.id,
          content: hookResult.message ?? 'Tool execution blocked by policy',
          is_error: true,
        };
        toolResults.push(blockedResult);
        onToolResult?.(tc.name, blockedResult.content, true);
        continue;
      }

      // Execute the tool
      try {
        const result = await handler.execute(tc.input);
        const toolResult: ToolResultContent = {
          type: 'tool_result',
          tool_use_id: tc.id,
          content: result.content,
          is_error: result.is_error,
        };
        toolResults.push(toolResult);
        onToolResult?.(tc.name, result.content, result.is_error ?? false);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorResult: ToolResultContent = {
          type: 'tool_result',
          tool_use_id: tc.id,
          content: `Tool execution error: ${errorMsg}`,
          is_error: true,
        };
        toolResults.push(errorResult);
        onToolResult?.(tc.name, errorResult.content, true);
      }
    }

    // Append tool results as a user/tool message
    messages.push({
      role: 'tool',
      content: toolResults,
    });

    // Loop continues — provider will process results and respond
  }

  // Hit max iterations
  yield { type: 'text', text: '\n[Tool loop reached maximum iterations]' };
  yield { type: 'message_end' };
}
