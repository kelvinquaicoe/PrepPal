# PrepPal prototype

A mobile-first career-fair demo showing how a photo of a handwritten medical-procedure note could become a clear preparation timeline and email reminder.

## AI setup

The image-to-plan feature runs on a Cloudflare Worker, so your API key is never exposed in the browser.

1. Create your Groq API key.
2. In your Cloudflare Worker, add a secret named `API_KEY`.
3. Deploy this folder as a Cloudflare Worker. The `worker.js` entry point serves the static app and routes `/api/analyze-note` and `/api/send-reminder`.
4. If you want real email sending, add an email provider secret too: `RESEND_API_KEY`. Set `RESEND_FROM_EMAIL` if you want a custom sender; otherwise the app uses Resend's default onboarding sender.

For the deployment command, use Wrangler:

```bash
npx wrangler deploy
```

For local development, copy `.dev.vars.example` to `.dev.vars`, put your key there, and run:

```bash
npx wrangler dev
```

Never commit `.dev.vars` or paste the key in `app.js`. Use `API_KEY=` in `.dev.vars` if you want to match the Cloudflare secret name exactly.

The reminder button calls `functions/api/send-reminder.js`, which uses an email API when `RESEND_API_KEY` is available and falls back to a demo response otherwise.

This deployment supports both pasted text and photo/image uploads. Set `GROQ_TEXT_MODEL` for text analysis if you want, and `GROQ_VISION_MODEL` for image analysis. By default, text uses `openai/gpt-oss-120b` and images use a vision-capable Groq model.

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

Home → Add a doctor's note → Camera / Photos / Files → Analyze note with AI → timeline → set reminders → preview email.

Use only made-up sample notes for the demo; do not upload real medical records. The generated plan is not medical advice, and the message button is simulated.
