/**
 * Cloudflare Worker — Gemini API proxy for spatial-ai-lab.
 *
 * The GEMINI_API_KEY never reaches the browser; it lives only in
 * Cloudflare's encrypted secrets store.
 *
 * Allowed origins are restricted so the key cannot be abused from
 * arbitrary third-party sites.
 */

const ALLOWED_ORIGINS = [
  'https://protimroy.github.io',
  'http://localhost:3000',
  'http://localhost:4173', // vite preview
];

const GEMINI_MODEL = 'gemini-2.0-flash-lite';

interface Env {
  GEMINI_API_KEY: string;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = ALLOWED_ORIGINS.includes(origin);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      if (!allowed) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    if (!allowed) {
      return new Response('Forbidden', { status: 403 });
    }

    if (!env.GEMINI_API_KEY) {
      return new Response('Server misconfiguration: API key not set', { status: 500 });
    }

    let body: { prompt?: unknown };
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON body', { status: 400 });
    }

    if (!body.prompt || typeof body.prompt !== 'string') {
      return new Response('Missing or invalid "prompt" field', { status: 400 });
    }

    // Proxy the streaming request to Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: body.prompt }] }],
        }),
      }
    );

    if (!geminiRes.ok || !geminiRes.body) {
      const errText = await geminiRes.text();
      return new Response(`Gemini error: ${errText}`, {
        status: geminiRes.status,
        headers: corsHeaders(origin),
      });
    }

    // Stream Gemini's SSE response straight back to the browser
    return new Response(geminiRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...corsHeaders(origin),
      },
    });
  },
};
