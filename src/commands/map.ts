import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { getSkillsDir, getMemoryDir, getHooksDir, getTargetDir } from '../lib/paths';
import { parseSkillFrontmatter, extractUseWhen } from '../lib/skill-parser';

// ── ANSI helpers ─────────────────────────────────────────────────
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

// ── Types ────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  type: 'skill' | 'memory' | 'hook' | 'context' | 'team' | 'chain';
  description?: string;
  path?: string;
  triggers?: string[];
  size?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: 'references' | 'uses-memory' | 'triggers-hook' | 'includes-skill';
}

interface MapOptions {
  output?: string;
  open?: boolean;
}

// ── Scanner functions ────────────────────────────────────────────

function scanSkills(skillsDir: string): GraphNode[] {
  const nodes: GraphNode[] = [];
  if (!existsSync(skillsDir)) return nodes;

  for (const entry of readdirSync(skillsDir)) {
    const skillPath = join(skillsDir, entry);
    if (!statSync(skillPath).isDirectory()) continue;

    const skillMd = join(skillPath, 'SKILL.md');
    if (!existsSync(skillMd)) continue;

    const meta = parseSkillFrontmatter(skillMd);
    if (!meta) continue;

    const triggers = extractUseWhen(meta.description);

    nodes.push({
      id: `skill:${meta.name}`,
      label: meta.name,
      type: 'skill',
      description: meta.description.substring(0, 200),
      path: skillPath,
      triggers,
    });
  }

  return nodes;
}

function scanMemory(memoryDir: string): GraphNode[] {
  const nodes: GraphNode[] = [];
  if (!existsSync(memoryDir)) return nodes;

  for (const entry of readdirSync(memoryDir)) {
    const entryPath = join(memoryDir, entry);
    const stat = statSync(entryPath);

    if (stat.isDirectory()) {
      nodes.push({
        id: `memory:${entry}`,
        label: entry,
        type: 'memory',
        path: entryPath,
        description: `Memory directory: ${entry}`,
      });
    } else if (entry.endsWith('.md')) {
      const name = entry.replace('.md', '');
      nodes.push({
        id: `memory:${name}`,
        label: name,
        type: 'memory',
        path: entryPath,
        description: `Memory file: ${entry}`,
      });
    }
  }

  return nodes;
}

function scanHooks(hooksDir: string): GraphNode[] {
  const nodes: GraphNode[] = [];
  if (!existsSync(hooksDir)) return nodes;

  for (const entry of readdirSync(hooksDir)) {
    if (!entry.endsWith('.ts') && !entry.endsWith('.js')) continue;
    const name = entry.replace(/\.(ts|js)$/, '');
    nodes.push({
      id: `hook:${name}`,
      label: name,
      type: 'hook',
      path: join(hooksDir, entry),
      description: `Hook: ${entry}`,
    });
  }

  return nodes;
}

function scanContext(targetDir: string): GraphNode[] {
  const nodes: GraphNode[] = [];

  const contextFiles = ['context.md', 'CLAUDE.md', 'constitution.md'];
  for (const file of contextFiles) {
    const filePath = join(targetDir, file);
    if (existsSync(filePath)) {
      nodes.push({
        id: `context:${file}`,
        label: file,
        type: 'context',
        path: filePath,
        description: `Context file: ${file}`,
      });
    }
  }

  return nodes;
}

function scanTeams(teamsDir: string): GraphNode[] {
  const nodes: GraphNode[] = [];
  if (!existsSync(teamsDir)) return nodes;

  for (const entry of readdirSync(teamsDir)) {
    const teamPath = join(teamsDir, entry);
    if (!statSync(teamPath).isDirectory()) continue;

    nodes.push({
      id: `team:${entry}`,
      label: entry,
      type: 'team',
      path: teamPath,
      description: `Team: ${entry}`,
    });
  }

  return nodes;
}

function scanChains(chainsDir: string): GraphNode[] {
  const nodes: GraphNode[] = [];
  if (!existsSync(chainsDir)) return nodes;

  for (const entry of readdirSync(chainsDir)) {
    if (!entry.endsWith('.yaml') && !entry.endsWith('.yml')) continue;
    const name = entry.replace(/\.(yaml|yml)$/, '');
    nodes.push({
      id: `chain:${name}`,
      label: name,
      type: 'chain',
      path: join(chainsDir, entry),
      description: `Chain: ${name}`,
    });
  }

  return nodes;
}

// ── Edge detection ───────────────────────────────────────────────

function detectEdges(nodes: GraphNode[], skillsDir: string): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const skillNodes = nodes.filter(n => n.type === 'skill');
  const skillNames = skillNodes.map(n => n.label);
  const memoryNodes = nodes.filter(n => n.type === 'memory');
  const hookNodes = nodes.filter(n => n.type === 'hook');

  // Skill-to-skill: check if SKILL.md body references other skill names
  for (const skill of skillNodes) {
    const skillMd = join(skillsDir, skill.label, 'SKILL.md');
    if (!existsSync(skillMd)) continue;

    let body: string;
    try {
      body = readFileSync(skillMd, 'utf-8');
    } catch {
      continue;
    }

    // Remove frontmatter
    const bodyWithoutFm = body.replace(/^---[\s\S]*?---/, '');

    for (const otherName of skillNames) {
      if (otherName === skill.label) continue;
      if (otherName.length < 6) continue; // Short names cause too many false positives

      // Case-sensitive match — skill names are PascalCase, reduces noise
      const regex = new RegExp(`\\b${escapeRegex(otherName)}\\b`);
      if (regex.test(bodyWithoutFm)) {
        edges.push({
          source: skill.id,
          target: `skill:${otherName}`,
          type: 'references',
        });
      }
    }

    // Skill-to-memory: check if skill body mentions memory directory names
    for (const mem of memoryNodes) {
      const memName = mem.label;
      if (memName.length < 5) continue;
      // Case-sensitive to avoid noise
      const memRegex = new RegExp(`\\b${escapeRegex(memName)}\\b`);
      if (memRegex.test(bodyWithoutFm)) {
        edges.push({
          source: skill.id,
          target: mem.id,
          type: 'uses-memory',
        });
      }
    }
  }

  // Hook-to-skill: match hook names to skill names
  for (const hook of hookNodes) {
    const hookName = hook.label.toLowerCase().replace(/[.-]/g, '');
    for (const skill of skillNodes) {
      const skillName = skill.label.toLowerCase();
      if (hookName.includes(skillName) || skillName.includes(hookName)) {
        edges.push({
          source: hook.id,
          target: skill.id,
          type: 'triggers-hook',
        });
      }
    }
  }

  // Deduplicate edges
  const seen = new Set<string>();
  return edges.filter(e => {
    const key = `${e.source}->${e.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── HTML generation ──────────────────────────────────────────────

function generateHTML(nodes: GraphNode[], edges: GraphEdge[]): string {
  const nodesJSON = JSON.stringify(nodes);
  const edgesJSON = JSON.stringify(edges);

  const stats = {
    skills: nodes.filter(n => n.type === 'skill').length,
    memory: nodes.filter(n => n.type === 'memory').length,
    hooks: nodes.filter(n => n.type === 'hook').length,
    context: nodes.filter(n => n.type === 'context').length,
    teams: nodes.filter(n => n.type === 'team').length,
    chains: nodes.filter(n => n.type === 'chain').length,
    edges: edges.length,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Engram Map</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: #0a0e17;
    color: #cbd5e1;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
    overflow: hidden;
    height: 100vh;
  }

  #header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 52px;
    background: linear-gradient(180deg, #111827 0%, #0f172a 100%);
    border-bottom: 1px solid #1e293b;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    z-index: 100;
  }

  #header .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
    font-size: 15px;
    color: #e2e8f0;
  }

  #header .brand .logo {
    width: 24px;
    height: 24px;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: white;
    font-weight: 700;
  }

  #stats {
    display: flex;
    gap: 16px;
    font-size: 12px;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .stat .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .stat .count {
    font-weight: 600;
    color: #e2e8f0;
  }

  .stat .label {
    color: #64748b;
  }

  #controls {
    position: fixed;
    top: 64px;
    left: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 90;
  }

  #search {
    width: 220px;
    padding: 8px 12px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    color: #e2e8f0;
    font-size: 13px;
    outline: none;
    transition: border-color 0.2s;
  }

  #search:focus { border-color: #3b82f6; }
  #search::placeholder { color: #475569; }

  #filters {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .filter-btn {
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid #334155;
    background: #1e293b;
    color: #94a3b8;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;
  }

  .filter-btn.active {
    border-color: var(--type-color);
    color: var(--type-color);
    background: color-mix(in srgb, var(--type-color) 12%, #1e293b);
  }

  .filter-btn:hover { background: #334155; }

  #detail-panel {
    position: fixed;
    top: 52px;
    right: 0;
    width: 320px;
    height: calc(100vh - 52px);
    background: #111827;
    border-left: 1px solid #1e293b;
    padding: 20px;
    z-index: 90;
    transform: translateX(100%);
    transition: transform 0.25s ease;
    overflow-y: auto;
  }

  #detail-panel.open { transform: translateX(0); }

  #detail-panel .close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: none;
    background: #1e293b;
    color: #94a3b8;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  #detail-panel .close-btn:hover { background: #334155; }

  #detail-panel .type-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
  }

  #detail-panel h2 {
    font-size: 18px;
    font-weight: 600;
    color: #f1f5f9;
    margin-bottom: 12px;
    word-break: break-word;
  }

  #detail-panel .desc {
    font-size: 13px;
    line-height: 1.6;
    color: #94a3b8;
    margin-bottom: 16px;
  }

  #detail-panel .meta-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #1e293b;
    font-size: 12px;
  }

  #detail-panel .meta-key { color: #64748b; }
  #detail-panel .meta-val { color: #cbd5e1; font-weight: 500; }

  #detail-panel .connections-title {
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 16px;
    margin-bottom: 8px;
  }

  #detail-panel .connection-item {
    padding: 6px 8px;
    margin-bottom: 4px;
    background: #1e293b;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }

  #detail-panel .connection-item:hover { background: #334155; }

  #graph { width: 100%; height: 100vh; }

  .node-label {
    font-size: 10px;
    fill: #94a3b8;
    pointer-events: none;
    user-select: none;
    text-anchor: middle;
  }

  .node-label.highlighted {
    fill: #f1f5f9;
    font-weight: 600;
    font-size: 12px;
  }

  .link {
    stroke-opacity: 0.15;
    stroke-width: 1;
  }

  .link.highlighted {
    stroke-opacity: 0.6;
    stroke-width: 2;
  }

  #tooltip {
    position: fixed;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12px;
    color: #e2e8f0;
    pointer-events: none;
    z-index: 200;
    display: none;
    max-width: 280px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }

  #tooltip .tt-type {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
  }
</style>
</head>
<body>

<div id="header">
  <div class="brand">
    <div class="logo">E</div>
    Engram Map
  </div>
  <div id="stats">
    <div class="stat">
      <div class="dot" style="background:#3b82f6"></div>
      <span class="count">${stats.skills}</span>
      <span class="label">skills</span>
    </div>
    <div class="stat">
      <div class="dot" style="background:#10b981"></div>
      <span class="count">${stats.memory}</span>
      <span class="label">memory</span>
    </div>
    <div class="stat">
      <div class="dot" style="background:#f59e0b"></div>
      <span class="count">${stats.hooks}</span>
      <span class="label">hooks</span>
    </div>
    <div class="stat">
      <div class="dot" style="background:#8b5cf6"></div>
      <span class="count">${stats.context}</span>
      <span class="label">context</span>
    </div>
    <div class="stat">
      <div class="dot" style="background:#64748b"></div>
      <span class="count">${stats.edges}</span>
      <span class="label">connections</span>
    </div>
  </div>
</div>

<div id="controls">
  <input type="text" id="search" placeholder="Search nodes..." />
  <div id="filters">
    <button class="filter-btn active" data-type="skill" style="--type-color:#3b82f6" onclick="toggleFilter('skill',this)">Skills</button>
    <button class="filter-btn active" data-type="memory" style="--type-color:#10b981" onclick="toggleFilter('memory',this)">Memory</button>
    <button class="filter-btn active" data-type="hook" style="--type-color:#f59e0b" onclick="toggleFilter('hook',this)">Hooks</button>
    <button class="filter-btn active" data-type="context" style="--type-color:#8b5cf6" onclick="toggleFilter('context',this)">Context</button>
    <button class="filter-btn active" data-type="team" style="--type-color:#ef4444" onclick="toggleFilter('team',this)">Teams</button>
    <button class="filter-btn active" data-type="chain" style="--type-color:#ec4899" onclick="toggleFilter('chain',this)">Chains</button>
  </div>
</div>

<div id="detail-panel">
  <button class="close-btn" onclick="closeDetail()">&times;</button>
  <div id="detail-content"></div>
</div>

<div id="tooltip"></div>

<svg id="graph"></svg>

<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
// ── Data ──────────────────────────────────────────────────────
const rawNodes = ${nodesJSON};
const rawEdges = ${edgesJSON};

const typeColors = {
  skill:   '#3b82f6',
  memory:  '#10b981',
  hook:    '#f59e0b',
  context: '#8b5cf6',
  team:    '#ef4444',
  chain:   '#ec4899',
};

const typeRadius = {
  skill:   6,
  memory:  8,
  hook:    5,
  context: 12,
  team:    10,
  chain:   10,
};

// ── State ─────────────────────────────────────────────────────
let activeFilters = new Set(['skill', 'memory', 'hook', 'context', 'team', 'chain']);
let searchTerm = '';
let selectedNode = null;

// ── Graph setup ───────────────────────────────────────────────
const width = window.innerWidth;
const height = window.innerHeight;

const svg = d3.select('#graph')
  .attr('width', width)
  .attr('height', height);

const g = svg.append('g');

// Zoom
const zoom = d3.zoom()
  .scaleExtent([0.1, 4])
  .on('zoom', (event) => g.attr('transform', event.transform));

svg.call(zoom);

// Initial zoom to fit
svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8));

// ── Compute connection counts for sizing ──────────────────────
const connectionCount = {};
rawNodes.forEach(n => connectionCount[n.id] = 0);
rawEdges.forEach(e => {
  connectionCount[e.source] = (connectionCount[e.source] || 0) + 1;
  connectionCount[e.target] = (connectionCount[e.target] || 0) + 1;
});

// ── Force simulation ──────────────────────────────────────────
const simulation = d3.forceSimulation(rawNodes)
  .force('link', d3.forceLink(rawEdges).id(d => d.id).distance(80).strength(0.3))
  .force('charge', d3.forceManyBody().strength(-120).distanceMax(400))
  .force('center', d3.forceCenter(0, 0))
  .force('collision', d3.forceCollide().radius(d => getRadius(d) + 4))
  .force('x', d3.forceX().strength(d => d.type === 'context' ? 0.15 : 0.02))
  .force('y', d3.forceY().strength(d => d.type === 'context' ? 0.15 : 0.02))
  .alphaDecay(0.02);

// ── Draw ──────────────────────────────────────────────────────
const linkGroup = g.append('g');
const nodeGroup = g.append('g');
const labelGroup = g.append('g');

let linkElements = linkGroup.selectAll('line')
  .data(rawEdges)
  .join('line')
  .attr('class', 'link')
  .attr('stroke', d => {
    const sourceType = typeof d.source === 'object' ? d.source.type : rawNodes.find(n => n.id === d.source)?.type;
    return typeColors[sourceType] || '#334155';
  });

let nodeElements = nodeGroup.selectAll('circle')
  .data(rawNodes)
  .join('circle')
  .attr('r', d => getRadius(d))
  .attr('fill', d => typeColors[d.type])
  .attr('stroke', d => typeColors[d.type])
  .attr('stroke-width', 1.5)
  .attr('fill-opacity', 0.25)
  .attr('cursor', 'pointer')
  .on('click', (event, d) => showDetail(d))
  .on('mouseenter', (event, d) => highlightNode(d))
  .on('mouseleave', () => unhighlightAll())
  .call(d3.drag()
    .on('start', dragStart)
    .on('drag', dragging)
    .on('end', dragEnd));

let labelElements = labelGroup.selectAll('text')
  .data(rawNodes)
  .join('text')
  .attr('class', 'node-label')
  .attr('dy', d => getRadius(d) + 14)
  .text(d => d.label.length > 18 ? d.label.substring(0, 16) + '...' : d.label);

// ── Tick ──────────────────────────────────────────────────────
simulation.on('tick', () => {
  linkElements
    .attr('x1', d => d.source.x)
    .attr('y1', d => d.source.y)
    .attr('x2', d => d.target.x)
    .attr('y2', d => d.target.y);

  nodeElements
    .attr('cx', d => d.x)
    .attr('cy', d => d.y);

  labelElements
    .attr('x', d => d.x)
    .attr('y', d => d.y);
});

// ── Helpers ───────────────────────────────────────────────────
function getRadius(d) {
  const base = typeRadius[d.type] || 6;
  const connections = connectionCount[d.id] || 0;
  return base + Math.min(connections * 1.5, 12);
}

function dragStart(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragging(event, d) {
  d.fx = event.x;
  d.fy = event.y;
}

function dragEnd(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

// ── Highlight ─────────────────────────────────────────────────
function highlightNode(d) {
  const connectedIds = new Set();
  connectedIds.add(d.id);

  rawEdges.forEach(e => {
    const sourceId = typeof e.source === 'object' ? e.source.id : e.source;
    const targetId = typeof e.target === 'object' ? e.target.id : e.target;
    if (sourceId === d.id) connectedIds.add(targetId);
    if (targetId === d.id) connectedIds.add(sourceId);
  });

  nodeElements
    .attr('fill-opacity', n => connectedIds.has(n.id) ? 0.6 : 0.08)
    .attr('stroke-opacity', n => connectedIds.has(n.id) ? 1 : 0.2);

  labelElements
    .classed('highlighted', n => connectedIds.has(n.id))
    .attr('fill-opacity', n => connectedIds.has(n.id) ? 1 : 0.15);

  linkElements
    .classed('highlighted', e => {
      const sourceId = typeof e.source === 'object' ? e.source.id : e.source;
      const targetId = typeof e.target === 'object' ? e.target.id : e.target;
      return sourceId === d.id || targetId === d.id;
    });

  // Tooltip
  const tooltip = document.getElementById('tooltip');
  tooltip.innerHTML = '<div class="tt-type" style="color:' + typeColors[d.type] + '">' + d.type + '</div><strong>' + d.label + '</strong>';
  tooltip.style.display = 'block';

  document.addEventListener('mousemove', moveTooltip);
}

function moveTooltip(e) {
  const tooltip = document.getElementById('tooltip');
  tooltip.style.left = (e.clientX + 14) + 'px';
  tooltip.style.top = (e.clientY + 14) + 'px';
}

function unhighlightAll() {
  nodeElements.attr('fill-opacity', 0.25).attr('stroke-opacity', 1);
  labelElements.classed('highlighted', false).attr('fill-opacity', 1);
  linkElements.classed('highlighted', false);
  document.getElementById('tooltip').style.display = 'none';
  document.removeEventListener('mousemove', moveTooltip);
}

// ── Detail panel ──────────────────────────────────────────────
function showDetail(d) {
  selectedNode = d;
  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');

  const connections = [];
  rawEdges.forEach(e => {
    const sourceId = typeof e.source === 'object' ? e.source.id : e.source;
    const targetId = typeof e.target === 'object' ? e.target.id : e.target;
    if (sourceId === d.id) {
      const target = rawNodes.find(n => n.id === targetId);
      if (target) connections.push({ node: target, direction: 'outgoing', type: e.type });
    }
    if (targetId === d.id) {
      const source = rawNodes.find(n => n.id === sourceId);
      if (source) connections.push({ node: source, direction: 'incoming', type: e.type });
    }
  });

  let html = '';
  html += '<div class="type-badge" style="background:' + typeColors[d.type] + '22;color:' + typeColors[d.type] + '">' + d.type + '</div>';
  html += '<h2>' + d.label + '</h2>';

  if (d.description) {
    html += '<div class="desc">' + escapeHtml(d.description) + '</div>';
  }

  html += '<div class="meta-row"><span class="meta-key">Connections</span><span class="meta-val">' + connections.length + '</span></div>';

  if (d.triggers && d.triggers.length > 0) {
    html += '<div class="meta-row"><span class="meta-key">Triggers</span><span class="meta-val">' + d.triggers.slice(0, 5).join(', ') + '</span></div>';
  }

  if (d.path) {
    const shortPath = d.path.replace(/\\/home\\/[^/]+/, '~').replace(/\\/Users\\/[^/]+/, '~');
    html += '<div class="meta-row"><span class="meta-key">Path</span><span class="meta-val" style="font-size:11px;word-break:break-all">' + escapeHtml(shortPath) + '</span></div>';
  }

  if (connections.length > 0) {
    html += '<div class="connections-title">Connections</div>';
    connections.forEach(c => {
      const arrow = c.direction === 'outgoing' ? '&rarr;' : '&larr;';
      const color = typeColors[c.node.type];
      html += '<div class="connection-item" onclick="focusNode(\\'' + c.node.id + '\\')">' +
        '<span style="color:' + color + '">' + arrow + '</span> ' +
        '<span style="color:#94a3b8;font-size:10px">' + c.type + '</span> ' +
        c.node.label +
        '</div>';
    });
  }

  content.innerHTML = html;
  panel.classList.add('open');
}

function closeDetail() {
  document.getElementById('detail-panel').classList.remove('open');
  selectedNode = null;
}

function focusNode(nodeId) {
  const node = rawNodes.find(n => n.id === nodeId);
  if (node) {
    showDetail(node);
    // Pan to node
    svg.transition().duration(500).call(
      zoom.transform,
      d3.zoomIdentity.translate(width / 2 - node.x * 0.8, height / 2 - node.y * 0.8).scale(0.8)
    );
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Search ────────────────────────────────────────────────────
document.getElementById('search').addEventListener('input', function() {
  searchTerm = this.value.toLowerCase();
  updateVisibility();
});

// ── Filters ───────────────────────────────────────────────────
function toggleFilter(type, btn) {
  if (activeFilters.has(type)) {
    activeFilters.delete(type);
    btn.classList.remove('active');
  } else {
    activeFilters.add(type);
    btn.classList.add('active');
  }
  updateVisibility();
}

function updateVisibility() {
  nodeElements.attr('display', d => {
    const typeVisible = activeFilters.has(d.type);
    const searchMatch = !searchTerm || d.label.toLowerCase().includes(searchTerm);
    return typeVisible && searchMatch ? null : 'none';
  });

  labelElements.attr('display', d => {
    const typeVisible = activeFilters.has(d.type);
    const searchMatch = !searchTerm || d.label.toLowerCase().includes(searchTerm);
    return typeVisible && searchMatch ? null : 'none';
  });

  linkElements.attr('display', e => {
    const sourceId = typeof e.source === 'object' ? e.source.id : e.source;
    const targetId = typeof e.target === 'object' ? e.target.id : e.target;
    const sourceNode = rawNodes.find(n => n.id === sourceId);
    const targetNode = rawNodes.find(n => n.id === targetId);
    if (!sourceNode || !targetNode) return 'none';
    const sv = activeFilters.has(sourceNode.type) && (!searchTerm || sourceNode.label.toLowerCase().includes(searchTerm));
    const tv = activeFilters.has(targetNode.type) && (!searchTerm || targetNode.label.toLowerCase().includes(searchTerm));
    return sv && tv ? null : 'none';
  });
}

// ── Keyboard shortcuts ────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDetail();
  if (e.key === '/' && e.target.tagName !== 'INPUT') {
    e.preventDefault();
    document.getElementById('search').focus();
  }
});

// ── Click background to deselect ──────────────────────────────
svg.on('click', (event) => {
  if (event.target === svg.node()) closeDetail();
});
</script>
</body>
</html>`;
}

// ── Main command ─────────────────────────────────────────────────

export async function map(options: MapOptions): Promise<void> {
  console.log('');
  console.log(`  ${BOLD}Engram Map${RESET} — Structure Visualization`);
  console.log(`  ${DIM}────────────────────────────────${RESET}`);

  const targetDir = getTargetDir();
  const skillsDir = getSkillsDir();
  const memoryDir = getMemoryDir();
  const hooksDir = getHooksDir();
  const engramHome = join(process.env.HOME || '', '.engram');

  // Scan all node types
  const skillNodes = scanSkills(skillsDir);
  const memoryNodes = scanMemory(memoryDir);
  const hookNodes = scanHooks(hooksDir);
  const contextNodes = scanContext(targetDir);
  const teamNodes = scanTeams(join(engramHome, 'teams'));
  const chainNodes = scanChains(join(engramHome, 'chains'));

  const allNodes = [...skillNodes, ...memoryNodes, ...hookNodes, ...contextNodes, ...teamNodes, ...chainNodes];

  console.log(`  ${GREEN}Scanned:${RESET}`);
  console.log(`    ${CYAN}${skillNodes.length}${RESET} skills`);
  console.log(`    ${CYAN}${memoryNodes.length}${RESET} memory nodes`);
  console.log(`    ${CYAN}${hookNodes.length}${RESET} hooks`);
  console.log(`    ${CYAN}${contextNodes.length}${RESET} context files`);
  if (teamNodes.length > 0) console.log(`    ${CYAN}${teamNodes.length}${RESET} teams`);
  if (chainNodes.length > 0) console.log(`    ${CYAN}${chainNodes.length}${RESET} chains`);

  // Detect edges
  const edges = detectEdges(allNodes, skillsDir);
  console.log(`    ${CYAN}${edges.length}${RESET} connections detected`);
  console.log('');

  // Generate HTML
  const html = generateHTML(allNodes, edges);

  // Write output
  let outputPath: string;
  if (options.output) {
    outputPath = options.output;
  } else {
    const mapDir = join(engramHome, 'maps');
    mkdirSync(mapDir, { recursive: true });
    outputPath = join(mapDir, 'engram-map.html');
  }

  writeFileSync(outputPath, html);
  console.log(`  ${GREEN}Map generated:${RESET} ${outputPath}`);

  // Open in browser
  if (options.open !== false) {
    try {
      const platform = process.platform;
      if (platform === 'darwin') {
        execSync(`open "${outputPath}"`);
      } else if (platform === 'linux') {
        execSync(`xdg-open "${outputPath}"`);
      } else if (platform === 'win32') {
        execSync(`start "${outputPath}"`);
      }
      console.log(`  ${DIM}Opened in browser${RESET}`);
    } catch {
      console.log(`  ${DIM}Open ${outputPath} in your browser to view${RESET}`);
    }
  }

  console.log('');
}
