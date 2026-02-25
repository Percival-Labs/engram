// ANSI escape codes — zero dependencies
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const GRAY = '\x1b[90m';
const BG_GRAY = '\x1b[48;5;236m';
const WHITE = '\x1b[37m';

export function printWelcome(aiName: string, model: string, provider: string): void {
  console.log('');
  console.log(`  ${CYAN}${BOLD}Engram${RESET}`);
  console.log(`  ${DIM}────────────────────────────────${RESET}`);
  console.log(`  ${GREEN}${BOLD}${aiName}${RESET} ${DIM}is ready${RESET}`);
  console.log(`  ${DIM}Model:    ${RESET}${model}`);
  console.log(`  ${DIM}Provider: ${RESET}${provider}`);
  console.log(`  ${DIM}────────────────────────────────${RESET}`);
  console.log(`  ${GRAY}Type /help for commands, Ctrl+C to exit${RESET}`);
  console.log('');
}

export function printUserPrompt(userName: string): void {
  process.stdout.write(`  ${BLUE}${BOLD}${userName}${RESET}${BLUE}:${RESET} `);
}

export function printAssistantHeader(aiName: string): void {
  console.log('');
  process.stdout.write(`  ${GREEN}${BOLD}${aiName}${RESET}${GREEN}:${RESET} `);
}

export async function renderStreamingResponse(
  stream: AsyncGenerator<string>,
): Promise<string> {
  let full = '';
  let linePos = 0;
  let inCodeBlock = false;

  for await (const token of stream) {
    full += token;

    // Render token with basic markdown awareness
    const rendered = renderToken(token, linePos, inCodeBlock);
    process.stdout.write(rendered.text);
    linePos = rendered.linePos;
    inCodeBlock = rendered.inCodeBlock;
  }

  process.stdout.write(RESET);
  console.log('\n');
  return full;
}

interface RenderState {
  text: string;
  linePos: number;
  inCodeBlock: boolean;
}

function renderToken(token: string, linePos: number, inCodeBlock: boolean): RenderState {
  let output = '';
  let pos = linePos;
  let inCode = inCodeBlock;

  for (const char of token) {
    if (char === '\n') {
      output += RESET + '\n  ';
      pos = 0;
      continue;
    }

    // Track code blocks (triple backtick at line start)
    if (char === '`' && pos <= 3) {
      // Simple heuristic — real code block detection happens at line level
    }

    output += char;
    pos++;
  }

  return { text: output, linePos: pos, inCodeBlock: inCode };
}

export function printHelp(): void {
  console.log('');
  console.log(`  ${BOLD}Commands${RESET}`);
  console.log(`  ${DIM}────────────────────────────────${RESET}`);
  console.log(`  ${CYAN}/help${RESET}     Show this help`);
  console.log(`  ${CYAN}/new${RESET}      Start a new conversation`);
  console.log(`  ${CYAN}/model${RESET}    Switch model`);
  console.log(`  ${CYAN}/config${RESET}   Show current configuration`);
  console.log(`  ${CYAN}/history${RESET}  List recent conversations`);
  console.log(`  ${CYAN}/quit${RESET}     Save and exit`);
  console.log('');
}

export function printConfig(config: {
  aiName: string;
  userName: string;
  provider: string;
  model: string;
  personality: Record<string, number>;
}): void {
  console.log('');
  console.log(`  ${BOLD}Configuration${RESET}`);
  console.log(`  ${DIM}────────────────────────────────${RESET}`);
  console.log(`  AI Name:  ${GREEN}${config.aiName}${RESET}`);
  console.log(`  User:     ${BLUE}${config.userName}${RESET}`);
  console.log(`  Provider: ${config.provider}`);
  console.log(`  Model:    ${config.model}`);
  console.log(`  ${DIM}Personality:${RESET}`);
  for (const [trait, value] of Object.entries(config.personality)) {
    const bar = '█'.repeat(Math.round(value / 5)) + '░'.repeat(20 - Math.round(value / 5));
    console.log(`    ${trait.padEnd(16)} ${CYAN}${bar}${RESET} ${value}`);
  }
  console.log('');
}

export function printHistory(conversations: Array<{ title: string; updatedAt: string; model: string }>): void {
  console.log('');
  console.log(`  ${BOLD}Recent Conversations${RESET}`);
  console.log(`  ${DIM}────────────────────────────────${RESET}`);

  if (conversations.length === 0) {
    console.log(`  ${GRAY}No conversations yet.${RESET}`);
  } else {
    for (const conv of conversations.slice(0, 10)) {
      const date = new Date(conv.updatedAt).toLocaleDateString();
      console.log(`  ${GRAY}${date}${RESET}  ${conv.title}  ${DIM}(${conv.model})${RESET}`);
    }
  }
  console.log('');
}

export function printError(message: string): void {
  console.log(`\n  ${YELLOW}${BOLD}Error:${RESET} ${message}\n`);
}

export function printGoodbye(aiName: string): void {
  console.log(`\n  ${DIM}${aiName} saved the conversation. See you next time.${RESET}\n`);
}
