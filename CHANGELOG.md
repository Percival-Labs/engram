# Changelog

All notable changes to Engram will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.5] - 2026-03-07

### Added
- Core HTTP library (`src/core/`) — headless `EngramEngine`, `SetupEngine`, and HTTP server with 9 endpoints and SSE streaming
- `serve-http` command — run Engram as an HTTP server for desktop and web integrations
- Shopkeep bot template (`templates/shopkeep/`) — starter template for digital storefront agents
- Package exports field (`./core`) for programmatic use of the core library
- `dev:http` and `build:compile` npm scripts

## [0.2.4] - 2026-03-05

### Added
- ISC runtime engine — Ideal State Criteria as a first-class runtime primitive
- `engram bot init` command with security hardening for scaffolding new bot projects

### Changed
- License changed from MIT to BSL 1.1 (Business Source License), copyright to Percival Labs LLC

## [0.2.3] - 2026-03-04

### Added
- Percival Gateway provider with credits CLI and security hardening
- Type-based clustering and radial zone labels for `engram map`

### Fixed
- Remove all top-level `import.meta.url` reads that crash global install
- Hardcode version to avoid `getFrameworkRoot` crash in global install
- Fix `getVersion` crash when installed globally via npm

## [0.2.0] - 2026-02-28

### Added
- Privacy layer — PII scrubbing, blind tokens, ZK trust proofs
- `engram map` command with RSA-4096 upgrade for privacy layer
- Smart routing layer — 3-layer classifier, cascade executor, provider router
- Agent framework — tool use, teams, chains, meta-agents
- Interactive chat, Docker support, desktop app scaffolding, multi-provider system
- Team and enterprise management layer (Phase 1)

### Security
- ISC framework — Ideal State Criteria across all 5 layers
- ISC-S2 fix — catch-all anti-criteria now block correctly

## [0.1.3] - 2026-02-25

### Added
- `engram export --format openclaw` command for OpenClaw skill export
- Node-compatible hooks — no bun required for end users

### Fixed
- npm bin field and version bump
- CLI shebang and dynamic version from package.json

## [0.1.0] - 2026-02-22

### Added
- Initial release — The AI Harness for Everyone
- CLI with skill authoring, hook system, and bundle generator
- Landing page with in-browser bundle generator

[0.2.5]: https://github.com/Percival-Labs/engram/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/Percival-Labs/engram/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/Percival-Labs/engram/compare/v0.2.0...v0.2.3
[0.2.0]: https://github.com/Percival-Labs/engram/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/Percival-Labs/engram/compare/v0.1.0...v0.1.3
[0.1.0]: https://github.com/Percival-Labs/engram/releases/tag/v0.1.0
