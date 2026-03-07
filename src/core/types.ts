/**
 * Engram Core Types
 *
 * Structured event types for the headless engine.
 * Both CLI and Desktop consume these — no terminal assumptions.
 */

import type { EngramConfig } from '../lib/config';

// ── Engine Events (streaming output) ─────────────────────────────

export type EngineEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; output: string; isError: boolean }
  | { type: 'routing_info'; model: string; provider: string; cost?: number }
  | { type: 'error'; message: string }
  | { type: 'done'; fullResponse: string };

// ── Command Results ──────────────────────────────────────────────

export interface CommandResult {
  action: 'quit' | 'new' | 'info' | 'error';
  message?: string;
  data?: unknown;
}

// ── Setup Types ──────────────────────────────────────────────────

export interface PersonalityConfig {
  humor: number;
  excitement: number;
  curiosity: number;
  precision: number;
  professionalism: number;
  directness: number;
  playfulness: number;
}

export interface SetupAnswers {
  userName: string;
  aiName: string;
  timezone: string;
  personality: PersonalityConfig;
  provider: {
    id: string;
    apiKey?: string;
    model: string;
    baseUrl?: string;
  };
  gatewayToken?: string;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export interface SetupResult {
  success: boolean;
  configPath: string;
  message?: string;
}

export interface PrerequisiteCheck {
  name: string;
  installed: boolean;
  version?: string;
  required?: string;
}

export type InstallEvent =
  | { type: 'progress'; step: string; message: string }
  | { type: 'complete'; step: string }
  | { type: 'error'; step: string; message: string };

// ── Credit Types ─────────────────────────────────────────────────

export interface CreditBalance {
  balanceSats: number;
  lifetimeDepositedSats: number;
  lifetimeSpentSats: number;
  dailyLimitSats?: number;
  weeklyLimitSats?: number;
  monthlyLimitSats?: number;
}

// ── Conversation Types ───────────────────────────────────────────

export interface ConversationInfo {
  id: string;
  provider: string;
  model: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Engine Config (subset of EngramConfig for engine consumers) ──

export interface EngineConfig {
  userName: string;
  aiName: string;
  timezone: string;
  personality: PersonalityConfig;
  provider: {
    id: string;
    apiKey?: string;
    model: string;
    baseUrl?: string;
  };
  routing?: {
    enabled?: boolean;
    strategy?: string;
    openrouterApiKey?: string;
  };
  autonomyLevel?: string;
}
