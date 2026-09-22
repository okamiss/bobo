import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
const require = createRequire(import.meta.url);
const {
  date,
  uploadInput,
  healthRecordInput,
  aiQuotaInput,
} = require("../apps/api/dist/validation.js");
const {
  hashPassword,
  checkPassword,
  config,
  ossPrefix,
  ai,
} = require("../apps/api/dist/config.js");
const { read: readDraft, startOfToday } = require("../apps/api/dist/ai.js");
const { tools, runTool } = require("../apps/api/dist/retriever.js");
const source = ts.transpileModule(
  readFileSync(new URL("../apps/web/src/lib.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  },
).outputText;
const {
  age,
  daysSince,
  anniversaries,
  valueTicks,
  monthTicks,
  healthReminder,
  postedTime,
  moveToFront,
  mergeMedia,
  withDraft,
  draftOf,
  afterSave,
} = await import(
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
test("health records validate dates and reminders use the 7-day window", () => {
  const record = {
    kind: "vaccine",
    occurredOn: "2026-08-01",
    nextDueOn: "2026-07-31",
    note: "",
  };
  assert.equal(healthRecordInput.safeParse(record).success, false);
  assert.equal(
    healthRecordInput.safeParse({ ...record, nextDueOn: null }).success,
    true,
  );
  assert.deepEqual(healthReminder(null, "2026-09-17"), {
    status: "none",
    days: null,
    text: "未设置下次时间",
  });
  assert.equal(healthReminder("2026-09-16", "2026-09-17").status, "overdue");
  assert.equal(healthReminder("2026-09-17", "2026-09-17").status, "today");
  assert.equal(healthReminder("2026-09-24", "2026-09-17").status, "soon");
  assert.equal(healthReminder("2026-09-25", "2026-09-17").status, "later");
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

const draft = {
  titles: ["剪毛的下午", "变身小帅哥"],
  body: "今天带啵啵去剪毛。",
  tags: ["美容"],
  captions: ["刚洗完澡"],
};
test("AI writing help stays off until a key is configured", () => {
  const before = { ...process.env };
  delete process.env.DEEPSEEK_API_KEY;
  assert.equal(ai(), null);
  process.env.DEEPSEEK_API_KEY = "   ";
  assert.equal(ai(), null, "a blank key counts as unconfigured");
  process.env.DEEPSEEK_API_KEY = "key";
  assert.deepEqual(ai(), {
    key: "key",
    base: "https://api.deepseek.com",
    model: "deepseek-flash",
  });
  process.env.AI_BASE_URL = "http://stub:8791/";
  process.env.AI_MODEL = "other-model";
  assert.deepEqual(ai(), {
    key: "key",
    base: "http://stub:8791",
    model: "other-model",
  });
  process.env.AI_BASE_URL = "stub:8791";
  assert.throws(() => ai(), /AI_BASE_URL/);
  process.env = before;
});
test("a model reply is only accepted when it is a usable draft", () => {
  assert.equal(readDraft(JSON.stringify(draft)).success, true);
  assert.deepEqual(readDraft(JSON.stringify(draft)).data.titles, draft.titles);
  // DeepSeek documents that JSON mode can come back empty, and models like to
  // wrap answers in code fences.
  assert.equal(readDraft("").success, false);
  assert.equal(readDraft("这不是 json").success, false);
  const fenced = ["```json", JSON.stringify(draft), "```"].join("\n");
  assert.equal(readDraft(fenced).success, true);
  assert.equal(
    readDraft(JSON.stringify({ ...draft, titles: [] })).success,
    false,
  );
  assert.equal(
    readDraft(JSON.stringify({ ...draft, body: "" })).success,
    false,
  );
  assert.equal(
    readDraft(JSON.stringify({ ...draft, titles: ["a".repeat(151)] })).success,
    false,
  );
  assert.equal(
    readDraft(JSON.stringify({ ...draft, tags: ["a".repeat(31)] })).success,
    false,
  );
});
test("the daily quota resets on the Shanghai day boundary", () => {
  // 2026-09-22 01:00 in Shanghai is still 2026-09-21 in UTC.
  const start = startOfToday(new Date("2026-09-21T17:00:00Z"));
  assert.equal(start.toISOString(), "2026-09-21T16:00:00.000Z");
  assert.equal(
    startOfToday(new Date("2026-09-21T15:59:00Z")).toISOString(),
    "2026-09-20T16:00:00.000Z",
  );
});

test("the chat can only reach the family journal, never the accounts", async () => {
  const names = tools.map((t) => t.function.name).sort();
  assert.deepEqual(names, [
    "bobo_profile",
    "get_story",
    "growth_records",
    "health_records",
    "on_this_day",
    "search_stories",
  ]);
  // Nothing about accounts, sessions, passwords or the audit log is offered.
  const surface = JSON.stringify(tools);
  for (const word of ["account", "session", "password", "audit", "admin"])
    assert.equal(surface.includes(word), false, `工具不应暴露 ${word}`);
});
test("tool arguments from the model are validated before any query runs", async () => {
  await assert.rejects(() => runTool("drop_database", {}), /未知的工具/);
  await assert.rejects(() => runTool("get_story", { id: "not-a-uuid" }));
  await assert.rejects(() =>
    runTool("search_stories", {
      keywords: ["一", "二", "三", "四", "五", "六", "七"],
    }),
  );
  await assert.rejects(() => runTool("search_stories", { year: "26" }));
  await assert.rejects(() => runTool("search_stories", { month: "13" }));
  await assert.rejects(() => runTool("health_records", { kind: "everything" }));
  await assert.rejects(() => runTool("growth_records", { limit: 999 }));
});

test("the owner's AI allowance only accepts whole counts in range", () => {
  assert.equal(aiQuotaInput.safeParse({ draft: 0, chat: 0 }).success, true);
  assert.equal(aiQuotaInput.safeParse({ draft: 500, chat: 500 }).success, true);
  assert.equal(aiQuotaInput.safeParse({ draft: -1, chat: 5 }).success, false);
  assert.equal(aiQuotaInput.safeParse({ draft: 5, chat: 501 }).success, false);
  assert.equal(aiQuotaInput.safeParse({ draft: 1.5, chat: 5 }).success, false);
  assert.equal(aiQuotaInput.safeParse({ draft: "3", chat: 5 }).success, false);
});

test("a story shows the clock time only for the day it is filed under", () => {
  // 2026-09-21 14:32:07 Shanghai is 06:32:07 UTC.
  const sameDay = {
    occurredOn: "2026-09-21",
    publishedAt: "2026-09-21T06:32:07.000Z",
  };
  assert.equal(postedTime(sameDay), "14:32");
  // Just before midnight Shanghai, still the same local day.
  assert.equal(
    postedTime({
      occurredOn: "2026-09-21",
      publishedAt: "2026-09-21T15:59:00.000Z",
    }),
    "23:59",
  );
  // The same instant belongs to the next day in Shanghai.
  assert.equal(
    postedTime({
      occurredOn: "2026-09-21",
      publishedAt: "2026-09-21T16:00:00.000Z",
    }),
    "",
    "跨过上海零点后就不再算同一天",
  );
  // A story backdated to an earlier day must not borrow the publish clock.
  assert.equal(
    postedTime({
      occurredOn: "2026-09-18",
      publishedAt: "2026-09-21T07:48:00.000Z",
    }),
    "",
  );
  // Drafts and bad data simply show no time.
  assert.equal(postedTime({ occurredOn: "2026-09-21", publishedAt: null }), "");
  assert.equal(postedTime({ occurredOn: "2026-09-21" }), "");
  assert.equal(
    postedTime({ occurredOn: "2026-09-21", publishedAt: "nonsense" }),
    "",
  );
});

test("a photo can be lifted to the front without disturbing the rest", () => {
  const photos = ["a", "b", "c", "d"];
  assert.deepEqual(moveToFront(photos, 2), ["c", "a", "b", "d"]);
  assert.deepEqual(moveToFront(photos, 3), ["d", "a", "b", "c"]);
  // Already first, or out of range: nothing moves.
  assert.deepEqual(moveToFront(photos, 0), photos);
  assert.deepEqual(moveToFront(photos, -1), photos);
  assert.deepEqual(moveToFront(photos, 9), photos);
  // The original list is left alone.
  assert.deepEqual(photos, ["a", "b", "c", "d"]);
  assert.deepEqual(moveToFront([], 0), []);
});

const photo = (id, caption = "") => ({
  id,
  entryId: "e1",
  name: `${id}.jpg`,
  mime: "image/jpeg",
  kind: "image",
  url: "",
  thumb: "",
  caption,
});
const story = (changes = {}) => ({
  id: "e1",
  title: "剪毛的下午",
  occurredOn: "2026-09-21",
  kind: "daily",
  body: "正文",
  tags: ["美容"],
  status: "draft",
  visibility: "private",
  milestone: false,
  featured: false,
  publishedAt: null,
  coverMediaId: null,
  authorId: "a1",
  author: { displayName: "啵爸" },
  media: [],
  ...changes,
});

test("photos refreshed after an upload keep their place and captions", () => {
  const onScreen = [photo("a", "刚洗完"), photo("b")];
  // The server has the same two plus the one just uploaded.
  const fromServer = [photo("b"), photo("a"), photo("c")];
  const merged = mergeMedia(onScreen, fromServer);
  assert.deepEqual(
    merged.map((m) => m.id),
    ["a", "b", "c"],
    "本地顺序保留，新照片排在最后",
  );
  assert.equal(merged[0].caption, "刚洗完", "未保存的说明不能被覆盖");
  // A photo deleted from another device disappears here too.
  assert.deepEqual(
    mergeMedia(onScreen, [photo("b")]).map((m) => m.id),
    ["b"],
  );
  assert.deepEqual(
    mergeMedia([], [photo("a")]).map((m) => m.id),
    ["a"],
  );
  assert.deepEqual(mergeMedia(onScreen, []), []);
});

test("a recovered draft keeps its words but not photos that are gone", () => {
  const server = story({
    title: "服务器上的标题",
    media: [photo("a"), photo("c")],
  });
  const draft = {
    savedAt: Date.now(),
    entry: draftOf(
      story({
        title: "没保存的标题",
        body: "没保存的正文",
        coverMediaId: "b",
        media: [photo("b", "已删除的照片"), photo("a", "我写的说明")],
      }),
    ),
  };
  const restored = withDraft(server, draft);
  assert.equal(restored.title, "没保存的标题");
  assert.equal(restored.body, "没保存的正文");
  assert.deepEqual(
    restored.media.map((m) => m.id),
    ["a", "c"],
    "草稿里已删除的照片丢弃，服务器上的新照片保留",
  );
  assert.equal(restored.media[0].caption, "我写的说明");
  assert.equal(
    restored.coverMediaId,
    null,
    "封面指向已删除的照片时退回服务器的值",
  );
  // A cover that still exists is kept.
  assert.equal(
    withDraft(server, {
      savedAt: 1,
      entry: draftOf(story({ coverMediaId: "a", media: [photo("a")] })),
    }).coverMediaId,
    "a",
  );
});

test("words typed while a save is in flight are not thrown away", () => {
  const sent = story({ title: "发出去时的标题" });
  const saved = story({
    title: "发出去时的标题",
    publishedAt: "2026-09-21T06:00:00.000Z",
    media: [photo("a")],
  });
  // Nothing changed meanwhile: the reply is taken as-is and the page is clean.
  const quiet = afterSave(sent, saved, sent);
  assert.equal(quiet.form.title, "发出去时的标题");
  assert.equal(quiet.dirty, false);
  // Still typing: keep those words, take what only the server knows.
  const kept = afterSave(sent, saved, { ...sent, title: "又改了一版" });
  assert.equal(kept.form.title, "又改了一版");
  assert.equal(kept.form.publishedAt, "2026-09-21T06:00:00.000Z");
  assert.deepEqual(
    kept.form.media.map((m) => m.id),
    ["a"],
  );
  assert.equal(kept.dirty, true, "还有没保存的内容，必须仍标记为未保存");
});
