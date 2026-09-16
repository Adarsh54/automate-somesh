// Run with PLAYWRIGHT_MODULE pointing to a Playwright installation.
// Fixtures: python scripts/generate-fixtures.py /tmp/cuebook-fixtures /path/to/ffmpeg
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const root = process.env.FIXTURES || "/tmp/cuebook-fixtures";
const url = process.env.CUEBOOK_URL || "http://127.0.0.1:5173/automate-somesh/";
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(url);
  async function fill(selector, value) {
    const control = page.locator(selector).last();
    await control.evaluate((el) => {
      for (let node = el.parentElement; node; node = node.parentElement)
        if (node.tagName === "DETAILS") node.open = true;
    });
    await control.fill(value);
    await control.dispatchEvent("change");
  }
  async function saved() {
    return page.evaluate(() => JSON.parse(localStorage.getItem("cuebook-v1")));
  }
  async function ready() {
    await page.waitForFunction(
      () => !document.querySelector("#cancel-analysis"),
    );
  }
  const started = Date.now();
  await page.locator("#movie-upload").setInputFiles(`${root}/movie.mp4`);
  await ready();
  assert.equal(
    await page.locator("#movie-preview").count(),
    1,
    await page.locator(".notice").allTextContents(),
  );
  await fill('[data-field="movieOffset"]', "00:59:55:00");
  await page
    .locator("[data-upload]")
    .setInputFiles([
      `${root}/cue-a.wav`,
      `${root}/cue-b.wav`,
      `${root}/unmatched.wav`,
    ]);
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem("cuebook-v1")).tracks.length === 3,
  );
  await ready();
  const decoded = Date.now();
  await page.locator("#analyze").click();
  await ready();
  let state = await saved();
  console.log(
    "MOVIE",
    JSON.stringify({
      totalSeconds: (Date.now() - started) / 1000,
      decodeSeconds: (decoded - started) / 1000,
      report: state.analysisReport,
      cues: state.cues.map((c) => [
        c.title,
        c.relativeStart,
        c.relativeEnd,
        c.start,
        c.end,
        c.score,
      ]),
    }),
  );
  const expected = JSON.parse(fs.readFileSync(`${root}/expected.json`));
  assert.equal(state.cues.length, 5, JSON.stringify(state.analysisReport));
  for (const title of ["cue-a", "cue-b"]) {
    const cues = state.cues.filter((c) => c.title === title);
    assert.equal(cues.length, expected[title].length);
    cues.forEach((c, i) => {
      assert.ok(Math.abs(c.relativeStart - expected[title][i][0]) < 0.2);
      assert.ok(Math.abs(c.relativeEnd - expected[title][i][1]) < 0.2);
    });
  }
  assert.equal(state.cues[0].start, "01:00:10:00");
  // Cancelling a rerun must leave all existing placements intact.
  await page.locator("#analyze").click();
  await page.locator("#cancel-analysis").click();
  await ready();
  assert.equal((await saved()).cues.length, 5);
  await page.locator('.nav[data-tab="cues"]').click();
  await page.screenshot({
    path: "/tmp/cuebook-movie-results.png",
    fullPage: true,
  });
  await page.locator("#confirm-detections").click();
  for (const select of await page.locator('[data-field="usage"]').all())
    await select.selectOption("BI");
  for (const cue of await page.locator("[data-cue]").all()) {
    const cueId = await cue.getAttribute("data-cue");
    for (const [selector, value] of [
      ['[data-credit="0"] [data-field="first"]', "Ada"],
      ['[data-credit="0"] [data-field="last"]', "Writer"],
      ['[data-credit="0"] [data-field="pro"]', "BMI"],
      ['[data-credit="0"] [data-field="share"]', "100"],
      ['[data-credit="1"] [data-field="name"]', "Example Publishing"],
      ['[data-credit="1"] [data-field="pro"]', "BMI"],
      ['[data-credit="1"] [data-field="share"]', "100"],
    ])
      await fill(`[data-cue="${cueId}"] ${selector}`, value);
  }
  await page.locator('.nav[data-tab="production"]').click();
  for (const [key, value] of Object.entries({
    title: "Matching fixture",
    company: "Test Studio",
    preparedBy: "Test Producer",
    email: "test@example.com",
  }))
    await fill(`[data-field="${key}"]`, value);
  await page.locator('.nav[data-tab="review"]').click();
  assert.equal(
    await page.locator("#export").isEnabled(),
    true,
    await page.locator(".issues").allTextContents(),
  );
  const download = page.waitForEvent("download");
  await page.locator("#export").click();
  await (await download).saveAs("/tmp/cuebook-matching.xlsx");
  assert.ok(fs.statSync("/tmp/cuebook-matching.xlsx").size > 50000);
  // Separate browser state for music-only offset and manual workflows.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('[data-mode="offset"]').click();
  await page.locator("[data-upload]").setInputFiles(`${root}/score.wav`);
  await ready();
  await page.locator("[data-track]").click();
  await fill('[data-field="offset"]', "00:59:55:00");
  await page.locator("#analyze").click();
  await ready();
  state = await saved();
  assert.equal(state.cues.length, 2);
  assert.equal(state.cues[0].start, "00:59:57:00");
  assert.equal(state.cues[1].start, "01:00:07:00");
  console.log(
    "OFFSET",
    JSON.stringify(state.cues.map((c) => [c.start, c.end])),
  );
  // A second file has an independent offset, and changing it rebases only its cues.
  await page.locator("[data-upload]").setInputFiles(`${root}/cue-b.wav`);
  await ready();
  await page.locator("[data-track]").last().click();
  await fill('[data-field="offset"]', "01:01:00:00");
  await page.locator("#analyze").click();
  await ready();
  state = await saved();
  assert.equal(state.cues.length, 3);
  assert.equal(state.cues.at(-1).start, "01:01:00:00");
  await fill('[data-field="offset"]', "01:02:00:00");
  state = await saved();
  assert.equal(state.cues.at(-1).start, "01:02:00:00");
  assert.equal(state.cues[0].start, "00:59:57:00");
  await page.locator('[data-mode="manual"]').click();
  await page.locator("[data-add-cue]").click();
  let cue = page.locator("[data-cue]").last();
  await cue.locator('[data-field="start"]').fill("01:00:12:12");
  await cue.locator('[data-field="start"]').dispatchEvent("change");
  await cue.locator('[data-field="end"]').fill("01:00:14:00");
  await cue.locator('[data-field="end"]').dispatchEvent("change");
  await cue.locator('[data-field="usage"]').selectOption("BV");
  assert.match(await cue.locator(".duration strong").innerText(), /1.500 s/);
  // Exercise offset-aware playback marks.
  await cue.locator("audio").evaluate((audio) => {
    audio.currentTime = 3.5;
  });
  await cue.locator("[data-mark-in]").click();
  state = await saved();
  assert.equal(state.cues.at(-1).start, "01:02:03:12");
  await page.locator('.nav[data-tab="library"]').click();
  await page.locator('[data-field="rate"]').evaluate((el) => {
    el.closest("details").open = true;
  });
  await page.locator('[data-field="rate"]').selectOption("25");
  state = await saved();
  assert.equal(state.cues.at(-1).start, "01:02:03:13");
  await page.reload();
  await page.locator('.nav[data-tab="cues"]').click();
  assert.equal(await page.locator("[data-cue]").count(), 4);
  await page.locator('.nav[data-tab="library"]').click();
  // Invalid media must produce an error and no new track.
  await page.locator("[data-upload]").setInputFiles({
    name: "broken.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("not an audio file"),
  });
  await ready();
  assert.match(await page.locator(".notice").innerText(), /Could not read/);
  assert.equal((await saved()).tracks.length, 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.nav[data-tab="library"]').click();
  await page.screenshot({
    path: "/tmp/cuebook-workflows-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 10-minute MP4/AAC decoding, repeat/excerpt/nonmatch analysis, file preroll, usage/credits/review/XLSX, silence offset, manual frame timing/marking, persistence, responsive layout, no browser exceptions",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
