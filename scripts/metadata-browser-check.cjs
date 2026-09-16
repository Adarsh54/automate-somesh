const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const root = process.env.FIXTURES || "/tmp/cuestamp-fixtures";
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true }),
    page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(
    process.env.CUESTAMP_URL || "http://127.0.0.1:5173/cuestamp/",
  );
  const saved = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("cuestamp-v1")));
  const ready = () =>
    page.waitForFunction(() => !document.querySelector("#cancel-analysis"));
  async function fill(selector, value) {
    const el = page.locator(selector).last();
    await el.evaluate((el) => {
      for (let n = el.parentElement; n; n = n.parentElement)
        if (n.tagName === "DETAILS") n.open = true;
    });
    await el.fill(value);
    await el.dispatchEvent("change");
  }
  assert.equal(await page.locator('[data-field="rate"]').count(), 0);
  assert.equal(await page.locator('[data-field="startTimecode"]').count(), 0);
  assert.equal(await page.locator("[data-upload]").count(), 0);
  await page.screenshot({ path: "/tmp/cuestamp-ux-start.png", fullPage: true });
  await page.locator("#movie-upload").setInputFiles(`${root}/movie.mp4`);
  await ready();
  let s = await saved();
  assert.equal(s.movieMetadata.duration, 600);
  assert.equal(s.movieOffset, "00:00:00:00");
  assert.equal(s.production.rate, "24");
  assert.equal(s.production.duration, "");
  assert.match(await page.locator(".metadata-summary").innerText(), /00:10:00/);
  assert.match(await page.locator(".metadata-summary").innerText(), /assumed/);
  assert.equal(
    await page.locator('[data-field="movieOffset"]').isVisible(),
    false,
  );
  assert.equal(await page.locator('[data-field="startTimecode"]').count(), 0);
  assert.equal(await page.locator("[data-upload]").isVisible(), true);
  await fill('[data-field="movieOffset"]', "00:59:55:00");
  await fill('[data-field="trimStart"]', "5");
  assert.match(await page.locator(".metadata-summary").innerText(), /00:09:55/);
  await page.locator('.nav[data-tab="production"]').click();
  assert.match(await page.locator("#production").innerText(), /01:00:00:00/);
  await fill('[data-field="duration"]', "00:08:00");
  await page.locator('.nav[data-tab="library"]').click();
  await page.locator('[data-mode="offset"]').click();
  assert.equal(await page.locator("#movie-upload").count(), 0);
  assert.equal(await page.locator("#movie-settings").count(), 0);
  await page.locator('.nav[data-tab="production"]').click();
  assert.equal(await page.locator('[data-field="title"]').inputValue(), "");
  assert.equal(await page.locator('[data-field="duration"]').inputValue(), "");
  assert.equal(
    await page.locator('[data-field="startTimecode"]').inputValue(),
    "",
  );
  await page.locator('.nav[data-tab="library"]').click();
  await page.locator('[data-mode="manual"]').click();
  assert.equal(await page.locator("#analyze").count(), 0);
  assert.equal(await page.locator("#offset-settings").count(), 0);
  await page.locator('[data-mode="movie"]').click();
  assert.match(await page.locator(".metadata-summary").innerText(), /00:08:00/);
  await page.locator("#movie-upload").setInputFiles(`${root}/movie25.mov`);
  await ready();
  s = await saved();
  assert.equal(s.production.rate, "25");
  assert.equal(s.movieOffset, "01:00:00:00");
  assert.equal(s.movieMetadata.duration, 4);
  assert.deepEqual(s.movieOverrides, {});
  assert.match(
    await page.locator(".metadata-summary").innerText(),
    /Embedded QuickTime/,
  );
  await page.locator("#movie-upload").setInputFiles(`${root}/movie-df.mov`);
  await ready();
  s = await saved();
  assert.equal(s.production.rate, "29.97df");
  assert.equal(s.movieOffset, "01:00:00;00");
  await page.locator("#movie-upload").setInputFiles(`${root}/movie-vfr.mp4`);
  await ready();
  s = await saved();
  assert.equal(s.movieMetadata.variable, true);
  assert.equal(s.movieOffset, "00:00:00:00");
  assert.match(
    await page.locator(".metadata-summary").innerText(),
    /Variable frame rate/,
  );
  await page.locator("#movie-upload").setInputFiles(`${root}/movie.mp4`);
  await ready();
  s = await saved();
  assert.equal(s.movieOffset, "00:59:55:00");
  assert.equal(s.movieOverrides.duration, "00:08:00");
  await page.screenshot({ path: "/tmp/cuestamp-ux-movie.png", fullPage: true });
  await page.locator('[data-mode="offset"]').click();
  await page
    .locator("[data-upload]")
    .setInputFiles([`${root}/cue-a.wav`, `${root}/cue-b.wav`]);
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem("cuestamp-v1")).tracks.length === 2,
  );
  await ready();
  assert.equal(
    await page.locator("[data-track-offset] input:visible").count(),
    2,
  );
  assert.equal(await page.locator('[data-field="duration"]').count(), 0);
  assert.equal(await page.locator('[data-field="startTimecode"]').count(), 0);
  await page.screenshot({ path: "/tmp/cuestamp-ux-offset.png", fullPage: true });
  const offsets = await page.locator("[data-track-offset] input").all();
  for (const [i, el] of offsets.entries()) {
    await el.fill(i ? "01:01:00:00" : "01:00:00:00");
    await el.dispatchEvent("change");
  }
  await page.locator("#analyze").click();
  await ready();
  await page.locator('.nav[data-tab="cues"]').click();
  await page.locator("#confirm-detections").click();
  for (const el of await page.locator('[data-field="usage"]').all())
    await el.selectOption("BI");
  for (const cue of await page.locator("[data-cue]").all()) {
    const cueId = await cue.getAttribute("data-cue");
    await cue.locator("[data-override-credits]").click();
    for (const [selector, value] of [
      ['[data-credit="0"] [data-field="last"]', "Writer"],
      ['[data-credit="0"] [data-field="pro"]', "BMI"],
      ['[data-credit="0"] [data-field="share"]', "100"],
      ['[data-credit="1"] [data-field="name"]', "Publisher"],
      ['[data-credit="1"] [data-field="pro"]', "BMI"],
      ['[data-credit="1"] [data-field="share"]', "100"],
    ])
      await fill(`[data-cue="${cueId}"] ${selector}`, value);
  }
  await page.locator('.nav[data-tab="production"]').click();
  await fill('[data-field="title"]', "Audio-only project");
  await page.locator('.nav[data-tab="review"]').click();
  assert.equal(await page.locator("#export").isEnabled(), true);
  assert.match(await page.locator("#export").innerText(), /draft/);
  assert.match(
    await page.locator(".notice").innerText(),
    /Full show duration is unknown/,
  );
  const download = page.waitForEvent("download");
  await page.locator("#export").click();
  await (await download).saveAs("/tmp/cuestamp-unknown-production.xlsx");
  await page.locator('.nav[data-tab="library"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS UX: upload-first movie flow, inferred duration/title/rate, fallback origin, pre-roll, QuickTime 25/DF timecode, VFR warning, path-specific visibility, unknown audio-only film fields, replacement/reset/restored overrides, all offsets visible, mobile layout",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
