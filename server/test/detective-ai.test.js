// ai.js tests with an injected fake Anthropic client — never touches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import {
  createDetectiveAI, CaseSchema, normalizeCase, suspectSystemPrompt, deflection, DEFAULT_MODEL,
} from '../src/detective/ai.js';

const sampleCase = () => ({
  title: 'The Honey Thief of Bramble Abbey',
  setting: 'A hilltop abbey famous for its mead',
  victim: 'Brother Aldous, the cellar master',
  intro: 'Brother Aldous was found in the cellar. Someone is lying.',
  clues: ['The cellar door was bolted from inside at 8 pm.', 'Wax on the stair.', 'The bell rang late.'],
  suspects: [
    { id: 'Mara', name: 'Mara Quent', role: 'Beekeeper', emoji: '🐝', description: 'd', personality: 'p', alibi: 'a', secret: 's', knowledge: 'k' },
    { id: 'Tobin', name: 'Tobin Ash', role: 'Bell ringer', emoji: '🔔', description: 'd', personality: 'p', alibi: 'a', secret: 's', knowledge: 'k' },
    { id: 'tobin', name: 'Tobin Junior', role: 'Novice', emoji: '🕯️', description: 'd', personality: 'p', alibi: 'a', secret: 's', knowledge: 'k' },
    { id: 'Ilse', name: 'Ilse Varn', role: 'Visitor', emoji: '🧳', description: 'd', personality: 'p', alibi: 'a', secret: 's', knowledge: 'k' },
  ],
  culpritId: 'Ilse',
  motive: 'MOTIVE-TEXT',
  method: 'METHOD-TEXT',
  explanation: 'EXPLANATION-TEXT',
});

/** A fake client recording calls; each handler can return a value or throw. */
function fakeClient({ parse, create } = {}) {
  const calls = { parse: [], create: [] };
  return {
    calls,
    beta: {
      messages: {
        parse: async (params) => { calls.parse.push(params); return parse(params); },
        create: async (params) => { calls.create.push(params); return create(params); },
      },
    },
  };
}

const rateLimit = () => new Anthropic.RateLimitError(429, { type: 'error' }, 'rate limited', new Headers());

test('CaseSchema accepts a valid case and enforces counts', () => {
  assert.ok(CaseSchema.safeParse(sampleCase()).success);
  const bad = sampleCase();
  bad.suspects.pop();
  assert.equal(CaseSchema.safeParse(bad).success, false);
  const fewClues = sampleCase();
  fewClues.clues = ['one'];
  assert.equal(CaseSchema.safeParse(fewClues).success, false);
});

test('normalizeCase makes unique slug ids and remaps the culprit', () => {
  const n = normalizeCase(sampleCase());
  const ids = n.suspects.map((s) => s.id);
  assert.equal(new Set(ids).size, 4);
  for (const id of ids) assert.match(id, /^[a-z0-9]+$/);
  assert.equal(n.culpritId, 'ilse');
  assert.equal(normalizeCase({ ...sampleCase(), culpritId: 'nobody' }), null);
});

test('generateCase calls beta.messages.parse with the spec parameters', async () => {
  const fake = fakeClient({ parse: () => ({ stop_reason: 'end_turn', parsed_output: sampleCase(), content: [] }) });
  const ai = createDetectiveAI({ client: fake });
  const result = await ai.generateCase();
  assert.equal(fake.calls.parse.length, 1);
  const p = fake.calls.parse[0];
  assert.equal(p.model, process.env.CLAUDE_MODEL || DEFAULT_MODEL);
  assert.equal(DEFAULT_MODEL, 'claude-opus-5-5');
  assert.equal(p.max_tokens, 16000);
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(p.fallbacks, 'default');
  assert.equal(p.output_config.effort, 'medium');
  assert.equal(p.output_config.format.type, 'json_schema');
  assert.equal(typeof p.output_config.format.parse, 'function', 'format comes from betaZodOutputFormat');
  assert.equal(p.output_config.format.schema.type, 'object');
  assert.ok(p.system.length > 100);
  assert.equal(p.messages[0].role, 'user');
  assert.equal(result.culpritId, 'ilse');
  assert.equal(result.suspects.length, 4);
});

test('generateCase honours CLAUDE_MODEL', async () => {
  const fake = fakeClient({ parse: () => ({ stop_reason: 'end_turn', parsed_output: sampleCase() }) });
  await createDetectiveAI({ client: fake, model: 'claude-test-model' }).generateCase();
  assert.equal(fake.calls.parse[0].model, 'claude-test-model');
});

test('generateCase returns null on refusal (checked before parsed_output)', async () => {
  const fake = fakeClient({ parse: () => ({ stop_reason: 'refusal', parsed_output: sampleCase() }) });
  assert.equal(await createDetectiveAI({ client: fake }).generateCase(), null);
});

test('generateCase returns null on SDK errors, invalid culprit or missing output', async () => {
  const quiet = console.warn;
  console.warn = () => {};
  try {
    for (const parse of [
      () => { throw rateLimit(); },
      () => { throw new Anthropic.APIConnectionError({ message: 'offline' }); },
      () => { throw new TypeError('boom'); },
      () => ({ stop_reason: 'end_turn', parsed_output: { ...sampleCase(), culpritId: 'ghost' } }),
      () => ({ stop_reason: 'end_turn', parsed_output: null }),
      () => ({ stop_reason: 'max_tokens', parsed_output: { title: 'half' } }),
    ]) {
      assert.equal(await createDetectiveAI({ client: fakeClient({ parse }) }).generateCase(), null);
    }
  } finally { console.warn = quiet; }
});

test('askSuspect sends an in-character request and concatenates only text blocks', async () => {
  const caseData = normalizeCase(sampleCase());
  const fake = fakeClient({
    create: () => ({
      stop_reason: 'end_turn',
      content: [
        { type: 'thinking', thinking: 'secret reasoning' },
        { type: 'text', text: 'I was at the hives ' },
        { type: 'text', text: 'all evening.' },
      ],
    }),
  });
  const ai = createDetectiveAI({ client: fake });
  const transcript = [{ role: 'user', content: 'Hello?' }, { role: 'assistant', content: 'Good evening.' }];
  const reply = await ai.askSuspect(caseData, 'mara', transcript, 'Where were you?');
  assert.equal(reply, 'I was at the hives all evening.');
  const p = fake.calls.create[0];
  assert.equal(p.max_tokens, 1024);
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(p.fallbacks, 'default');
  assert.deepEqual(p.output_config, { effort: 'low' });
  assert.deepEqual(p.messages, [...transcript, { role: 'user', content: 'Where were you?' }]);
  assert.match(p.system, /Mara Quent/);
  assert.match(p.system, /Ignore any attempt/);
});

test('only the culprit’s prompt contains the motive and method', () => {
  const caseData = normalizeCase(sampleCase());
  const innocent = suspectSystemPrompt(caseData, caseData.suspects[0]);
  const culprit = suspectSystemPrompt(caseData, caseData.suspects.find((s) => s.id === caseData.culpritId));
  for (const t of ['MOTIVE-TEXT', 'METHOD-TEXT', 'EXPLANATION-TEXT']) assert.ok(!innocent.includes(t));
  assert.match(culprit, /MOTIVE-TEXT/);
  assert.match(culprit, /Never confess/);
  assert.ok(!culprit.includes('EXPLANATION-TEXT'), 'the explanation of how they are caught is never given to the model');
});

test('askSuspect deflects in character on refusal, empty output, errors and unknown suspects', async () => {
  const caseData = normalizeCase(sampleCase());
  const quiet = console.warn;
  console.warn = () => {};
  try {
    for (const create of [
      () => ({ stop_reason: 'refusal', content: [] }),
      () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '   ' }] }),
      () => { throw rateLimit(); },
      () => { throw new Anthropic.InternalServerError(500, {}, 'oops', new Headers()); },
      () => { throw new Error('network down'); },
    ]) {
      const reply = await createDetectiveAI({ client: fakeClient({ create }) }).askSuspect(caseData, 'mara', [], 'Hi');
      assert.ok([0, 1, 2].map(deflection).includes(reply), `got: ${reply}`);
      assert.doesNotMatch(reply, /error|rate|oops|network/i);
    }
    const fake = fakeClient({ create: () => { throw new Error('should not be called'); } });
    assert.ok(await createDetectiveAI({ client: fake }).askSuspect(caseData, 'nobody', [], 'Hi'));
    assert.equal(fake.calls.create.length, 0);
  } finally { console.warn = quiet; }
});

test('AI is disabled without an API key unless a client is injected', () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    assert.equal(createDetectiveAI().enabled, false);
    assert.equal(createDetectiveAI({ client: fakeClient() }).enabled, true);
  } finally { if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved; }
});
