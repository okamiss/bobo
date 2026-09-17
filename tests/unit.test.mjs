import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
const require = createRequire(import.meta.url);
const { date, uploadInput } = require("../apps/api/dist/validation.js");
const {
  hashPassword,
  checkPassword,
  config,
  ossPrefix,
} = require("../apps/api/dist/config.js");
const source = ts.transpileModule(
  readFileSync(new URL("../apps/web/src/lib.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  },
).outputText;
const { age, daysSince, anniversaries, valueTicks, monthTicks } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
test("dates reject impossible calendar days and accept leap day", () => {
  assert.equal(date.safeParse("2025-02-29").success, false);
  assert.equal(date.safeParse("2024-02-29").success, true);
  assert.equal(date.safeParse("2026-13-01").success, false);
});
test("age and home-day calculations are timezone independent", () => {
  assert.equal(daysSince("2024-02-28", "2024-03-01"), 2);
  assert.equal(age("2024-01-14", "2026-09-14"), "2 岁 8 个月");
  assert.equal(age("2026-09-10", "2026-09-14"), "4 天");
  assert.equal(age("2026-09-20", "2026-09-14"), "");
});
test("anniversaries list the next celebrations in date order", () => {
  const brief = (list) => list.map((a) => [a.title, a.date, a.daysLeft]);
  const bobo = { birthday: "2026-05-15", homeDate: "2026-06-18" };
  assert.deepEqual(brief(anniversaries(bobo, "2026-09-17")), [
    ["到家第 100 天", "2026-09-25", 8],
    ["满 5 个月", "2026-10-15", 28],
    ["满 6 个月", "2026-11-15", 59],
  ]);
  assert.deepEqual(brief(anniversaries(bobo, "2026-09-25", 1)), [
    ["到家第 100 天", "2026-09-25", 0],
  ]);
  assert.deepEqual(
    brief(
      anniversaries(
        { birthday: null, homeDate: "2026-06-18" },
        "2027-06-01",
        2,
      ),
    ),
    [
      ["到家 1 周年", "2027-06-18", 17],
      ["到家第 500 天", "2027-10-30", 151],
    ],
  );
  assert.deepEqual(anniversaries({ birthday: null, homeDate: null }), []);
});
test("anniversaries at month end agree with the age shown on the site", () => {
  const first = (birthday, at) =>
    anniversaries({ birthday, homeDate: null }, at, 1)[0];
  // Jan 31 has no Feb 31: one month is reached on Mar 1, as age() says.
  assert.equal(first("2024-01-31", "2024-02-01").date, "2024-03-01");
  assert.equal(age("2024-01-31", "2024-02-29"), "29 天");
  assert.equal(age("2024-01-31", "2024-03-01"), "1 个月");
  // A leap-day birthday turns one on Mar 1 in a common year.
  const leap = anniversaries(
    { birthday: "2024-02-29", homeDate: null },
    "2025-02-01",
  );
  assert.deepEqual(leap.find((a) => a.title === "1 岁生日").date, "2025-03-01");
  assert.equal(age("2024-02-29", "2025-02-28"), "11 个月");
  assert.equal(age("2024-02-29", "2025-03-01"), "1 岁");
});
test("growth chart axes use round values and month starts", () => {
  assert.deepEqual(valueTicks(5.6), [0, 2, 4, 6]);
  assert.deepEqual(valueTicks(6), [0, 2, 4, 6]);
  assert.deepEqual(valueTicks(34.5), [0, 10, 20, 30, 40]);
  assert.deepEqual(valueTicks(0.9), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(monthTicks("2026-06-18", "2026-09-17"), [
    "2026-07-01",
    "2026-08-01",
    "2026-09-01",
  ]);
  assert.deepEqual(monthTicks("2026-06-01", "2026-06-20"), ["2026-06-01"]);
  assert.deepEqual(monthTicks("2026-09-02", "2026-09-17"), []);
  assert.deepEqual(monthTicks("2026-01-15", "2027-01-15", 4), [
    "2026-02-01",
    "2026-05-01",
    "2026-08-01",
    "2026-11-01",
  ]);
});
test("upload limits distinguish images and video and reject unsupported MIME", () => {
  const input = {
    entryId: "11111111-1111-4111-8111-111111111111",
    name: "test.png",
    mime: "image/png",
    size: 21 * 1024 * 1024,
  };
  assert.equal(uploadInput.safeParse(input).success, false);
  assert.equal(
    uploadInput.safeParse({ ...input, mime: "video/mp4" }).success,
    true,
  );
  assert.equal(
    uploadInput.safeParse({ ...input, mime: "image/heic", size: 100 }).success,
    false,
  );
  assert.equal(
    uploadInput.safeParse({ ...input, entryId: null, size: 100 }).success,
    true,
  );
});
test("password hashes use unique salts and verify exact input", () => {
  const one = hashPassword("example-test-only"),
    two = hashPassword("example-test-only");
  assert.notEqual(one, two);
  assert.equal(checkPassword("example-test-only", one), true);
  assert.equal(checkPassword("wrong", one), false);
});
test("OSS fails closed when configuration is missing", () => {
  const before = { ...process.env };
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://test",
    SESSION_SECRET: "a".repeat(32),
    APP_ORIGIN: "http://localhost:8080",
    STORAGE_DRIVER: "oss",
  });
  delete process.env.OSS_REGION;
  assert.throws(() => config(), /OSS/);
  process.env = before;
});
test("OSS prefix is normalized to a folder and rejects unsafe paths", () => {
  assert.equal(ossPrefix("bobo"), "bobo/");
  assert.equal(ossPrefix("/sites/bobo/"), "sites/bobo/");
  assert.equal(ossPrefix(""), "");
  assert.throws(() => ossPrefix("../bobo"), /OSS_PREFIX/);
  assert.throws(() => ossPrefix("bo bo"), /OSS_PREFIX/);
});
