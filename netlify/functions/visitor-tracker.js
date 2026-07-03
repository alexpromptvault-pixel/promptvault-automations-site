// Netlify Function: visitor-tracker
// Receives a beacon from the live site when a visitor lands
// and forwards a richly-formatted message to Telegram.
//
// Endpoint: POST /.netlify/functions/visitor-tracker
// CORS: open (this is a public marketing site, not auth)
//
// Required env vars (set in Netlify site settings):
//   TELEGRAM_BOT_TOKEN — bot token from @BotFather
//   TELEGRAM_CHAT_ID   — chat id to receive alerts
//
// Optional env vars:
//   DEDUPE_WINDOW_MINUTES (default 30) — suppress repeat alerts same IP+session
//   DEDUPE_STORE_URL     — KV/Upstash URL for dedupe (falls back to in-memory)
//   DEDUPE_STORE_TOKEN   — KV/Upstash token

const TELEGRAM_API = 'https://api.telegram.org/bot';
const MAX_MSG_LEN = 3800; // leave headroom under Telegram's 4096 limit

// --- tiny KV abstraction (in-memory if no Upstash env) -----------------
const memory = new Map(); // ip-session -> { ts, payload }

async function getDedupe(key) {
  const url = process.env.DEDUPE_STORE_URL;
  if (url) {
    try {
      const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
        headers: process.env.DEDUPE_STORE_TOKEN
          ? { Authorization: `Bearer ${process.env.DEDUPE_STORE_TOKEN}` }
          : {},
      });
      if (r.ok) {
        const j = await r.json();
        return j.result || null;
      }
    } catch (_) {}
  }
  return memory.get(key) || null;
}

async function setDedupe(key, value) {
  const windowMin = parseInt(process.env.DEDUPE_WINDOW_MINUTES || '30', 10);
  const ttl = windowMin * 60;
  const payload = JSON.stringify({ ...value, exp: Math.floor(Date.now() / 1000) + ttl });
  const url = process.env.DEDUPE_STORE_URL;
  if (url) {
    try {
      await fetch(
        `${url}/set/${encodeURIComponent(key)}?EX=${ttl}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.DEDUPE_STORE_TOKEN
              ? { Authorization: `Bearer ${process.env.DEDUPE_STORE_TOKEN}` }
              : {}),
          },
          body: JSON.stringify(value),
        }
      );
      return;
    } catch (_) {}
  }
  memory.set(key, value);
  // evict expired in-memory
  for (const [k, v] of memory) {
    if (v.exp && v.exp * 1000 < Date.now()) memory.delete(k);
  }
}

// --- helpers -----------------------------------------------------------

function mdEscape(s) {
  if (s == null) return '';
  return String(s).replace(/[_*`\[\]]/g, (m) => '\\' + m);
}

function formatVisitorMessage(v) {
  const now = new Date();
  const ukTime = now.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    dateStyle: 'full',
    timeStyle: 'medium',
  });
  const ua = v.userAgent || 'unknown';
  const browser = guessBrowser(ua);
  const os = guessOS(ua);
  const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'Mobile' : 'Desktop';
  const lines = [
    `*New visitor to prompt-vault-automations.netlify.app*`,
    ``,
    `*Time (UK):* ${mdEscape(ukTime)}`,
    `*Page:* ${mdEscape(v.path || '/')}`,
    v.referrer ? `*Referrer:* ${mdEscape(v.referrer)}` : `*Referrer:* direct / none`,
    v.utm_source ? `*UTM source:* ${mdEscape(v.utm_source)}` : null,
    v.utm_medium ? `*UTM medium:* ${mdEscape(v.utm_medium)}` : null,
    v.utm_campaign ? `*UTM campaign:* ${mdEscape(v.utm_campaign)}` : null,
    v.utm_term ? `*UTM term:* ${mdEscape(v.utm_term)}` : null,
    v.utm_content ? `*UTM content:* ${mdEscape(v.utm_content)}` : null,
    ``,
    `*Location*`,
    v.geo?.city ? `  • City: ${mdEscape(v.geo.city)}` : null,
    v.geo?.country ? `  • Country: ${mdEscape(v.geo.country)}` : null,
    v.geo?.region ? `  • Region: ${mdEscape(v.geo.region)}` : null,
    v.geo?.latitude && v.geo?.longitude
      ? `  • Coords: ${v.geo.latitude}, ${v.geo.longitude}`
      : null,
    v.ip ? `  • IP: ${mdEscape(v.ip)}` : null,
    ``,
    `*Device*`,
    `  • Type: ${device}`,
    `  • OS: ${os}`,
    `  • Browser: ${browser}`,
    v.screen ? `  • Screen: ${v.screen.w}x${v.screen.h} @ ${v.screen.dpr}x` : null,
    v.language ? `  • Language: ${mdEscape(v.language)}` : null,
    v.timezone ? `  • Timezone: ${mdEscape(v.timezone)}` : null,
    ``,
    `*Session*`,
    v.sessionId ? `  • ID: \`${mdEscape(v.sessionId)}\`` : null,
    v.duration ? `  • On page: ${v.duration}s` : null,
    v.scrollDepth != null ? `  • Scroll depth: ${v.scrollDepth}%` : null,
    v.ctaClicks ? `  • CTA clicks: ${v.ctaClicks}` : null,
    v.sectionViews ? `  • Sections viewed: ${mdEscape(v.sectionViews.join(', '))}` : null,
    v.isReturning ? `  • Returning visitor` : null,
    ``,
    v.notes ? `*Notes:* ${mdEscape(v.notes)}` : null,
  ].filter((l) => l !== null && l !== undefined);
  return lines.join('\n');
}

function guessBrowser(ua) {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Unknown';
}

function guessOS(ua) {
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad|iOS/.test(ua)) return 'iOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown';
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set' };
  }
  const r = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    }),
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}

// --- handler -----------------------------------------------------------

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (_) {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  // --- enrich with Netlify geo headers ---
  const h = event.headers || {};
  const get = (k) => h[k] || h[k.toLowerCase()] || h['x-nf-' + k] || '';
  const geo = {
    city: get('x-nf-geo-city') || h['x-nf-geo-city'],
    country: get('x-nf-geo-country-name') || h['x-nf-geo-country-name'],
    region: get('x-nf-geo-region') || h['x-nf-geo-region'],
    latitude: get('x-nf-geo-latitude') || h['x-nf-geo-latitude'],
    longitude: get('x-nf-geo-longitude') || h['x-nf-geo-longitude'],
  };
  const ip =
    h['x-nf-client-connection-ip'] ||
    h['x-forwarded-for']?.split(',')[0]?.trim() ||
    h['client-ip'] ||
    '';

  const visitor = {
    ...body,
    ip,
    geo,
    userAgent: body.userAgent || h['user-agent'] || '',
    receivedAt: new Date().toISOString(),
  };

  // --- dedupe ---
  const sessionId = visitor.sessionId || 'anon';
  const dedupeKey = `${ip || 'noip'}-${sessionId}`;
  const prev = await getDedupe(dedupeKey);
  const windowMin = parseInt(process.env.DEDUPE_WINDOW_MINUTES || '30', 10);
  if (prev && Date.now() - prev.ts < windowMin * 60 * 1000) {
    return jsonResponse(200, { ok: true, deduped: true });
  }

  // --- format and send ---
  let text = formatVisitorMessage(visitor);
  if (text.length > MAX_MSG_LEN) text = text.slice(0, MAX_MSG_LEN - 50) + '\n\n_…(truncated)_';
  const result = await sendTelegram(text);
  if (!result.ok) {
    return jsonResponse(500, { ok: false, error: 'Telegram send failed', detail: result });
  }
  await setDedupe(dedupeKey, { ts: Date.now() });
  return jsonResponse(200, { ok: true, telegram: result.body });
};

function jsonResponse(status, body) {
  return {
    statusCode: status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
