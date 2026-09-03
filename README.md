# PrepPal prototype

A mobile-first career-fair demo showing how a photo of a handwritten medical-procedure note could become a clear preparation timeline and email reminder.

## AI setup

The image-to-plan feature uses a Cloudflare Pages Function, so your API key is never exposed in the browser.

1. Create your API key.
2. In your Cloudflare Pages project, add an encrypted secret named `API-Key` or `DUKEGPT_API_KEY`.
3. Deploy this folder as a Pages project. Cloudflare automatically maps `functions/api/analyze-note.js` to `/api/analyze-note`.
4. If you want real email sending, add an email provider secret too: `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.

For the deployment command, use Cloudflare Pages tooling:

```bash
npx wrangler pages deploy .
```

Do not use `npx wrangler deploy` for this repo, because that targets a Worker and does not deploy the Pages site correctly.

For local development, copy `.dev.vars.example` to `.dev.vars`, put your key there, and run:

```bash
npx wrangler pages dev .
```

Never commit `.dev.vars` or paste the key in `app.js`. Use `API-Key=` in `.dev.vars` if you want to match the Pages secret name exactly.

The reminder button calls `functions/api/send-reminder.js`, which uses an email API when those secrets are available and falls back to a demo response otherwise.

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
