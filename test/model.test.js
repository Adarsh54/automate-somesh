import test from "node:test";
import assert from "node:assert/strict";
import { seconds, duration, creditIssues, cueIssues } from "../src/model.js";
const track = {
  title: "Test cue",
  credits: [
    { role: "Composer", first: "A", last: "Writer", pro: "BMI", share: "100" },
    { role: "Publisher", name: "Test Publishing", pro: "BMI", share: "100" },
  ],
};
test("whole-second timestamps reject malformed or out-of-range values", () => {
  assert.equal(seconds("01:02:03"), 3723);
  assert.equal(seconds("00:60:00"), null);
  assert.equal(seconds("00:00:60"), null);
  assert.equal(seconds(""), null);
  assert.equal(seconds("1:2"), null);
});
test("cue duration requires both positions and strictly positive length", () => {
  assert.equal(duration({ start: "00:00:00", end: "00:01:05" }), 65);
  assert.equal(duration({ start: "", end: "00:01:05" }), null);
  assert.equal(duration({ start: "00:01:05", end: "00:01:05" }), null);
  assert.equal(duration({ start: "00:02:00", end: "00:01:05" }), null);
});
test("credits need names, PROs and separate 100 percent totals for each role", () => {
  assert.deepEqual(creditIssues(track), []);
  const copy = structuredClone(track);
  copy.credits[0].share = "50";
  assert.match(creditIssues(copy).join(" "), /Composer shares/);
  copy.credits[0].share = "";
  assert.match(creditIssues(copy).join(" "), /Complete composer/);
});
test("placement validates usage and production bounds", () => {
  assert.deepEqual(
    cueIssues({ start: "00:00:00", end: "00:01:05", usage: "BI" }, track, {
      duration: "00:02:00",
    }),
    [],
  );
  assert.match(
    cueIssues({ start: "00:00:00", end: "00:03:00", usage: "" }, track, {
      duration: "00:02:00",
    }).join(" "),
    /Choose usage.*ends after/,
  );
});
