import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { validateFindings, analyzeChat } from '../src/analyze.js';
import { createApp } from '../src/server.js';

test('displayed excerpts must appear in the source', () => {
  const source = 'Mira: I can do Saturday after 6.\nLee: Sunday works better for me.';
  const result = validateFindings({
    quotes: ['I can do Saturday after 6.', 'Everyone agreed on Saturday'],
    unclear: ['Which day works for everyone?'],
    question: 'Would Saturday or Sunday work better for everyone?'
  }, source);
  assert.deepEqual(result.quotes, ['I can do Saturday after 6.']);
  assert.equal(result.discarded, 1);
  assert.match(result.unclear[0], /Which day/);
});

test('model request uses Gemma and validates its response', async () => {
  let request;
  const fetcher = async (_url, init) => {
    request = JSON.parse(init.body);
    return { ok: true, json: async () => ({ message: { content: JSON.stringify({ quotes: [], unclear: ['Time is missing'], question: 'What time works?' }) } }) };
  };
  const result = await analyzeChat('A: Saturday is possible. B: I can join later.', { fetcher });
  assert.equal(request.model, 'gemma2:2b-instruct-q3_K_S');
  assert.equal(request.stream, false);
  assert.equal(result.question, 'What time works?');
});

test('API rejects short input and accepts an analyzed chat', async () => {
  const app = createApp(async () => ({ quotes: [], unclear: ['Time'], question: 'What time?', discarded: 0, model: 'gemma2:2b-instruct-q3_K_S' }));
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${app.address().port}/api/analyze`;
  try {
    const bad = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat: 'Hi' }) });
    assert.equal(bad.status, 400);
    const good = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat: 'A: Saturday afternoon? B: I might be around.' }) });
    assert.equal(good.status, 200);
    assert.equal((await good.json()).question, 'What time?');
  } finally {
    app.close();
  }
});

test('HTTP flow drops an invented quote', async () => {
  const model = createApp();
  const ollama = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: { content: JSON.stringify({
      quotes: ['Saturday works for me', 'Everyone picked the cafe'],
      unclear: ['Which place should we use?'],
      question: 'Where should we meet?'
    }) } }));
  });
  await new Promise((resolve) => ollama.listen(0, '127.0.0.1', resolve));
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${ollama.address().port}`;
  await new Promise((resolve) => model.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${model.address().port}/api/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat: 'Mira: Saturday works for me, but where should we meet?' })
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(result.quotes, ['Saturday works for me']);
    assert.equal(result.discarded, 1);
    assert.equal(result.question, 'Where should we meet?');
  } finally {
    delete process.env.OLLAMA_BASE_URL;
    model.close();
    ollama.close();
  }
});
