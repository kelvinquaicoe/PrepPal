function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
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

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
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
