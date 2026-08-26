function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function normalizePhone(phone) {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/\D/g, '');

  if (raw.startsWith('+')) {
    return `+${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  return raw;
}

async function sendViaTwilio(env, phone, message) {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const fromNumber = env.TWILIO_FROM_NUMBER || env.TWILIO_PHONE_NUMBER;
  const messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || (!fromNumber && !messagingServiceSid)) {
    return {
      ok: true,
      mode: 'demo',
      phone,
      message: `Demo reminder prepared for ${phone}. Add Twilio secrets to send real texts.`
    };
  }

  const body = new URLSearchParams({
    To: phone,
    Body: message
  });

  if (messagingServiceSid) {
    body.set('MessagingServiceSid', messagingServiceSid);
  } else {
    body.set('From', fromNumber);
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      accept: 'application/json'
    },
    body
  });

  const responseText = await response.text();
  let payload = {};

  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const errorMessage = payload?.message || responseText || `Twilio request failed with status ${response.status}`;
    const errorCode = payload?.code ? ` (code ${payload.code})` : '';
    throw new Error(`Twilio error${errorCode}: ${errorMessage}`);
  }

  return {
    ok: true,
    mode: 'live',
    phone,
    message: `Text message sent to ${phone}.`,
    sid: payload.sid
  };
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const data = await request.json();
    const phone = normalizePhone(data?.phone);
    const message = String(data?.message || '').trim();

    if (!phone) {
      return json({ ok: false, error: 'Phone number is required.' }, 400);
    }

    if (!message) {
      return json({ ok: false, error: 'Message is required.' }, 400);
    }

    const result = await sendViaTwilio(env, phone, message);
    return json(result);
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to send reminder.'
    }, 500);
  }
}
