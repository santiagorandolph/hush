'use strict';

const assert = require('node:assert');
const Engine = require('./engine.js');
const { buildExampleEntries } = require('./example.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (err) {
    failed++;
    console.error('  FAIL ' + name);
    console.error('       ' + err.message);
  }
}

const DAY = 86400000;
const NOW = Date.UTC(2026, 4, 1, 12, 0, 0);

console.log('\ndecay math');

test('maps spans to shelf lives', () => {
  assert.strictEqual(Engine.spanMs('week'), 7 * DAY);
  assert.strictEqual(Engine.spanMs('month'), 30 * DAY);
  assert.strictEqual(Engine.spanMs('year'), 365 * DAY);
  assert.strictEqual(Engine.spanInfo('nonsense').key, 'month');
});

test('computes decay progress between 0 and 1', () => {
  const entry = Engine.makeEntry({ createdAt: NOW - 15 * DAY, span: 'month', body: 'x' });
  assert.ok(Math.abs(Engine.decayProgress(entry, NOW) - 0.5) < 0.001);
  assert.strictEqual(Engine.decayProgress(entry, entry.createdAt - DAY), 0);
  assert.strictEqual(Engine.decayProgress(entry, entry.decayAt + DAY), 1);
});

test('purges expired bodies without mutating the original', () => {
  const fresh = Engine.makeEntry({ id: 'f', createdAt: NOW - 10 * DAY, span: 'month', body: 'fresh body', lessons: ['a'] });
  const expired = Engine.makeEntry({ id: 'x', createdAt: NOW - 40 * DAY, span: 'month', body: 'expired body', lessons: ['b'] });

  const result = Engine.applyDecay([fresh, expired], NOW);
  assert.strictEqual(result.changed, true);
  assert.strictEqual(result.entries[0].body, 'fresh body');
  assert.strictEqual(result.entries[1].body, null);
  assert.strictEqual(result.entries[1].forgottenAt, expired.decayAt);
  assert.strictEqual(expired.body, 'expired body');
});

test('does nothing when nothing has expired', () => {
  const entry = Engine.makeEntry({ createdAt: NOW - DAY, span: 'year', body: 'x' });
  const result = Engine.applyDecay([entry], NOW);
  assert.strictEqual(result.changed, false);
  assert.strictEqual(result.entries[0].body, 'x');
});

test('reports remaining time in human units', () => {
  assert.strictEqual(Engine.humanize(0), 'forgotten');
  assert.strictEqual(Engine.humanize(10 * DAY), '10 days');
  assert.strictEqual(Engine.humanize(20 * DAY), '3 weeks');
  assert.strictEqual(Engine.humanize(2 * 365 * DAY), '2 years');
});

test('labels an entry by what happens next', () => {
  const entry = Engine.makeEntry({ createdAt: NOW - 20 * DAY, span: 'month', body: 'x' });
  assert.strictEqual(Engine.decayLabel(entry, NOW), 'forgets in 10 days');
  assert.strictEqual(Engine.decayLabel(Engine.purgeNow(entry, NOW), NOW), 'raw entry forgotten');
});

console.log('\nentries and lessons');

test('builds an entry with fallbacks and sanitized fields', () => {
  const entry = Engine.makeEntry({
    createdAt: NOW,
    span: 'week',
    body: 'The first line is the title. The rest is detail.',
    lessons: [' Keep this ', 'keep this', '', null],
    tags: 'Work, #work, Boundaries'
  });
  assert.strictEqual(entry.title, 'The first line is the title');
  assert.deepStrictEqual(entry.lessons, ['Keep this']);
  assert.deepStrictEqual(entry.tags, ['work', 'boundaries']);
  assert.strictEqual(entry.decayAt, NOW + 7 * DAY);
});

test('caps lessons and tags', () => {
  const lessons = Engine.sanitizeLessons(['a', 'b', 'c', 'd', 'e']);
  assert.strictEqual(lessons.length, 4);
  const tags = Engine.sanitizeTags(['a', 'b', 'c', 'd', 'e', 'f']);
  assert.strictEqual(tags.length, 5);
});

test('forget now clears the body and records the moment', () => {
  const entry = Engine.makeEntry({ createdAt: NOW - DAY, span: 'month', body: 'secret', lessons: ['x'] });
  const gone = Engine.purgeNow(entry, NOW);
  assert.strictEqual(gone.body, null);
  assert.strictEqual(gone.forgottenAt, NOW);
  assert.deepStrictEqual(gone.lessons, ['x']);
});

console.log('\nsearch, tags, and export');

test('searches titles, lessons, tags, and live bodies only', () => {
  const live = Engine.makeEntry({ id: 'l', createdAt: NOW, span: 'month', body: 'a submarine story', lessons: ['stay curious'], tags: ['work'] });
  const gone = Engine.makeEntry({ id: 'g', createdAt: NOW, span: 'month', body: null, lessons: ['walk more'], tags: ['health'] });

  assert.strictEqual(Engine.searchEntries([live, gone], 'submarine').length, 1);
  assert.strictEqual(Engine.searchEntries([live, gone], 'submarine')[0].id, 'l');
  assert.strictEqual(Engine.searchEntries([live, gone], 'curious').length, 1);
  assert.strictEqual(Engine.searchEntries([live, gone], 'walk').length, 1);
  // The forgotten entry's old body cannot match, because it is gone.
  assert.strictEqual(Engine.searchEntries([gone], 'submarine').length, 0);
});

test('counts tags and summarizes the archive', () => {
  const entries = buildExampleEntries(NOW);
  const summary = Engine.summarize(entries);
  assert.strictEqual(summary.entries, 4);
  assert.strictEqual(summary.forgotten, 1);
  assert.strictEqual(summary.lessons, 6);
  const tags = Engine.tagCounts(entries);
  assert.strictEqual(tags[0].tag, 'work');
  assert.strictEqual(tags[0].count, 2);
});

test('exports remaining data and not forgotten bodies', () => {
  const entries = buildExampleEntries(NOW);
  const payload = JSON.parse(Engine.exportPayload(entries, NOW));
  assert.strictEqual(payload.app, 'hush');
  assert.strictEqual(payload.entries.length, 4);
  const forgotten = payload.entries.find((e) => e.id === 'sample-sunday');
  assert.strictEqual(forgotten.body, null);
  assert.deepStrictEqual(forgotten.lessons, ['A slow Sunday is maintenance, not laziness.']);
});

console.log('\nexample and model output');

test('example entries show fresh, fading, and forgotten states', () => {
  const entries = buildExampleEntries(NOW);
  const conference = entries.find((e) => e.id === 'sample-conference');
  assert.ok(Engine.decayProgress(conference, NOW) > 0.6);
  const sunday = entries.find((e) => e.id === 'sample-sunday');
  assert.strictEqual(sunday.body, null);
  assert.ok(sunday.lessons.length > 0);
  assert.ok(entries.every((e) => e.title && e.lessons.length));
});

test('parses fenced and prose-wrapped JSON', () => {
  assert.deepStrictEqual(Engine.parseModelJSON('```json\n{"lessons":["a"]}\n```'), { lessons: ['a'] });
  assert.deepStrictEqual(Engine.parseModelJSON('Sure: {"lessons":["b"]}'), { lessons: ['b'] });
  assert.throws(() => Engine.parseModelJSON('nope'), /readable JSON/i);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
if (failed) process.exitCode = 1;
