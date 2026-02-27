import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { getEngramHome } from './config';
import type { ChatMessage, ChatMessageExtended } from './providers/types';

export interface Conversation {
  id: string;
  title: string;
  model: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
  messages: (ChatMessage | ChatMessageExtended)[];
}

function getConversationsDir(): string {
  return join(getEngramHome(), 'conversations');
}

export function createConversation(provider: string, model: string): Conversation {
  return {
    id: randomUUID(),
    title: 'New conversation',
    model,
    provider,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };
}

export function saveConversation(conv: Conversation): void {
  const dir = getConversationsDir();
  mkdirSync(dir, { recursive: true });

  // Auto-title from first user message
  if (conv.title === 'New conversation' && conv.messages.length > 0) {
    const firstUser = conv.messages.find(m => m.role === 'user');
    if (firstUser && typeof firstUser.content === 'string') {
      conv.title = firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? '...' : '');
    }
  }

  conv.updatedAt = new Date().toISOString();
  writeFileSync(join(dir, `${conv.id}.json`), JSON.stringify(conv, null, 2));
}

export function listConversations(): Conversation[] {
  const dir = getConversationsDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        return JSON.parse(readFileSync(join(dir, f), 'utf-8')) as Conversation;
      } catch {
        return null;
      }
    })
    .filter((c): c is Conversation => c !== null)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function loadConversation(id: string): Conversation | null {
  const path = join(getConversationsDir(), `${id}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}
