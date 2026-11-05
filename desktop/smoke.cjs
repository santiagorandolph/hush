const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'hush-smoke-'));
  let client;
  const requests = [];
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'hush://app');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.end(); return; }
    let body = '';
    req.on('data', data => { body += data; });
    req.on('end', () => {
      requests.push({ url: req.url, body });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(req.url === '/api/tags' ? { models: [{ name: 'smoke-model' }] } : {
        message: { content: JSON.stringify({ title: 'Test insight', lessons: ['I keep the useful lesson.'] }) }
      }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const launch = async () => {
    client = await electron.launch({
      ...(process.env.HUSH_EXECUTABLE ? { executablePath: process.env.HUSH_EXECUTABLE, args: [] } : { args: [path.resolve(__dirname, '..')] }),
      env: { ...process.env, HUSH_TEST_PROFILE: profile }
    });
    const page = await client.firstWindow();
    await page.waitForSelector('#new-entry', { state: 'attached' });
    return page;
  };
  try {
    let page = await launch();
    assert.equal(await page.evaluate(() => typeof require), 'undefined');
    assert.equal(await page.evaluate(() => location.origin), 'hush://app');
    assert.equal(await page.evaluate(async () => (await fetch('hush://app/package.json')).status), 404);
    await page.click('#settings-btn');
    await page.fill('#endpoint-input', `http://127.0.0.1:${server.address().port}`);
    await page.fill('#model-input', 'smoke-model');
    await page.click('#settings-save');
    await page.click('#new-entry');
    await page.fill('#entry-title', 'Desktop smoke entry');
    await page.fill('#entry-body', 'This synthetic entry tests the desktop journal without using personal data.');
    await page.click('#distill-btn');
    await page.waitForFunction(() => document.querySelector('.lesson-input').value === 'I keep the useful lesson.');
    await page.click('#seal-btn');
    await page.waitForSelector('#cards article');
    assert.ok(requests.some(r => r.url === '/api/chat' && r.body.includes('synthetic entry')));
    await client.close(); client = null;
    page = await launch();
    await page.waitForSelector('#cards article');
    assert.match(await page.textContent('#cards'), /Desktop smoke entry/);
    await page.click('#cards article');
    await page.click('#forget-now');
    await page.click('#forget-now');
    await page.waitForSelector('#forgotten-panel', { state: 'visible' });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('hush:entries:v1'))[0].body), null);
    await page.click('#detail-done');
    const destination = path.join(profile, 'export.json');
    await client.evaluate(({ session }, destination) => {
      session.defaultSession.on('will-download', (_event, item) => item.setSavePath(destination));
    }, destination);
    await page.click('#settings-btn');
    await page.click('#export-btn');
    for (let i = 0; i < 100; i++) {
      try { JSON.parse(await fs.readFile(destination, 'utf8')); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    const exported = await fs.readFile(destination, 'utf8');
    assert.ok(!exported.includes('This synthetic entry'));
    assert.ok(exported.includes('I keep the useful lesson.'));
    await page.click('#settings-close');
    if (process.env.HUSH_SCREENSHOT) await page.screenshot({ path: process.env.HUSH_SCREENSHOT });
    await client.close(); client = null;
    page = await launch();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('hush:entries:v1'))[0].body), null);
    console.log('PASS: desktop isolation, asset allowlist, local model requests, save, restart persistence, forget, export, and forgotten-state persistence.');
  } finally {
    if (client) await client.close();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
