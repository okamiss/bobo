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
const { age, daysSince } = await import(
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
