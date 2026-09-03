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

function resolveApiKey(env) {
  return env.API_KEY || env['API-Key'] || env.DUKEGPT_API_KEY || env.OPENAI_API_KEY;
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
        return json(buildFallbackPlan('missing API key'));
      }

      try {
        const model = env.DUKEGPT_MODEL || env.OPENAI_MODEL || 'gpt-4o-mini';
        const plan = await callOpenAIWithText(apiKey, noteText, model);
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

    const apiKey = resolveApiKey(env);
    if (!apiKey) {
      return json(buildFallbackPlan('missing API key'));
    }

    try {
      const model = env.DUKEGPT_MODEL || env.OPENAI_MODEL || 'gpt-4o-mini';
      const plan = await callOpenAI(apiKey, file, model);
      return json({ ...fallbackPlan, ...plan });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      console.error('analyze-note image path failed:', error);
      return json(buildFallbackPlan(message));
    }
  } catch (error) {
    return json({ error: 'Unable to analyze the note.' }, 500);
  }
}
