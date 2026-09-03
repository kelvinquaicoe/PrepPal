import { onRequestPost as onAnalyzeNote } from './functions/api/analyze-note.js';
import { onRequestPost as onSendReminder } from './functions/api/send-reminder.js';

const blockedPaths = new Set([
  '/worker.js',
  '/server.mjs',
  '/analyze-note.js',
  '/app-fixed.js',
  '/app2.js',
  '/README.md',
  '/wrangler.toml',
  '/.dev.vars',
  '/.dev.vars.example'
]);

function isBlockedPath(pathname) {
  return blockedPaths.has(pathname) || pathname.startsWith('/functions/');
}

function notFound() {
  return new Response('Not found', { status: 404 });
}

function methodNotAllowed() {
  return new Response('Method not allowed', {
    status: 405,
    headers: { allow: 'POST' }
  });
}

async function handleApi(request, env, pathname) {
  if (pathname === '/api/analyze-note') {
    if (request.method !== 'POST') {
      return methodNotAllowed();
    }

    return onAnalyzeNote({ request, env });
  }

  if (pathname === '/api/send-reminder') {
    if (request.method !== 'POST') {
      return methodNotAllowed();
    }

    return onSendReminder({ request, env });
  }

  return notFound();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url.pathname);
    }

    if (isBlockedPath(url.pathname)) {
      return notFound();
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    const indexRequest = new Request(new URL('/index.html', url), request);
    const indexResponse = await env.ASSETS.fetch(indexRequest);
    if (indexResponse.status !== 404) {
      return indexResponse;
    }

    return notFound();
  }
};
