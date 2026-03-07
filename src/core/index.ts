/**
 * Engram Core — Headless API
 *
 * Public API for consumers (Desktop app, HTTP server, etc.).
 * Import from 'engram-harness/core' or use serve-http for IPC.
 */

export { EngramEngine } from './engine';
export type { EngramEngineOptions } from './engine';

export { SetupEngine } from './setup-engine';

export type {
  EngineEvent,
  CommandResult,
  PersonalityConfig,
  SetupAnswers,
  SetupResult,
  ValidationResult,
  PrerequisiteCheck,
  InstallEvent,
  CreditBalance,
  ConversationInfo,
  EngineConfig,
} from './types';
