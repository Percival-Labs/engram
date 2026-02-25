# Agent Village: Visual Agent Management for Engram

*Idea captured: Feb 22, 2026. Origin: Alan + Ian conversation.*

## The Concept

Two complementary approaches to visual agent management in Engram:

### Ian's Idea: Loadout Screen (CoD/Battlefield)
Build and personalize an avatar for each agent, then drag-and-drop skills/tools onto capability slots. Like equipping a soldier in Call of Duty — each choice has visible tradeoffs (token overhead, latency, cost). Save blueprints for different configurations.

### Alan's Idea: Agent Village (Stardew Valley)
A living visual environment where agents exist as characters in a village. Watch them move between zones (library, workshop, lab), interact with each other during collaboration, and build new structures as workflows expand. The village grows with your AI infrastructure.

## Key Insight: These Are Layers, Not Alternatives

| User Intent | Game Pattern | Interface |
|-------------|-------------|-----------|
| **CONFIGURE** | CoD Gunsmith loadout | Loadout screen (Ian) |
| **OBSERVE** | Stardew village routines | Village view (Alan) |
| **UNDERSTAND** | Sims needs bars | Agent health metrics |
| **MANAGE** | RimWorld priority grid | Task assignment matrix |
| **DEBUG** | Screeps task objects | Click-to-inspect task chain |
| **ENJOY** | Ant farm psychology | Ambient "productive voyeurism" |

## Competitive Landscape (Feb 2026)

### The White Space
Nobody has built a multi-entity, visual/game-like interface for managing REAL productive AI agents. Every adjacent space is active:

| Exists | Category | Examples |
|--------|----------|----------|
| Yes | AI agent towns (entertainment) | a16z AI Town, Stanford Smallville |
| Yes | Agent dashboards (productivity) | CrewAI, LangGraph Studio, n8n |
| Yes | AI companions (single entity) | Replika, Character.AI, Sweekar |
| Yes | Virtual offices (human teams) | WorkAdventure, SoWork |
| **NO** | **Visual village for productive AI agents** | **Empty** |

### Key Market Signals
- **Simile AI** (Smallville spinoff) raised $100M Series A (Feb 2026) — massive investor appetite for visual agent simulations
- **Sweekar** launched at CES 2026 — consumer appetite for AI + visual characters
- **CrewAI/LangGraph** adopting AG-UI standard — agent management UI layer still consolidating
- Every agent builder uses node graphs. Zero use game metaphors.

### Reference Projects
| Project | Learn From |
|---------|-----------|
| [a16z AI Town](https://github.com/a16z-infra/ai-town) | TypeScript simulation engine, tilemap, sprites |
| [WorkAdventure](https://github.com/workadventure/workadventure) | Pixel workspace where entities do real work |
| [AI-tamago](https://github.com/ykhli/AI-tamago) | LLM-driven character with internal state |
| [Inworld AI](https://inworld.ai/) | Character that stays in-character with memory |
| [Stanford Generative Agents](https://arxiv.org/abs/2304.03442) | Autonomous NPC architecture (observation + reflection + planning) |
| [Overmind (Screeps)](https://github.com/bencbartlett/Overmind) | Hierarchical agent coordination, task-as-object pattern |

## Game Design Patterns That Translate

### From CoD Gunsmith (CONFIGURE)
- **Slot-based architecture with hard limits** — force meaningful tradeoffs
- **Real-time stat preview** — adding a tool shows token overhead, latency, cost change
- **Blueprints/presets** — save "Research Config" vs "Code Config"
- **Visual + functional split** — avatar/personality separate from tools/model
- **Class identity** — agent archetype with signature traits that can't be removed

### From Stardew Valley (OBSERVE)
- **Predictable rhythms with variation** — learn patterns, notice when they break
- **Visible movement between zones** — walking creates life, not just state changes
- **Building upgrades** — workspace physically changes when capabilities expand
- **NPCs acknowledge changes** — agents comment on new deployments, system events

### From The Sims (UNDERSTAND)
- **Transparent internal state** via colored bars — always see WHY an agent acts
- **Compositional status** — stack positive/negative indicators (moodlets)
- **Autonomy spectrum** — slider from full-auto to manual approval
- **Action queue** — visible task list with autonomous interrupt capability

### From RimWorld (MANAGE)
- **Priority grid** — the most information-dense management UI in gaming
  - Rows = agents, Columns = task types
  - Priority 1-4 per cell
  - Skill level indicators per cell
  - Greyed out = agent incapable (missing tools)
- **Direct override** — "force this agent to do X NOW" button
- **Cascading dependencies** — visible chains showing how tasks feed each other

### From Screeps (DEBUG)
- **Tasks as inspectable objects** — click to see action + target + completion condition
- **Chained task manifests** — "Research → Code → Test → Deploy" visible as a pipeline
- **Visual debug overlays** — token flow, API calls, context window usage per agent
- **Three-phase lifecycle** — Configure → Plan → Execute as distinct visual states

### Psychology of Watching Agents
- **Emergence from simple rules** creates satisfaction (ant farm effect)
- **Anthropomorphism is automatic** — names + visual + behavior = social bond
- **Apophenia fills in narrative** — minimal animation + context = maximum engagement
- **"Productive voyeurism"** — watching REAL work happen is the differentiator from pure games
- **Predictable + surprising** — routine with meaningful interruptions, not pure randomness

## Appeal Analysis

### Loadout Screen (Ian): Power User Retention
- Appeals to people who already understand agent configuration
- Satisfying for experts (lots of knobs to turn)
- Less differentiated from existing tools
- Useful but not viral

### Agent Village (Alan): New User Acquisition
- Turns invisible agent work into visible, emotionally engaging experience
- Accessible to non-technical Domain Translators (Engram's audience)
- Highly screenshottable, demo-friendly, inherently viral
- "I'm a carpenter who built an AI village" is a compelling narrative
- Taps into massive Stardew/Sims audience

### Verdict: Village attracts, loadout retains. Build both as layers.

## Existing Foundation: PL Terrarium

The Percival Labs terrarium already has:
- 9 agents with unique colors, roles, positions, personality-driven animations
- Three.js 3D office environment with desks, lighting, particles
- Real-time SSE events from agent execution
- Chat bubbles positioned via 3D→2D projection
- Canvas-based monitor displays per agent
- Background music and ambient atmosphere
- Connection to REAL agent activity (not mocked)

### Gap from Terrarium → Village
1. Expand from one room to multi-zone village
2. Add agent pathfinding/movement between zones
3. Add the build/expand loop (village grows with capabilities)
4. Add loadout screen as agent detail view
5. Add RimWorld-style management grid
6. Add Sims-style health/status bars

## Phased Implementation

| Phase | Focus | Effort |
|-------|-------|--------|
| 1 | Sims-style needs bars + click-to-inspect | Small — overlay on existing terrarium |
| 2 | Loadout screen (Ian's concept) | Medium — new agent config UI |
| 3 | Multi-zone village with pathfinding | Large — scene expansion + movement system |
| 4 | RimWorld priority grid | Medium — task assignment matrix UI |
| 5 | Build loop (auto-expanding village) | Large — procedural building placement |

## Open Questions
- 2D (pixel art, like Stardew) or 3D (like current terrarium)?
- Web-based or desktop app (Tauri)?
- Engram feature or standalone product?
- How much of the PL terrarium code can be reused vs. rebuilt?
- What's the minimum viable version that's demo-worthy?

## Paid Tier Monetization Model

| Tier | Price | Includes |
|------|-------|----------|
| **Free (BYOK CLI)** | $0 | Engram CLI, local config, bring-your-own API keys |
| **Hosted Basic** | $19/mo | Hosted API, smart model routing, usage dashboard |
| **Hosted Pro** | $49/mo | Everything in Basic + Agent Village visualization, priority routing, advanced analytics |

**Key insight:** Smart router saves 5-7x on token costs by routing ~80% of "effort" tasks to cheap models (Haiku/local). The $19-49/mo pays for itself in routing savings alone. Users pay for the routing intelligence, not the tokens.

**Video insight (Google Gemini 3.1 Pro analysis):** Models are commoditizing. The routing/trust/orchestration layer is where value accrues. PL builds the driver, not the engine.

---

## Smart Router Architecture

### Problem Type Classification (Zero-LLM)

Keyword-based classifier — zero latency, zero cost, deterministic:

| Problem Type | Signal Keywords | Example Tasks |
|-------------|----------------|---------------|
| **reasoning** | analyze, prove, derive, logic, compare, evaluate, why | "Why does this algorithm fail on edge cases?" |
| **effort** | generate, create, write, build, implement, produce, list | "Write unit tests for the auth module" |
| **coordination** | coordinate, plan, schedule, assign, delegate, orchestrate | "Plan the sprint and assign tasks" |
| **domain** | jargon-dense, technical terms, acronyms, specific fields | "Explain NIP-85 trust score propagation" |
| **ambiguity** | question marks, "maybe", "could", "what if", open-ended | "What's the best approach for this?" |

### Model Tier Map (Budget-Aware)

| Problem Type | Primary (0-60% budget) | Fallback (60-80%) | Cheapest (80-100%) |
|---|---|---|---|
| reasoning | opus | sonnet | haiku |
| effort | haiku | haiku | local (glm-4.7-flash) |
| coordination | sonnet | sonnet | haiku |
| domain | sonnet | deepseek-v3 | local |
| ambiguity | sonnet | gemini-2.5-pro | haiku |

Budget degradation is automatic: as daily budget consumption increases, the router shifts to cheaper models. This is transparent — the village shows model badges changing color as budget tightens.

---

## Zone-to-Problem-Type Mapping

The village zones map directly to router problem types:

| Zone | Problem Type | Visual | Grid Area |
|------|-------------|--------|-----------|
| **Observatory** | reasoning | Deep purple, telescope, star charts | cols 14-19, rows 0-5 |
| **Workshop** | effort | Warm amber, anvil, workbenches | cols 0-5, rows 8-13 |
| **Town Square** | coordination | Warm stone, fountain, notice board | cols 7-12, rows 5-9 |
| **Library** | domain | Dark green, bookshelves, scrolls | cols 14-19, rows 8-13 |
| **Garden** | ambiguity | Soft teal, winding paths, flowers | cols 0-5, rows 0-5 |

When the router classifies a task, the assigned agent walks to the corresponding zone. This makes routing decisions visible and intuitive — you can literally watch your AI team think through problems by observing which buildings they visit.

---

## Updated Phased Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| **0** | Prototype: Isometric village with mock events, 5 zones, 9 agents | **Building** |
| **1** | Smart Model Router: keyword classification, budget degradation, `model_routed` events | **Building** |
| **2** | Integration: Village reacts to real router events, model badges, zone walking | **Building** |
| **3** | Sims-style status bars, click-to-inspect, agent health/energy/focus | Next |
| **4** | Loadout screen (Ian's concept): drag-drop skill/tool configuration | Future |
| **5** | Build loop: village auto-expands as capabilities grow, procedural buildings | Future |

---

## Notes
- Prototype built Feb 2026 as part of Percival Labs monorepo (`apps/village/`).
- The competitive landscape confirms the white space is real and the timing is right.
- Simile's $100M raise proves investor appetite. Sweekar proves consumer appetite.
- The combination of "productive" (real work) + "game-like" (visual engagement) is the key differentiator.
