import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4321);

const fallbackPlan = {
  procedureType: 'Colonoscopy',
  procedureDate: 'Wed, Sep 16 · 8:00 AM',
  processingTitle: 'Making your\ninstructions clear…',
  extractionNote: 'PrepPal extracted the key steps, but you should always confirm them with your clinic.',
  smsPreview:
    'Hi Kelvin! Your colonoscopy is in 7 days. Today is a good day to review your medications with your care team. Reply HELP for support.',
  timeline: [
    {
      step: '1',
      label: '7 DAYS BEFORE',
      title: 'Review your medications',
      body: 'Ask your care team about blood thinners, diabetes medicine, or supplements.'
    },
    {
      step: '2',
      label: 'DAY BEFORE · 8:00 AM',
      title: 'Switch to clear liquids',
      body: 'Water, clear broth, apple juice, tea, and gelatin are okay. Avoid red or purple drinks.'
    },
    {
      step: '3',
      label: 'DAY BEFORE · 6:00 PM',
      title: 'Start your bowel prep',
      body: 'Follow the exact mixing and drinking instructions from your clinic.'
    },
    {
      step: '4',
      label: 'PROCEDURE DAY · 12:00 AM',
      title: 'Do not eat solid food',
      body: 'Follow your clinic’s cutoff time for clear liquids.'
    }
  ]
};

function parseEnvFile(text) {
  const env = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

async function loadEnv() {
  const filePath = join(rootDir, '.dev.vars');
  if (!existsSync(filePath)) return {};

  const text = await readFile(filePath, 'utf8');
  return parseEnvFile(text);
}

function resolveApiKey(env) {
  return env.API_KEY || env['API-Key'] || env.DUKEGPT_API_KEY || env.OPENAI_API_KEY;
}

function missingApiKeyResponse() {
  return json(
    {
      error: 'Missing API key secret. Set API_KEY in the Worker, then redeploy.'
    },
    500
  );
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function fileToDataUrl(file) {
  return file.arrayBuffer().then((buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    return `data:${file.type || 'image/jpeg'};base64,${btoa(binary)}`;
  });
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') {
        parts.push(content.text);
      }
    }
  }

  return parts.join('\n').trim();
}

function parseJsonResponse(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const jsonText = start !== -1 && end !== -1 && end > start ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(jsonText);
}

async function callOpenAI(apiKey, file, model) {
  const imageUrl = await fileToDataUrl(file);
  const prompt = `You are helping a patient understand a handwritten medical procedure note.
Return only valid JSON with these keys:
- procedureType
- procedureDate
- processingTitle
- extractionNote
- smsPreview
- timeline (array of objects with step, label, title, body)

Important:
- Make the tone friendly and simple.
- Keep the plan safe and general.
- If the note is unclear, infer a common colonoscopy prep timeline.
- Do not include markdown or extra commentary.`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: imageUrl }
          ]
        }
      ],
      temperature: 0.2,
      max_output_tokens: 700
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const text = extractResponseText(payload);

  if (!text) {
    throw new Error('OpenAI response did not contain usable output text');
  }

  return parseJsonResponse(text);
}

async function callOpenAIWithText(apiKey, noteText, model) {
  const prompt = `You are helping a patient understand a medical note.
Return only valid JSON with these keys:
- procedureType
- procedureDate
- processingTitle
- extractionNote
- smsPreview
- timeline (array of objects with step, label, title, body)

Use the pasted note text below as the source of truth.
If the note is incomplete, infer a safe, generic follow-up plan based on the text.
Make the tone friendly and simple.
Do not include markdown or extra commentary.

Pasted note text:
"""
${noteText}
"""`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: prompt }]
        }
      ],
      temperature: 0.2,
      max_output_tokens: 700
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const text = extractResponseText(payload);

  if (!text) {
    throw new Error('OpenAI response did not contain usable output text');
  }

  return parseJsonResponse(text);
}

function buildFallbackPlan(errorMessage) {
  if (!errorMessage) {
    return fallbackPlan;
  }

  return {
    ...fallbackPlan,
    extractionNote: `PrepPal used the built-in demo plan because the AI service was unavailable: ${errorMessage}`
  };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sendViaEmail(env, email, message) {
  const apiKey = env.RESEND_API_KEY;
  const fromEmail = env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return {
      ok: true,
      mode: 'demo',
      email,
      message: `Demo reminder prepared for ${email}. Add email service secrets to send real emails.`
    };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: 'PrepPal reminder',
      text: message
    })
  });

  const responseText = await response.text();
  let payload = {};

  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const errorMessage = payload?.message || responseText || `Email service request failed with status ${response.status}`;
    throw new Error(`Email error: ${errorMessage}`);
  }

  return {
    ok: true,
    mode: 'live',
    email,
    message: `Email sent to ${email}.`,
    id: payload?.id
  };
}

async function handleAnalyzeNote(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const noteText = String(formData.get('noteText') || '').trim();

    if (!file && !noteText) {
      return json({ error: 'Please upload a file or paste note text.' }, 400);
    }

    if (noteText) {
      const apiKey = resolveApiKey(env);
      if (!apiKey) {
        return missingApiKeyResponse();
      }

      try {
        const model = env.DUKEGPT_MODEL || env.OPENAI_MODEL || 'gpt-4o-mini';
        const plan = await callOpenAIWithText(apiKey, noteText, model);
        return json({ ...fallbackPlan, ...plan });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'request failed or returned invalid JSON';
        console.error('analyze-note text path failed:', error);
        return json(buildFallbackPlan(message));
      }
    }

    if (!file || typeof file === 'string') {
      return json({ error: 'Please upload a file.' }, 400);
    }

    const isImage = typeof file.type === 'string' && file.type.startsWith('image/');
    if (!isImage) {
      return json({
        ...fallbackPlan,
        extractionNote: 'PrepPal accepted the file. For the live AI step, a photo works best for handwriting.'
      });
    }

    const apiKey = resolveApiKey(env);
    if (!apiKey) {
      return missingApiKeyResponse();
    }

    try {
      const model = env.DUKEGPT_MODEL || env.OPENAI_MODEL || 'gpt-4o-mini';
      const plan = await callOpenAI(apiKey, file, model);
      return json({ ...fallbackPlan, ...plan });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'request failed or returned invalid JSON';
      console.error('analyze-note image path failed:', error);
      return json(buildFallbackPlan(message));
    }
  } catch {
    return json({ error: 'Unable to analyze the note.' }, 500);
  }
}

async function handleSendReminder(request, env) {
  try {
    const data = await request.json();
    const email = normalizeEmail(data?.email);
    const message = String(data?.message || '').trim();

    if (!email) {
      return json({ ok: false, error: 'Email address is required.' }, 400);
    }

    if (!isValidEmail(email)) {
      return json({ ok: false, error: 'Please enter a valid email address.' }, 400);
    }

    if (!message) {
      return json({ ok: false, error: 'Message is required.' }, 400);
    }

    const result = await sendViaEmail(env, email, message);
    return json(result);
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to send reminder.'
    }, 500);
  }
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function safeJoin(urlPath) {
  const normalized = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  return join(rootDir, normalized);
}

async function serveStatic(pathname) {
  const filePath = pathname === '/' ? join(rootDir, 'index.html') : safeJoin(`.${pathname}`);
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    return new Response('Not found', { status: 404 });
  }

  const ext = extname(filePath).toLowerCase();
  const body = await readFile(filePath);
  return new Response(body, {
    headers: {
      'content-type': mimeTypes[ext] || 'application/octet-stream',
      'cache-control': 'no-store'
    }
  });
}

const env = await loadEnv();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

    let request = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      request = new Request(url, {
        method: req.method,
        headers: req.headers,
        body: req,
        duplex: 'half'
      });
    } else {
      request = new Request(url, {
        method: req.method,
        headers: req.headers
      });
    }

    let response;
    if (url.pathname === '/api/analyze-note' && req.method === 'POST') {
      response = await handleAnalyzeNote(request, env);
    } else if (url.pathname === '/api/send-reminder' && req.method === 'POST') {
      response = await handleSendReminder(request, env);
    } else {
      response = await serveStatic(url.pathname);
    }

    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Internal server error');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`PrepPal dev server running at http://127.0.0.1:${port}`);
});
