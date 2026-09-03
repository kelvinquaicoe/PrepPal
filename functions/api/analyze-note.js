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

function getPlanSchema() {
  return {
    name: 'prep_pal_plan',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['procedureType', 'procedureDate', 'processingTitle', 'extractionNote', 'smsPreview', 'timeline'],
      properties: {
        procedureType: { type: 'string' },
        procedureDate: { type: 'string' },
        processingTitle: { type: 'string' },
        extractionNote: { type: 'string' },
        smsPreview: { type: 'string' },
        timeline: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['step', 'label', 'title', 'body'],
            properties: {
              step: { type: 'string' },
              label: { type: 'string' },
              title: { type: 'string' },
              body: { type: 'string' }
            }
          }
        }
      }
    }
  };
}

function extractGroqMessageText(payload) {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();
  }

  return '';
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

function unescapeAiString(value) {
  return String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')
    .trim();
}

function extractLooseField(text, key) {
  const source = String(text || '');
  const quotedPatterns = [
    new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i'),
    new RegExp(`'${key}'\\s*:\\s*'((?:\\\\.|[^'\\\\])*)'`, 'i')
  ];

  for (const pattern of quotedPatterns) {
    const match = source.match(pattern);
    if (match?.[1]) {
      return unescapeAiString(match[1]);
    }
  }

  const unquotedMatch = source.match(new RegExp(`"${key}"\\s*:\\s*([^,}\\n]+)`, 'i'));
  if (unquotedMatch?.[1]) {
    return unescapeAiString(unquotedMatch[1].trim());
  }

  const bareMatch = source.match(new RegExp(`${key}\\s*:\\s*([^,}\\n]+)`, 'i'));
  if (bareMatch?.[1]) {
    return unescapeAiString(bareMatch[1].trim());
  }

  return '';
}

function normalizeTimelineLabel(label, fallbackIndex) {
  const trimmed = String(label || '').trim();
  if (!trimmed) {
    return `STEP ${fallbackIndex}`;
  }

  return trimmed.replace(/\s+/g, ' ').toUpperCase();
}

function extractTimelineFromText(text) {
  const source = String(text || '');
  const blocks = source.match(/\{[\s\S]*?\}/g) || [];
  const items = [];

  for (const block of blocks) {
    const step = extractLooseField(block, 'step');
    const label = extractLooseField(block, 'label');
    const title = extractLooseField(block, 'title');
    const body = extractLooseField(block, 'body');

    if (!step && !label && !title && !body) continue;

    items.push({
      step: step || String(items.length + 1),
      label: label || '',
      title: title || '',
      body: body || ''
    });
  }

  return items;
}

function splitLineItem(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) {
    return null;
  }

  const bulletMatch = trimmed.match(/^(?:[-*•]|\d+[.)])\s*(.+)$/);
  const body = bulletMatch ? bulletMatch[1].trim() : trimmed;
  const separatorMatch = body.match(/^(.{2,80}?)(?:\s+[-–—:|]\s+|\s{2,})(.+)$/);

  if (!separatorMatch) {
    return { label: '', body };
  }

  const left = separatorMatch[1].trim();
  const right = separatorMatch[2].trim();

  if (!left || !right) {
    return { label: '', body };
  }

  return { label: left, body: right };
}

function extractBulletTimelineFromText(text) {
  const items = [];
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const bulletMatch = line.match(/^(?:[-*•]|\d+[.)])\s*(.+)$/);
    if (!bulletMatch) continue;

    const split = splitLineItem(bulletMatch[1]);
    if (!split) continue;

    const step = String(items.length + 1);
    items.push({
      step,
      label: normalizeTimelineLabel(split.label || `Step ${step}`, step),
      title: split.body,
      body: ''
    });
  }

  return items;
}

function salvagePlanFromText(text, errorMessage) {
  const source = String(text || '');
  const procedureType = extractLooseField(source, 'procedureType');
  const procedureDate = extractLooseField(source, 'procedureDate');
  const processingTitle = extractLooseField(source, 'processingTitle');
  const extractionNote = extractLooseField(source, 'extractionNote');
  const smsPreview = extractLooseField(source, 'smsPreview');
  const timeline = extractTimelineFromText(source);
  const bulletTimeline = timeline.length ? [] : extractBulletTimelineFromText(source);

  return {
    ...fallbackPlan,
    ...(procedureType ? { procedureType } : {}),
    ...(procedureDate ? { procedureDate } : {}),
    ...(processingTitle ? { processingTitle } : {}),
    ...(smsPreview ? { smsPreview } : {}),
    ...((timeline.length || bulletTimeline.length) ? { timeline: timeline.length ? timeline : bulletTimeline } : {}),
    extractionNote:
      extractionNote ||
      `PrepPal recovered partial details from the AI response${errorMessage ? ` after a JSON parse issue: ${errorMessage}` : ''}.`
  };
}

async function callGroqChatCompletion(apiKey, messages, model, responseFormat) {
  const body = {
    model,
    messages,
    temperature: 0.2,
    max_tokens: 700
  };

  if (responseFormat) {
    body.response_format = responseFormat;
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const responseText = await response.text();
  let payload = {};

  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const errorMessage = payload?.error?.message || payload?.message || responseText || `Groq request failed with status ${response.status}`;
    throw new Error(`Groq request failed with status ${response.status}: ${errorMessage}`);
  }

  const text = extractGroqMessageText(payload);

  if (!text) {
    throw new Error('Groq response did not contain usable output text');
  }

  try {
    return parseJsonResponse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown parse error';
    return salvagePlanFromText(text, message);
  }
}

async function callGroqWithImage(apiKey, file) {
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

  return callGroqChatCompletion(apiKey, [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    }
  ], 'openai/gpt-oss-120b');
}

async function callGroqWithText(apiKey, noteText) {
  const prompt = `Extract a safe, friendly prep plan from the pasted medical note.
Use the note text as the source of truth.
If details are missing, infer a common colonoscopy prep timeline.
Keep the content simple and general.`;

  return callGroqChatCompletion(apiKey, [
    {
      role: 'user',
      content: [
        { type: 'text', text: `${prompt}\n\nPasted note text:\n"""\n${noteText}\n"""` }
      ]
    }
  ], 'openai/gpt-oss-120b', { type: 'json_schema', json_schema: getPlanSchema() });
}

function buildImageOnlyResponse() {
  return json({
    ...fallbackPlan,
    extractionNote: 'PrepPal can analyze pasted text with your Groq key right now. The available Groq model is text-only, so please paste the note text to analyze a photo.'
  });
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

function resolveApiKey(env) {
  return env.API_KEY || env.GROQ_API_KEY || env['API-Key'] || env.DUKEGPT_API_KEY || env.OPENAI_API_KEY;
}

function resolveTextModel(env) {
  return 'openai/gpt-oss-120b';
}

function resolveVisionModel(env) {
  return 'openai/gpt-oss-120b';
}

function missingApiKeyResponse() {
  return json(
    {
      error:
        'Missing API key secret. Set API_KEY in the Worker, then redeploy.'
    },
    500
  );
}

export async function onRequestPost(context) {
  const { request, env } = context;

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
        const plan = await callGroqWithText(apiKey, noteText);
        return json({ ...fallbackPlan, ...plan });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
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

    return buildImageOnlyResponse();
  } catch (error) {
    return json({ error: 'Unable to analyze the note.' }, 500);
  }
}
