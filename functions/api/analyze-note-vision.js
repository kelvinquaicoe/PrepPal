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

async function fileToDataUrl(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return `data:${file.type || 'image/jpeg'};base64,${btoa(binary)}`;
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

function resolveApiKey(env) {
  return env.API_KEY || env.GROQ_API_KEY || env['API-Key'] || env.OPENAI_API_KEY;
}

function resolveTextModel(env) {
  return env.GROQ_TEXT_MODEL || env.TEXT_MODEL || 'openai/gpt-oss-120b';
}

function resolveVisionModel(env) {
  return env.GROQ_VISION_MODEL || env.VISION_MODEL || 'llama-3.2-11b-vision-preview';
}

function missingApiKeyResponse() {
  return json({ error: 'Missing API key secret. Set API_KEY in the Worker, then redeploy.' }, 500);
}

function extractMessageText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('\n').trim();
  }
  return '';
}

function parseAiJson(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const jsonText = start !== -1 && end !== -1 && end > start ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(jsonText);
}

async function callGroq(apiKey, model, messages, responseFormat) {
  const body = {
    model,
    messages,
    temperature: 0.2,
    max_tokens: 700
  };

  if (responseFormat) body.response_format = responseFormat;

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
    throw new Error(errorMessage);
  }

  const text = extractMessageText(payload);
  if (!text) throw new Error('Groq response did not contain usable output text');

  try {
    return parseAiJson(text);
  } catch {
    return { ...fallbackPlan, extractionNote: 'PrepPal could not parse the AI output. Please try again.' };
  }
}

async function callGroqWithText(apiKey, noteText, model) {
  const prompt = `Extract a safe, friendly prep plan from the pasted medical note.
Use the note text as the source of truth.
If details are missing, infer a common colonoscopy prep timeline.
Keep the content simple and general.`;

  return callGroq(apiKey, model, [
    {
      role: 'user',
      content: [{ type: 'text', text: `${prompt}\n\nPasted note text:\n"""\n${noteText}\n"""` }]
    }
  ], { type: 'json_schema', json_schema: getPlanSchema() });
}

async function callGroqWithImage(apiKey, file, noteText, model) {
  const imageUrl = await fileToDataUrl(file);
  const prompt = `You are helping a patient understand a handwritten medical procedure note from a photo.
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
- Use the image as the source of truth.
- If note text is also provided, use it as supporting context.
- If the note is unclear, infer a common colonoscopy prep timeline.
- Do not include markdown or extra commentary.`;

  const textPart = noteText
    ? `${prompt}\n\nSupporting note text:\n"""\n${noteText}\n"""`
    : prompt;

  return callGroq(apiKey, model, [
    {
      role: 'user',
      content: [
        { type: 'text', text: textPart },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    }
  ]);
}

function buildFallbackPlan(errorMessage) {
  if (!errorMessage) return fallbackPlan;
  return {
    ...fallbackPlan,
    extractionNote: `PrepPal used the built-in demo plan because the AI service was unavailable: ${errorMessage}`
  };
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

    const apiKey = resolveApiKey(env);
    const isImage = typeof file !== 'string' && file && typeof file.type === 'string' && file.type.startsWith('image/');

    if (isImage) {
      if (!apiKey) return missingApiKeyResponse();
      try {
        const plan = await callGroqWithImage(apiKey, file, noteText, resolveVisionModel(env));
        return json({ ...fallbackPlan, ...plan });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        console.error('analyze-note image path failed:', error);
        return json(buildFallbackPlan(message));
      }
    }

    if (noteText) {
      if (!apiKey) return missingApiKeyResponse();
      try {
        const plan = await callGroqWithText(apiKey, noteText, resolveTextModel(env));
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

    return json({
      ...fallbackPlan,
      extractionNote: 'PrepPal accepted the file. For the live AI step, a photo works best for handwriting.'
    });
  } catch (error) {
    return json({ error: 'Unable to analyze the note.' }, 500);
  }
}
