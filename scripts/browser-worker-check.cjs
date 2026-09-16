// Verify against a production build (vite preview or deployed Pages).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
function wav(duration, amplitude) {
  const rate = 48000, count = Math.round(rate * duration), bytes = Buffer.alloc(44 + count * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) bytes.writeInt16LE(Math.round(32767 * amplitude * Math.sin(2 * Math.PI * 200 * i / rate)), 44 + i * 2);
  return bytes;
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const Native = Worker;
    window.Worker = class extends Native {
      constructor(...args) { if (window.injectFailure === 'start') throw new Error('private internal detail'); super(...args); }
      postMessage(...args) {
        const failure = window.injectFailure;
        if (failure === 'send') throw new Error('private internal detail');
        if (failure === 'runtime') return setTimeout(() => this.dispatchEvent(new ErrorEvent('error', { message: 'private internal detail', cancelable: true })), 10);
        if (failure === 'message') return setTimeout(() => this.dispatchEvent(new MessageEvent('messageerror')), 10);
        if (failure === 'analysis') return setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { type: 'error', message: 'private internal detail' } })), 10);
        if (failure === 'quietRestart') {
          args[0].tracks = args[0].tracks.map(track => ({...track, samples: new Float32Array(track.samples.length)}));
        }
        super.postMessage(...args);
      }
    };
  });
  let missingRequests = 0;
  await page.route('**/assets/analysis.worker-*.js', route => {
    missingRequests++; return route.fulfill({ status: 404, contentType: 'text/html', body: 'Not found' });
  });
  await page.goto(process.env.CUEBOOK_URL || 'http://127.0.0.1:5174/automate-somesh/');
  const ready = () => page.waitForFunction(() => !document.querySelector('#cancel-analysis'), null, {timeout:10000});
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('cuebook-v1')));
  await page.locator('[data-mode="offset"]').click();
  for (const [name, seconds, volume] of [['quiet', 2, .01], ['silent', 1, 0], ['short', .2, .5], ['loud', 2, .5]]) {
    console.log('Checking source:', name);
    await page.locator('[data-upload]').first().setInputFiles({ name: `${name}.wav`, mimeType: 'audio/wav', buffer: wav(seconds, volume) }); await ready();
    const offset = page.locator('[data-field="offset"]').last(); await offset.fill('01:00:00:00'); await offset.dispatchEvent('change');
    await page.locator('#analyze').click(); await ready();
    assert.equal((await saved()).cues.length, name === 'loud' ? 1 : 0);
    if (name !== 'loud') assert.match(await page.locator('.notice').textContent(), /Analysis completed: no music regions/);
  }
  const previous = (await saved()).cues;
  for (const failure of ['start', 'send', 'runtime', 'message', 'analysis']) {
    console.log('Checking failure:', failure);
    await page.evaluate(value => window.injectFailure = value, failure);
    await page.locator('#analyze').click(); await ready();
    assert.deepEqual((await saved()).cues, previous);
    const notice = await page.locator('.notice').textContent();
    assert.match(notice, /Existing cues were kept/); assert.doesNotMatch(notice, /private internal detail|undefined/);
    assert.equal(await page.locator('#analyze').isEnabled(), true);
  }
  await page.evaluate(() => window.injectFailure = null);
  await page.locator('#analyze').click(); await ready(); assert.equal((await saved()).cues.length, 1);
  // A zero-result restart is valid, and replaces only this workflow's detections.
  await page.evaluate(() => window.injectFailure = 'quietRestart');
  await page.locator('#analyze').click(); await ready(); assert.equal((await saved()).cues.length, 0);
  assert.match(await page.locator('.notice').textContent(), /Analysis completed: no music regions/);
  assert.equal(missingRequests, 0, 'Production analysis must not request a deploy-sensitive worker asset');
  assert.deepEqual(errors, []);
  console.log('PASS production worker: no separate asset fetch; quiet/silent/short initial+restart; worker start/send/runtime/message/analysis failures preserve cues and recover safely');
  await browser.close();
})();
