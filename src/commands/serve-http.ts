/**
 * Engram HTTP Server
 *
 * Exposes the EngramEngine over HTTP for the Desktop app (and any other client).
 * Uses Node.js http module for cross-runtime compatibility (works in Node, Bun, etc).
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { EngramEngine } from '../core/engine';
import { SetupEngine } from '../core/setup-engine';

interface ServeOptions {
  port?: number;
}

// ── Helpers ──

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function sendSSE(res: ServerResponse): { write: (event: string, data: unknown) => void; close: () => void } {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });

  return {
    write(event: string, data: unknown) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      res.end();
    },
  };
}

export async function serveHttp(options: ServeOptions = {}): Promise<void> {
  const port = options.port ?? 3939;
  let engine: EngramEngine | null = null;

  // Initialize engine if already configured
  if (EngramEngine.isConfigured()) {
    engine = await EngramEngine.create();
  }

  const setupEngine = new SetupEngine();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const method = req.method ?? 'GET';

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    try {
      // ── Health check ──
      if (url.pathname === '/health') {
        return sendJson(res, {
          status: 'ok',
          configured: EngramEngine.isConfigured(),
          engine: engine !== null,
        });
      }

      // ── Setup endpoints ──

      if (url.pathname === '/setup/providers' && method === 'GET') {
        return sendJson(res, setupEngine.getProviders());
      }

      if (url.pathname === '/setup/validate' && method === 'POST') {
        const body = await parseBody(req);
        const result = await setupEngine.validateProvider(body.providerId, body.apiKey);
        return sendJson(res, result);
      }

      if (url.pathname === '/setup/models' && method === 'POST') {
        const body = await parseBody(req);
        const models = await setupEngine.listModels(body.providerId, body.apiKey);
        return sendJson(res, models);
      }

      if (url.pathname === '/setup/complete' && method === 'POST') {
        const body = await parseBody(req);
        const result = await setupEngine.completeSetup(body);
        if (result.success) {
          engine = await EngramEngine.create();
        }
        return sendJson(res, result);
      }

      if (url.pathname === '/setup/prerequisites' && method === 'GET') {
        const checks = await setupEngine.checkPrerequisites();
        return sendJson(res, checks);
      }

      // ── Chat endpoint (SSE streaming) ──

      if (url.pathname === '/chat' && method === 'POST') {
        if (!engine) {
          return sendJson(res, { error: 'Engine not initialized. Complete setup first.' }, 400);
        }

        const body = await parseBody(req);
        if (!body.message?.trim()) {
          return sendJson(res, { error: 'Message is required' }, 400);
        }

        const sse = sendSSE(res);
        try {
          for await (const event of engine.chat(body.message)) {
            sse.write(event.type, event);
          }
        } catch (err) {
          sse.write('error', { message: err instanceof Error ? err.message : String(err) });
        }
        sse.close();
        return;
      }

      // ── OpenAI-compatible chat completions (for Desktop useEngine hook) ──

      if (url.pathname === '/v1/chat/completions' && method === 'POST') {
        if (!engine) {
          return sendJson(res, { error: 'Engine not initialized. Complete setup first.' }, 400);
        }

        const body = await parseBody(req);
        const lastMessage = body.messages?.[body.messages.length - 1];
        if (!lastMessage?.content?.trim()) {
          return sendJson(res, { error: 'Message is required' }, 400);
        }

        if (body.stream) {
          const sse = sendSSE(res);
          try {
            for await (const event of engine.chat(lastMessage.content)) {
              if (event.type === 'token') {
                sse.write('message', {
                  choices: [{ delta: { content: event.data ?? '' }, index: 0 }],
                });
              }
            }
            sse.write('message', { choices: [{ delta: {}, finish_reason: 'stop', index: 0 }] });
            res.write('data: [DONE]\n\n');
          } catch (err) {
            sse.write('error', { message: err instanceof Error ? err.message : String(err) });
          }
          sse.close();
          return;
        }

        // Non-streaming
        let fullContent = '';
        for await (const event of engine.chat(lastMessage.content)) {
          if (event.type === 'token') {
            fullContent += event.data ?? '';
          }
        }
        return sendJson(res, {
          choices: [{ message: { role: 'assistant', content: fullContent }, finish_reason: 'stop', index: 0 }],
        });
      }

      // ── Command endpoint ──

      if (url.pathname === '/command' && method === 'POST') {
        if (!engine) {
          return sendJson(res, { error: 'Engine not initialized' }, 400);
        }
        const body = await parseBody(req);
        const result = await engine.handleCommand(body.command);
        return sendJson(res, result);
      }

      // ── Info endpoint ──

      if (url.pathname === '/info' && method === 'GET') {
        if (!engine) {
          return sendJson(res, { configured: false });
        }
        return sendJson(res, { configured: true, ...engine.getInfo() });
      }

      // ── 404 ──
      sendJson(res, { error: 'Not found' }, 404);
    } catch (err) {
      console.error('[serve-http] Unhandled error:', err);
      sendJson(res, { error: 'Internal server error' }, 500);
    }
  });

  server.listen(port, () => {
    console.log(`  Engram HTTP server running at http://localhost:${port}`);
    console.log(`  Endpoints:`);
    console.log(`    GET  /health              — Server status`);
    console.log(`    GET  /info                — Engine info`);
    console.log(`    POST /chat                — Send message (SSE stream)`);
    console.log(`    POST /v1/chat/completions — OpenAI-compatible (stream/non-stream)`);
    console.log(`    POST /command             — Slash commands`);
    console.log(`    GET  /setup/providers     — List providers`);
    console.log(`    POST /setup/validate      — Validate provider`);
    console.log(`    POST /setup/models        — List models`);
    console.log(`    POST /setup/complete       — Complete setup`);
    console.log(`    GET  /setup/prerequisites — Check prerequisites`);
    console.log('');
  });
}
