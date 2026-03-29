/**
 * Cloudflare Worker — OpenAI API proxy for spatial-ai-lab.
 *
 * The OPENAI_API_KEY never reaches the browser; it lives only in
 * Cloudflare's encrypted secrets store.
 *
 * Allowed origins are restricted so the key cannot be abused from
 * arbitrary third-party sites.
 */

const ALLOWED_ORIGINS = [
  'https://www.protimroy.com',
  'https://protimroy.com',
  'https://protimroy.github.io',
  'http://localhost:3000',
  'http://localhost:4173', // vite preview
];

const OPENAI_MODEL = 'gpt-4o-mini';

// Prompt is hardcoded server-side — the browser sends no user-controlled input,
// eliminating prompt injection and arbitrary API abuse via curl/scripts.
const FIXED_PROMPT = `Write a detailed technical analysis (~600 words) about spatial layout algorithms in modern AI interfaces. Use rich markdown formatting: headings, bold, italics, bullet lists, a table, and a blockquote. This content is used to stress-test a browser layout performance benchmark.`;

interface Env {
  OPENAI_API_KEY: string;
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

    if (!env.OPENAI_API_KEY) {
      return new Response('Server misconfiguration: API key not set', { status: 500 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON body', { status: 400 });
    }

    // Ignore any prompt from the client — always use the hardcoded prompt.
    // This prevents prompt injection and arbitrary API abuse.

    // Proxy the streaming request to OpenAI
    const openaiRes = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          stream: true,
          messages: [{ role: 'user', content: FIXED_PROMPT }],
        }),
      }
    );

    if (!openaiRes.ok || !openaiRes.body) {
      const errText = await openaiRes.text();
      return new Response(`OpenAI error: ${errText}`, {
        status: openaiRes.status,
        headers: corsHeaders(origin),
      });
    }

    // Stream OpenAI's SSE response straight back to the browser
    return new Response(openaiRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...corsHeaders(origin),
      },
    });
  },
};
