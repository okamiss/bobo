import { z } from "zod";
import { db } from "./media";
import { date } from "./validation";

// The read-only view of the family journal the chat may consult. Accounts,
// sessions, password hashes and the audit log are deliberately absent: the
// model can never reach them, whatever it is asked.
//
// Each tool keeps its JSON Schema (what the model sees) next to the zod schema
// that checks what comes back, so the two cannot drift apart. Tool arguments
// are model output, so they are validated exactly like a request body.

// Same order the site itself uses, so "最近一次" means the same thing here.
export const entryOrder = [
  { occurredOn: "desc" as const },
  { publishedAt: { sort: "desc" as const, nulls: "last" as const } },
  { createdAt: "desc" as const },
  { id: "desc" as const },
];
const MAX_RESULTS = 8;
const MAX_BODY = 4000;

export type Source = {
  id: string;
  title: string;
  occurredOn: string;
  public: boolean;
};

const keywords = z
  .array(z.string().trim().min(1).max(30))
  .max(6)
  .optional()
  .default([]);
const year = z
  .string()
  .regex(/^\d{4}$/)
  .optional();
const month = z
  .string()
  .regex(/^(0[1-9]|1[0-2])$/)
  .optional();

const args = {
  search_stories: z.object({
    keywords,
    year,
    month,
    kind: z.enum(["daily", "event"]).optional(),
    milestone: z.boolean().optional(),
  }),
  get_story: z.object({ id: z.string().uuid() }),
  growth_records: z.object({
    limit: z.number().int().min(1).max(30).optional(),
  }),
  health_records: z.object({
    kind: z.enum(["vaccine", "deworming", "checkup", "grooming"]).optional(),
  }),
  bobo_profile: z.object({}),
  on_this_day: z.object({ date: date.optional() }),
};

export type ToolName = keyof typeof args;

// What the model is told it can call. Descriptions are in Chinese because the
// questions are.
export const tools = [
  {
    type: "function",
    function: {
      name: "search_stories",
      description:
        "搜索家庭手账里的故事（含不公开和草稿）。keywords 里任意一个词命中标题、正文或标签即算匹配。最多返回 8 条，按日期从新到旧。",
      parameters: {
        type: "object",
        properties: {
          keywords: {
            type: "array",
            items: { type: "string" },
            description: "中文关键词，最多 6 个，例如 ['剪毛','美容']",
          },
          year: { type: "string", description: "四位年份，例如 2026" },
          month: { type: "string", description: "两位月份，例如 05" },
          kind: {
            type: "string",
            enum: ["daily", "event"],
            description: "daily 日常碎片，event 特别事件",
          },
          milestone: { type: "boolean", description: "只看里程碑" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_story",
      description: "按 id 读取一篇故事的完整正文、标签和照片说明。",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "growth_records",
      description:
        "啵啵的成长记录：日期、体重（kg）、肩高（cm）和家人的备注，从新到旧。",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "最多返回多少条，默认 30" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "health_records",
      description:
        "健康档案：疫苗、驱虫、体检、美容的日期、下次时间和备注，并给出距离下次时间还有多少天。",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["vaccine", "deworming", "checkup", "grooming"],
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bobo_profile",
      description: "啵啵的基本资料：名字、品种、生日、到家日期、性格和爱好。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "on_this_day",
      description: "某一天（默认今天）在往年同月同日发生过的故事。",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD，默认今天" },
        },
      },
    },
  },
];

const kindNames: Record<string, string> = {
  vaccine: "疫苗",
  deworming: "驱虫",
  checkup: "体检",
  grooming: "美容",
};
export const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
    new Date(),
  );
const isPublic = (e: { status: string; visibility: string }) =>
  e.status === "published" && e.visibility === "public";
const label = (e: { status: string; visibility: string }) =>
  e.status === "draft" ? "草稿" : isPublic(e) ? "已公开" : "不公开";
const source = (e: {
  id: string;
  title: string;
  occurredOn: string;
  status: string;
  visibility: string;
}): Source => ({
  id: e.id,
  title: e.title,
  occurredOn: e.occurredOn,
  public: isPublic(e),
});

// Runs one tool call and returns what the model should see plus the stories it
// touched, so the answer can show where it came from.
export async function runTool(name: string, rawArgs: unknown) {
  if (!(name in args)) throw new Error(`未知的工具 ${name}`);
  const sources: Source[] = [];
  const select = {
    id: true,
    title: true,
    occurredOn: true,
    kind: true,
    tags: true,
    status: true,
    visibility: true,
    milestone: true,
    body: true,
  };
  if (name === "search_stories") {
    const a = args.search_stories.parse(rawArgs);
    const where: any = {};
    if (a.year && a.month)
      where.occurredOn = { startsWith: `${a.year}-${a.month}` };
    else if (a.year) where.occurredOn = { startsWith: a.year };
    else if (a.month) where.occurredOn = { contains: `-${a.month}-` };
    if (a.kind) where.kind = a.kind;
    if (a.milestone) where.milestone = true;
    // Any keyword may match the title, the body or a tag.
    if (a.keywords.length)
      where.OR = [
        ...a.keywords.flatMap((k) => [
          { title: { contains: k, mode: "insensitive" as const } },
          { body: { contains: k, mode: "insensitive" as const } },
        ]),
        { tags: { hasSome: a.keywords } },
      ];
    const rows = await db.entry.findMany({
      where,
      select,
      orderBy: entryOrder,
      take: MAX_RESULTS,
    });
    sources.push(...rows.map(source));
    return {
      result: {
        count: rows.length,
        stories: rows.map((e) => ({
          id: e.id,
          title: e.title,
          occurredOn: e.occurredOn,
          tags: e.tags,
          状态: label(e),
          摘要: e.body.slice(0, 150),
        })),
      },
      sources,
    };
  }
  if (name === "get_story") {
    const a = args.get_story.parse(rawArgs);
    const entry = await db.entry.findUnique({
      where: { id: a.id },
      select: {
        ...select,
        author: { select: { displayName: true } },
        media: {
          select: { caption: true, kind: true },
          orderBy: [{ position: "asc" }, { id: "asc" }],
        },
      },
    });
    if (!entry) return { result: { error: "没有这篇故事" }, sources };
    sources.push(source(entry));
    return {
      result: {
        id: entry.id,
        title: entry.title,
        occurredOn: entry.occurredOn,
        tags: entry.tags,
        状态: label(entry),
        里程碑: entry.milestone,
        记录人: entry.author?.displayName || "",
        正文: entry.body.slice(0, MAX_BODY),
        照片说明: entry.media.map((m) => m.caption).filter(Boolean),
        照片数: entry.media.filter((m) => m.kind === "image").length,
        视频数: entry.media.filter((m) => m.kind === "video").length,
      },
      sources,
    };
  }
  if (name === "growth_records") {
    const a = args.growth_records.parse(rawArgs);
    const rows = await db.measurement.findMany({
      orderBy: { measuredOn: "desc" },
      take: a.limit || 30,
    });
    return {
      result: {
        count: rows.length,
        记录: rows.map((m) => ({
          日期: m.measuredOn,
          体重kg: m.weight,
          肩高cm: m.height,
          备注: m.note,
        })),
      },
      sources,
    };
  }
  if (name === "health_records") {
    const a = args.health_records.parse(rawArgs);
    const rows = await db.healthRecord.findMany({
      where: a.kind ? { kind: a.kind } : {},
      orderBy: { occurredOn: "desc" },
      take: 30,
    });
    const now = today();
    return {
      result: {
        今天: now,
        count: rows.length,
        记录: rows.map((r) => ({
          类型: kindNames[r.kind] || r.kind,
          本次日期: r.occurredOn,
          下次时间: r.nextDueOn,
          距下次天数:
            r.nextDueOn === null
              ? null
              : Math.round(
                  (Date.parse(`${r.nextDueOn}T00:00:00Z`) -
                    Date.parse(`${now}T00:00:00Z`)) /
                    86400000,
                ),
          备注: r.note,
        })),
      },
      sources,
    };
  }
  if (name === "bobo_profile") {
    args.bobo_profile.parse(rawArgs);
    const p = await db.profile.findUnique({ where: { id: 1 } });
    return {
      result: {
        今天: today(),
        名字: p?.name,
        品种: p?.breed,
        生日: p?.birthday,
        到家日期: p?.homeDate,
        介绍: p?.intro,
        性格: p?.personality,
        爱好: p?.hobbies,
      },
      sources,
    };
  }
  const a = args.on_this_day.parse(rawArgs);
  const day = a.date || today();
  const rows = await db.entry.findMany({
    where: {
      occurredOn: { endsWith: day.slice(4), not: day },
    },
    select,
    orderBy: entryOrder,
    take: MAX_RESULTS,
  });
  sources.push(...rows.map(source));
  return {
    result: {
      查询日期: day,
      count: rows.length,
      stories: rows.map((e) => ({
        id: e.id,
        title: e.title,
        occurredOn: e.occurredOn,
        状态: label(e),
        摘要: e.body.slice(0, 150),
      })),
    },
    sources,
  };
}
