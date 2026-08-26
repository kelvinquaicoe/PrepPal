# PrepPal prototype

A mobile-first career-fair demo showing how a photo of a handwritten medical-procedure note could become a clear preparation timeline and text reminder.

## AI setup

The image-to-plan feature uses a Cloudflare Pages Function, so your API key is never exposed in the browser.

1. Create your API key.
2. In your Cloudflare Pages project, add an encrypted secret named `DUKEGPT_API_KEY`.
3. Deploy this folder as a Pages project. Cloudflare automatically maps `functions/api/analyze-note.js` to `/api/analyze-note`.
4. If you want real SMS sending, add Twilio secrets too: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_FROM_NUMBER` / `TWILIO_PHONE_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`.

For local development, copy `.dev.vars.example` to `.dev.vars`, put your key there, and run:

```bash
npx wrangler pages dev .
```

Never commit `.dev.vars` or paste the key in `app.js`.

The reminder button calls `functions/api/send-reminder.js`, which uses Twilio when those secrets are available and falls back to a demo response otherwise.

## Basic preview

Open `index.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

For the full app flow with `/api/analyze-note` and `/api/send-reminder`, use:

```bash
npx wrangler pages dev .
```

Then visit the local URL Wrangler prints in the terminal.

## Demo path

Home → Add a doctor's note → Camera / Photos / Files → Analyze note with AI → timeline → set reminders → preview text.

Use only made-up sample notes for the demo; do not upload real medical records. The generated plan is not medical advice, and the message button is simulated.
