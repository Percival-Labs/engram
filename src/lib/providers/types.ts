export interface Model {
  id: string;
  name: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatConfig {
  model: string;
  messages: ChatMessage[];
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
}

export interface ChatProvider {
  id: string;
  name: string;
  requiresApiKey: boolean;
  defaultBaseUrl: string;
  validateKey(apiKey: string): Promise<boolean>;
  listModels(apiKey?: string): Promise<Model[]>;
  chat(config: ChatConfig): AsyncGenerator<string>;
}

// ── Tool Use Types ───────────────────────────────────────────────

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextContent | ToolUseContent | ToolResultContent;

export interface ChatMessageExtended {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type ChatStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'message_end' };

export interface ChatConfigExtended extends Omit<ChatConfig, 'messages'> {
  messages: ChatMessageExtended[];
  tools?: ToolDefinition[];
}

export interface ToolChatProvider extends ChatProvider {
  chatWithTools(config: ChatConfigExtended): AsyncGenerator<ChatStreamEvent>;
}
