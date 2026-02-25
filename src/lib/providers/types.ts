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
