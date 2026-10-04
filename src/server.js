import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeChat } from './analyze.js';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const pages = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']]
]);

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16000) {
      throw new Error('Paste a shorter conversation (up to 12,000 characters).');
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('The request must contain valid JSON.');
  }
}

export function createApp(analyze = analyzeChat) {
  return createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/analyze') {
      try {
        const payload = await readJson(req);
        const chat = typeof payload?.chat === 'string' ? payload.chat.trim() : '';
        if (chat.length < 25 || chat.length > 12000) {
          return json(res, 400, { error: 'Paste a conversation between 25 and 12,000 characters.' });
        }
        return json(res, 200, await analyze(chat));
      } catch (error) {
        const isInputError = error.message.startsWith('Paste ') || error.message.startsWith('The request');
        return json(res, isInputError ? 400 : 503, { error: isInputError ? error.message : `Analysis failed. ${error.message}` });
      }
    }

    if (req.method === 'GET' && req.url === '/api/health') {
      return json(res, 200, { status: 'ok' });
    }

    const page = req.method === 'GET' ? pages.get(req.url) : null;
    if (!page) {
      return json(res, 404, { error: 'Page not found.' });
    }
    try {
      const content = await readFile(join(publicDir, page[0]));
      res.writeHead(200, { 'content-type': page[1], 'cache-control': 'no-store' });
      res.end(content);
    } catch {
      json(res, 500, { error: 'Page unavailable.' });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, '0.0.0.0', () => {
    console.log(`The One Missing Question is ready at http://localhost:${port}`);
  });
}
