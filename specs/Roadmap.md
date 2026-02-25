# Engram Roadmap

## Shipped

### v0.2.0 — Desktop Beta (macOS)
- Chat engine with streaming (Anthropic, OpenAI, Ollama providers)
- First-run setup wizard (identity → personality → provider → model → chat)
- Conversation persistence (`~/.engram/conversations/`)
- System prompt assembly from infrastructure files
- macOS .app bundle + .dmg installer (unsigned, Gatekeeper bypass)
- Website download button with platform detection
- All existing commands preserved (init, bundle, serve, skill, package)

---

## Next

### Cross-Platform Loaders
**Goal:** Engram runs on any hardware a Domain Translator actually owns.

#### Windows Loader
- `bun build --compile --target=bun-windows-x64` produces .exe
- Wrap in installer (NSIS or WiX) or ship as portable .exe
- Launcher opens Windows Terminal / PowerShell (equivalent of macOS `osascript` → Terminal.app)
- Test on Windows 10/11, both x64 and ARM (Surface)

#### Chromebook / Linux Loader
- `bun build --compile --target=bun-linux-x64` + `bun-linux-arm64`
- Package as .deb and/or AppImage for broad compatibility
- Chromebook path: requires Linux (Crostini) container — document setup steps
- Minimal resource footprint — Engram itself is lightweight, constraint is the LLM provider
- Consider: one-line install script (`curl -fsSL ... | bash`) as alternative to .deb

#### Prioritization
- Windows first (larger Domain Translator audience — nurses, teachers, accountants on work PCs)
- Chromebook/Linux second (budget hardware, education market)
- Both depend on macOS beta feedback to validate the wizard + chat flow before porting

---

### Hardware-Aware Model Recommendations
**Goal:** During setup, recommend the best provider + model based on what the user's machine can actually handle.

#### Detection
- RAM (total + available) — determines local model feasibility
- CPU architecture (x64, ARM) — affects Ollama model compatibility
- GPU presence — CUDA (Nvidia), Metal (Apple), none (CPU-only)
- OS + version — determines which providers/features are available
- Network connectivity — offline users need local models

#### Recommendation Logic
```
IF has GPU + ≥16GB RAM → "You can run models locally with Ollama (free, private)"
  Suggest: llama3.2 (8B), mistral (7B), or phi-3 (3.8B)

IF has GPU + ≥32GB RAM → also suggest larger models
  Suggest: llama3.1 (70B Q4), deepseek-coder-v2

IF CPU-only + ≥8GB RAM → small local models possible
  Suggest: phi-3-mini (3.8B), tinyllama
  Warn: "Responses will be slower without GPU"

IF <8GB RAM (Chromebook, old laptop) → cloud providers only
  Suggest: Anthropic (Claude) or OpenAI (GPT-4o-mini for budget)
  Note: "Your hardware is best paired with a cloud AI — fast, no local resources needed"

IF no internet → local model required
  Check if hardware supports it, guide through Ollama setup
```

#### UX Integration
- Runs automatically during `engram setup` wizard, before provider selection
- Shows a brief hardware summary: "Your machine: 8GB RAM, Apple M1, macOS 14"
- Presents 1-2 recommended paths with reasoning
- User can always override — recommendations are suggestions, not restrictions
- Save hardware profile to config for future reference

#### Cost Awareness
- For cloud providers, surface approximate cost context:
  - "Anthropic Claude Haiku: ~$0.25/million input tokens (very affordable for chat)"
  - "OpenAI GPT-4o: ~$2.50/million input tokens"
  - "Ollama: free (runs on your machine)"
- Not exact pricing (changes frequently) — directional guidance only

---

### Agent Village + Smart Model Router
**Goal:** Visual agent management + intelligent cost-saving model selection — the foundation of Engram's paid hosting tier.

#### Agent Village (Paid Tier: Hosted Pro)
- 2D isometric pixel art village (Stardew Valley aesthetic) where AI agents live and work
- 5 zones mapping to problem types: Observatory (reasoning), Workshop (effort), Town Square (coordination), Library (domain), Garden (ambiguity)
- Agents walk between zones based on task assignments and router decisions
- Real-time SSE events from agent execution drive all movement and state
- Sims-style status bars: health (decays on failures), energy (decays on tasks), focus (increases in same zone)
- Click-to-inspect panel showing zone, model, task, and status per agent
- Model badges: gold (Opus), silver (Sonnet), bronze (Haiku)

#### Smart Model Router (Paid Tier: Hosted Basic+)
- Keyword-based problem type classification (zero latency, zero cost, deterministic)
- Budget-aware model selection: primary models at 0-60% budget, fallback at 60-80%, cheapest at 80-100%
- Saves 5-7x on token costs by routing ~80% of effort tasks to cheap models
- Transparent — village shows which model each agent is using and why
- Future: LLM-assisted classification for ambiguous tasks, user feedback loop for classification accuracy

#### Phased Delivery
1. Village prototype with mock events + router with keyword classification
2. End-to-end integration: router events drive village agent behavior
3. Status bars, inspect panel, health metrics
4. Loadout screen (agent configuration UI)
5. Build loop (village auto-expands with capabilities)

See `docs/ideas/agent-village-concept.md` for full design rationale and competitive analysis.

---

## Future

### Tool Use / Function Calling
- Let the AI execute actions (file operations, web search, calculations)
- Provider-specific tool calling APIs (Anthropic tool_use, OpenAI functions)
- Permission system — user approves tool categories

### Skill Integration in Chat
- Load installed skills into system prompt
- Slash commands in chat trigger skill workflows (`/research`, `/reflect`)
- Skill marketplace — install community skills

### Memory Persistence Across Conversations
- Automatic extraction of key learnings (Reflect skill integration)
- Memory files updated after each session
- Configurable: what to remember, what to forget

### MCP Server Mode
- `engram serve` already exists for Claude Desktop
- Extend to work with chat mode — tools exposed to the AI during conversation

### Multi-Model Conversations
- Switch models mid-conversation (`/model claude-haiku` → `/model gpt-4o`)
- Use cheap models for simple questions, expensive for complex ones
- Automatic routing based on query complexity (future)
