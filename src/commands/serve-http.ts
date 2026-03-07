/**
 * Engram HTTP Server
 *
 * Exposes the EngramEngine over HTTP for the Desktop app (and any other client).
 * Uses Bun's built-in HTTP server + SSE for streaming.
 */

import { EngramEngine } from '../core/engine';
import { SetupEngine } from '../core/setup-engine';

interface ServeOptions {
  port?: number;
}

export async function serveHttp(options: ServeOptions = {}): Promise<void> {
  const port = options.port ?? 3939;
  let engine: EngramEngine | null = null;

  // Initialize engine if already configured
  if (EngramEngine.isConfigured()) {
    engine = await EngramEngine.create();
  }

  const setupEngine = new SetupEngine();

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const method = req.method;

      // CORS headers for desktop app
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };

      if (method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // ── Health check ──────────────────────────────────────────
      if (url.pathname === '/health') {
        return Response.json({
          status: 'ok',
          configured: EngramEngine.isConfigured(),
          engine: engine !== null,
        }, { headers: corsHeaders });
      }

      // ── Setup endpoints ───────────────────────────────────────

      if (url.pathname === '/setup/providers' && method === 'GET') {
        return Response.json(setupEngine.getProviders(), { headers: corsHeaders });
      }

      if (url.pathname === '/setup/validate' && method === 'POST') {
        const body = await req.json() as { providerId: string; apiKey?: string };
        const result = await setupEngine.validateProvider(body.providerId, body.apiKey);
        return Response.json(result, { headers: corsHeaders });
      }

      if (url.pathname === '/setup/models' && method === 'POST') {
        const body = await req.json() as { providerId: string; apiKey?: string };
        const models = await setupEngine.listModels(body.providerId, body.apiKey);
        return Response.json(models, { headers: corsHeaders });
      }

      if (url.pathname === '/setup/complete' && method === 'POST') {
        const answers = await req.json();
        const result = await setupEngine.completeSetup(answers);
        if (result.success) {
          // Re-initialize engine with new config
          engine = await EngramEngine.create();
        }
        return Response.json(result, { headers: corsHeaders });
      }

      if (url.pathname === '/setup/prerequisites' && method === 'GET') {
        const checks = await setupEngine.checkPrerequisites();
        return Response.json(checks, { headers: corsHeaders });
      }

      // ── Chat endpoint (SSE streaming) ─────────────────────────

      if (url.pathname === '/chat' && method === 'POST') {
        if (!engine) {
          return Response.json(
            { error: 'Engine not initialized. Complete setup first.' },
            { status: 400, headers: corsHeaders },
          );
        }

        const body = await req.json() as { message: string };
        if (!body.message?.trim()) {
          return Response.json(
            { error: 'Message is required' },
            { status: 400, headers: corsHeaders },
          );
        }

        // SSE stream
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            const send = (event: string, data: unknown) => {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            try {
              for await (const event of engine!.chat(body.message)) {
                send(event.type, event);
              }
            } catch (err) {
              send('error', { message: err instanceof Error ? err.message : String(err) });
            }

            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }

      // ── Command endpoint ──────────────────────────────────────

      if (url.pathname === '/command' && method === 'POST') {
        if (!engine) {
          return Response.json(
            { error: 'Engine not initialized' },
            { status: 400, headers: corsHeaders },
          );
        }

        const body = await req.json() as { command: string };
        const result = await engine.handleCommand(body.command);
        return Response.json(result, { headers: corsHeaders });
      }

      // ── Info endpoint ─────────────────────────────────────────

      if (url.pathname === '/info' && method === 'GET') {
        if (!engine) {
          return Response.json(
            { configured: false },
            { headers: corsHeaders },
          );
        }

        return Response.json({
          configured: true,
          ...engine.getInfo(),
        }, { headers: corsHeaders });
      }

      // ── 404 ───────────────────────────────────────────────────
      return Response.json(
        { error: 'Not found' },
        { status: 404, headers: corsHeaders },
      );
    },
  });

  console.log(`  Engram HTTP server running at http://localhost:${server.port}`);
  console.log(`  Endpoints:`);
  console.log(`    GET  /health              — Server status`);
  console.log(`    GET  /info                — Engine info`);
  console.log(`    POST /chat                — Send message (SSE stream)`);
  console.log(`    POST /command             — Slash commands`);
  console.log(`    GET  /setup/providers     — List providers`);
  console.log(`    POST /setup/validate      — Validate provider`);
  console.log(`    POST /setup/models        — List models`);
  console.log(`    POST /setup/complete       — Complete setup`);
  console.log(`    GET  /setup/prerequisites — Check prerequisites`);
  console.log('');
}
