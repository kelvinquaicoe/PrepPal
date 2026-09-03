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
  let binary = '';
  const bytes = new Uint8Array(buffer);
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

function buildFallbackPlan(errorMessage) {
  if (!errorMessage) {
    return fallbackPlan;
  }