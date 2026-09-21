import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Admin } from "@prisma/client";
import { config } from "./config";
import { db, MediaService } from "./media";
import { aiDraftInput, aiDraftOutput } from "./validation";
import { z } from "zod";

// One model call may not outlive the Nginx proxy (proxy_read_timeout 180s).
const TIMEOUT = 90000;
// Per account, per day. Generous for a family journal, low enough that a stuck
// client cannot run up a bill.
export const DRAFT_QUOTA = 20;
const MAX_OUTPUT = 4000;

type DraftInput = z.infer<typeof aiDraftInput>;

// Anything the model returns is text, never an instruction: the stories and
// captions quoted below are written by whoever uses the site.
const SYSTEM = `你是「啵啵的小日子」的写作助手，帮一家人把照片和零散的想法整理成家庭手账里的一篇记录。
啵啵是一只雪纳瑞。语气温柔、具体、像家人说话，不要营销腔，不要夸张的形容词堆砌。
只描述照片里真实可见的内容和用户给的提示，不要编造时间、地点、人物或没发生过的事。
照片说明与正文都用中文。正文可以分段，允许用「## 」开头的小标题、「- 」开头的列表、「> 」开头的引用，不要使用其它 Markdown 或 HTML。
必须只输出一个 json 对象，不要输出解释或代码块围栏，格式如下：
{"titles":["标题一","标题二","标题三"],"body":"正文","tags":["标签"],"captions":["第一张照片的说明"]}
titles 给 3 个不同风格的标题，每个不超过 20 字；tags 最多 5 个，每个不超过 10 字；captions 按照片顺序给出，条数与照片数一致，没有照片时为空数组。`;

@Injectable()
export class AiService {
  private ai = config().ai;
  constructor(private media: MediaService) {}
  get enabled() {
    return !!this.ai;
  }
  get model() {
    return this.ai?.model || "";
  }
  private settings() {
    if (!this.ai)
      throw new ServiceUnavailableException(
        "还没有配置 AI 服务，请家庭管理员在服务器 .env 中填写 DEEPSEEK_API_KEY",
      );
    return this.ai;
  }
  // Calls left today, so the editor can show the number before spending one.
  async remaining(adminId: string) {
    const used = await db.aiUsage.count({
      where: { adminId, createdAt: { gte: startOfToday() } },
    });
    return Math.max(0, DRAFT_QUOTA - used);
  }
  async status(admin: Admin) {
    return {
      enabled: this.enabled,
      model: this.model,
      consented: !!admin.aiConsentAt,
      remaining: this.enabled ? await this.remaining(admin.id) : 0,
      quota: DRAFT_QUOTA,
    };
  }
  // Story photos the account may use, in the order the editor listed them.
  private async photos(ids: string[]) {
    if (!ids.length) return [];
    const rows = await db.media.findMany({
      where: { id: { in: ids }, kind: "image", state: "ready" },
    });
    const byId = new Map(rows.map((m) => [m.id, m]));
    const found = ids.map((id) => byId.get(id)).filter((m) => !!m);
    if (found.length !== ids.length)
      throw new BadRequestException("有照片还没有处理好，请稍后再试");
    return await Promise.all(
      found.map(async (m) => {
        const bytes = await this.media.bytes(`${m.key}.thumb`);
        return `data:image/webp;base64,${bytes.toString("base64")}`;
      }),
    );
  }
  async draft(admin: Admin, body: unknown) {
    const settings = this.settings();
    const input = aiDraftInput.parse(body);
    if (!admin.aiConsentAt)
      throw new ForbiddenException("请先同意把内容发送给 AI 服务");
    if ((await this.remaining(admin.id)) <= 0)
      throw new HttpException(
        `今天的 AI 次数已经用完（每人每天 ${DRAFT_QUOTA} 次），明天再来吧`,
        429,
      );
    const images = await this.photos(input.mediaIds);
    const started = Date.now();
    // json_object mode has no schema and DeepSeek documents that it can come
    // back empty, so a rejected answer is retried once before giving up.
    let last = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const reply = await this.call(settings, prompt(input, images, attempt));
      const parsed = read(reply.text);
      if (parsed.success) {
        await db.aiUsage.create({
          data: {
            adminId: admin.id,
            kind: "draft",
            model: settings.model,
            tokensIn: reply.tokensIn,
            tokensOut: reply.tokensOut,
            ms: Date.now() - started,
          },
        });
        const draft = parsed.data;
        return {
          titles: draft.titles,
          body: draft.body,
          tags: draft.tags,
          // Keep captions aligned with the photos the editor sent.
          captions: input.mediaIds.map((id, i) => ({
            mediaId: id,
            caption: draft.captions[i] || "",
          })),
        };
      }
      last = parsed.reason;
    }
    console.error("AI draft rejected:", last);
    throw new BadGatewayException("AI 这次没写出可用的内容，请再试一次");
  }
  private async call(
    settings: { key: string; base: string; model: string },
    messages: unknown[],
  ) {
    let res: Response;
    try {
      res = await fetch(`${settings.base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.key}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages,
          response_format: { type: "json_object" },
          max_tokens: MAX_OUTPUT,
          temperature: 1,
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });
    } catch (e: any) {
      if (e?.name === "TimeoutError" || e?.name === "AbortError")
        throw new GatewayTimeoutException("AI 想得太久了，请再试一次");
      console.error("AI request failed:", e);
      throw new ServiceUnavailableException("连不上 AI 服务，请稍后再试");
    }
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 500);
      console.error(`AI responded ${res.status}: ${detail}`);
      if (res.status === 429)
        throw new HttpException("AI 服务正忙或额度已用完，请稍后再试", 429);
      if (res.status === 401 || res.status === 403)
        throw new ServiceUnavailableException(
          "AI 服务密钥无效，请家庭管理员检查 DEEPSEEK_API_KEY",
        );
      if (res.status === 402)
        throw new ServiceUnavailableException(
          "AI 服务余额不足，请家庭管理员充值后再试",
        );
      throw new BadGatewayException("AI 服务出错了，请稍后再试");
    }
    const data: any = await res.json().catch(() => null);
    return {
      text: data?.choices?.[0]?.message?.content || "",
      tokensIn: data?.usage?.prompt_tokens || 0,
      tokensOut: data?.usage?.completion_tokens || 0,
    };
  }
}

// Shanghai day boundary, matching how the rest of the site treats "today".
export function startOfToday(now = new Date()) {
  const shanghai = new Date(now.getTime() + 8 * 3600000)
    .toISOString()
    .slice(0, 10);
  return new Date(`${shanghai}T00:00:00+08:00`);
}

// Exported for unit tests: turns the model's reply into a checked draft.
export function read(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?|```$/g, "");
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return {
      success: false as const,
      reason: `not JSON: ${text.slice(0, 200)}`,
    };
  }
  const parsed = aiDraftOutput.safeParse(value);
  return parsed.success
    ? { success: true as const, data: parsed.data }
    : { success: false as const, reason: parsed.error.message.slice(0, 300) };
}

function prompt(input: DraftInput, images: string[], attempt: number) {
  const lines = [
    input.occurredOn ? `日期：${input.occurredOn}` : "",
    `类型：${input.kind === "event" ? "特别事件" : "日常碎片"}`,
    input.hint ? `家人想写的重点：${input.hint}` : "",
    images.length
      ? `照片：${images.length} 张，按顺序给出说明。`
      : "没有照片，请根据上面的信息写。",
    attempt
      ? "上一次的回答不是合法的 json，请严格按要求只输出一个 json 对象。"
      : "",
  ].filter(Boolean);
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        { type: "text", text: lines.join("\n") },
        ...images.map((url) => ({ type: "image_url", image_url: { url } })),
      ],
    },
  ];
}
