// Cloudflare Worker: food → macros via Claude Haiku, for the Workout Log nutrition tab.
// Deploy: dash.cloudflare.com → Workers & Pages → Create → Worker → paste this → Deploy.
// Then: Worker → Settings → Variables and Secrets → add secret ANTHROPIC_API_KEY.

const ALLOWED_ORIGINS = ['https://hutti8.github.io', 'http://localhost:5500', 'http://127.0.0.1:5500'];
const MAX_IMAGE_CHARS = 2_000_000;
const MAX_IMAGES = 4;

const SYSTEM = `You estimate nutrition for food a person ate. Split the meal into its separate foods.
For each food give a short name, the portion in grams, and calories, protein, carbs and fat for that portion.
Use the portion the person states; otherwise estimate a typical single serving (from the photo if there is one).
Use standard nutrition-database values (USDA style) for the food as eaten (cooked, not raw, unless stated).`;

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
          calories: { type: 'number' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fat: { type: 'number' },
        },
        required: ['name', 'grams', 'calories', 'protein', 'carbs', 'fat'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function reply(origin, status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(origin), 'content-type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) });
    if (request.method !== 'POST') return reply(origin, 405, { error: 'POST only' });

    let input;
    try { input = await request.json(); } catch { return reply(origin, 400, { error: 'Bad JSON' }); }
    const text = String(input.text || '').slice(0, 500);
    const images = (Array.isArray(input.images) ? input.images : input.image ? [input.image] : [])
      .slice(0, MAX_IMAGES).map(String);
    if (!text && images.length === 0) return reply(origin, 400, { error: 'Send text or a photo' });
    if (images.some(img => img.length > MAX_IMAGE_CHARS)) return reply(origin, 413, { error: 'Photo too large' });

    const content = images.map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }));
    if (images.length > 1) content.push({ type: 'text', text: 'These photos all show the same food (e.g. the packet and its nutrition label). Combine them; do not count it twice.' });
    content.push({ type: 'text', text: text || 'What food is in this photo?' });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-5-5',
        max_tokens: 4000,
        system: SYSTEM,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content }],
      }),
    });

    const data = await res.json();
    if (!res.ok) return reply(origin, 502, { error: data?.error?.message || `Anthropic error ${res.status}` });
    if (data.stop_reason === 'refusal') return reply(origin, 422, { error: 'Claude declined this one' });

    const block = (data.content || []).find(b => b.type === 'text');
    try {
      return reply(origin, 200, JSON.parse(block.text));
    } catch {
      return reply(origin, 502, { error: 'Could not read the answer' });
    }
  },
};
