import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  Module,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
} from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Request, Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomBytes } from "node:crypto";
import { z, ZodError } from "zod";
import { config, sign, checkPassword, hashPassword } from "./config";
import { db, MediaService, mediaOrder } from "./media";
import { AiService } from "./ai";
import {
  entryInput,
  profileInput,
  albumInput,
  uploadInput,
  visible,
  coverChoice,
  date,
  accountInput,
  accountStatusInput,
  accountNameInput,
  passwordChangeInput,
  passwordResetInput,
  measurementInput,
  healthRecordInput,
  tagCreateInput,
  tagRenameInput,
  aiQuotaInput,
} from "./validation";
const idSchema = z.string().uuid();
// Stories are ordered by the day they happened, and within one day by when
// they went up, newest first: several stories a day used to come back in the
// order of their random uuids. A draft has no publish time yet, so it falls
// back to when it was written and sits after the published ones of that day.
// The id only breaks an exact tie; the previous/next queries in get() walk
// this same order and must be changed with it.
const entryOrder = [
  { occurredOn: "desc" as const },
  { publishedAt: { sort: "desc" as const, nulls: "last" as const } },
  { createdAt: "desc" as const },
  { id: "desc" as const },
];
const shanghaiToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
    new Date(),
  );
async function session(req: Request) {
  const token = req.cookies?.bobo_session;
  if (!token) return null;
  return db.session.findFirst({
    where: { id: sign(token), expiresAt: { gt: new Date() } },
    include: { admin: true },
  });
}
async function currentAdmin(req: Request) {
  const value = await session(req);
  if (!value?.admin.active) throw new UnauthorizedException("请先登录");
  return value.admin;
}
async function owner(req: Request) {
  const admin = await currentAdmin(req);
  if (admin.role !== "owner")
    throw new ForbiddenException("只有家庭管理员可以进行这项操作");
  return admin;
}
async function editableEntry(req: Request, id: string) {
  idSchema.parse(id);
  const admin = await currentAdmin(req);
  const entry = await db.entry.findUnique({
    where: { id },
    include: { media: true },
  });
  if (!entry) throw new NotFoundException();
  if (admin.role !== "owner" && entry.authorId !== admin.id)
    throw new ForbiddenException("只有记录人和家庭管理员可以修改这篇记录");
  return { admin, entry };
}
async function editableMedia(req: Request, id: string) {
  idSchema.parse(id);
  const media = await db.media.findUnique({ where: { id } });
  if (!media) throw new NotFoundException();
  // Site images (page covers) belong to no story; any family member may edit.
  if (media.entryId) await editableEntry(req, media.entryId);
  return media;
}
function authUser(admin: {
  id: string;
  username: string;
  displayName: string;
  role: string;
}) {
  return {
    id: admin.id,
    username: admin.username,
    displayName: admin.displayName,
    role: admin.role,
  };
}
@Injectable()
class AdminGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext) {
    await currentAdmin(ctx.switchToHttp().getRequest());
    return true;
  }
}
@Catch()
class Errors implements ExceptionFilter {
  catch(e: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      e instanceof ZodError
        ? 400
        : e instanceof HttpException
          ? e.getStatus()
          : e.code === "P2025"
            ? 404
            : 500;
    if (status === 500) console.error(e);
    res.status(status).json({
      message:
        e instanceof ZodError
          ? e.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("；")
          : status === 500
            ? "服务暂时不可用，请稍后重试"
            : e.message,
    });
  }
}
@Injectable()
class Content {
  constructor(private readonly media: MediaService) {}
  async present(entry: any) {
    return {
      ...entry,
      media: await Promise.all(
        (entry.media || [])
          .filter((m: any) => m.state === "ready")
          .map((m: any) => this.media.present(m)),
      ),
    };
  }
  async list(query: any, admin = false) {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(12),
        year: z
          .string()
          .regex(/^\d{4}$/)
          .optional(),
        month: z
          .string()
          .regex(/^(0[1-9]|1[0-2])$/)
          .optional(),
        kind: z.enum(["daily", "event"]).optional(),
        tag: z.string().max(30).optional(),
        q: z.string().max(100).optional(),
        milestone: z.enum(["true"]).optional(),
        featured: z.enum(["true"]).optional(),
      })
      .parse(query);
    const where: any = {
      ...(admin ? {} : visible),
      ...(q.year || q.month
        ? {
            occurredOn:
              q.year && q.month
                ? { startsWith: `${q.year}-${q.month}` }
                : q.year
                  ? { startsWith: q.year }
                  : { contains: `-${q.month}-` },
          }
        : {}),
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.tag ? { tags: { has: q.tag } } : {}),
      ...(q.milestone ? { milestone: true } : {}),
      ...(q.featured ? { featured: true } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q, mode: "insensitive" } },
              { body: { contains: q.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total, facets] = await Promise.all([
      db.entry.findMany({
        where,
        orderBy: entryOrder,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: {
          author: { select: { displayName: true } },
          media: {
            orderBy: mediaOrder,
            where: admin ? {} : { attached: true },
          },
        },
      }),
      db.entry.count({ where }),
      db.entry.findMany({
        where: admin ? {} : visible,
        select: { occurredOn: true, tags: true },
      }),
    ]);
    return {
      items: await Promise.all(items.map((x) => this.present(x))),
      total,
      page: q.page,
      years: [...new Set(facets.map((x) => x.occurredOn.slice(0, 4)))]
        .sort()
        .reverse(),
      tags: [...new Set(facets.flatMap((x) => x.tags))].sort(),
    };
  }
  async get(id: string, admin = false) {
    idSchema.parse(id);
    const entry = await db.entry.findFirst({
      where: { id, ...(admin ? {} : visible) },
      include: {
        author: { select: { displayName: true } },
        media: { orderBy: mediaOrder, where: admin ? {} : { attached: true } },
      },
    });
    if (!entry) throw new NotFoundException("这篇故事暂时没有公开");
    const select = { id: true, title: true, occurredOn: true };
    // Walk the same order as the timeline. Only published stories are reachable
    // here and publishing always stamps publishedAt, so it is never null; the
    // fallback keeps a hand-edited row from losing its neighbours.
    const at = entry.publishedAt ?? entry.createdAt;
    const [previous, next] = admin
      ? [null, null]
      : await Promise.all([
          db.entry.findFirst({
            where: {
              ...visible,
              OR: [
                { occurredOn: { gt: entry.occurredOn } },
                { occurredOn: entry.occurredOn, publishedAt: { gt: at } },
                {
                  occurredOn: entry.occurredOn,
                  publishedAt: at,
                  id: { gt: id },
                },
              ],
            },
            select,
            orderBy: [
              { occurredOn: "asc" },
              { publishedAt: { sort: "asc", nulls: "first" } },
              { id: "asc" },
            ],
          }),
          db.entry.findFirst({
            where: {
              ...visible,
              OR: [
                { occurredOn: { lt: entry.occurredOn } },
                { occurredOn: entry.occurredOn, publishedAt: { lt: at } },
                {
                  occurredOn: entry.occurredOn,
                  publishedAt: at,
                  id: { lt: id },
                },
              ],
            },
            select,
            orderBy: [
              { occurredOn: "desc" },
              { publishedAt: { sort: "desc", nulls: "last" } },
              { id: "desc" },
            ],
          }),
        ]);
    return {
      ...(await this.present(entry)),
      uploads: admin
        ? entry.media
            .filter((m) => m.state !== "ready")
            .map((m) => ({ id: m.id, name: m.name, state: m.state }))
        : undefined,
      previous,
      next,
    };
  }
  async profile(admin = false) {
    const p = await db.profile.findUniqueOrThrow({ where: { id: 1 } });
    const load = async (id: string | null) => {
      const m = id
        ? await db.media.findFirst({
            where: {
              id,
              ...(admin ? { state: "ready", kind: "image" } : coverChoice),
            },
          })
        : null;
      return m ? this.media.present(m) : null;
    };
    const [cover, aboutCover] = await Promise.all([
      load(p.coverMediaId),
      load(p.aboutCoverMediaId),
    ]);
    return {
      ...p,
      coverMediaId: cover?.id || null,
      cover,
      aboutCoverMediaId: aboutCover?.id || null,
      aboutCover,
    };
  }
  async albums(admin = false, id?: string) {
    if (id) idSchema.parse(id);
    const albums = await db.album.findMany({
      where: {
        ...(id ? { id } : {}),
        ...(admin ? {} : { visibility: "public" }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          where: admin
            ? {}
            : { media: { state: "ready", entry: visible, attached: true } },
          orderBy: [{ position: "asc" }, { mediaId: "asc" }],
          include: { media: true },
        },
      },
    });
    const results = await Promise.all(
      albums.map(async (a) => {
        const items = await Promise.all(
          a.items
            .filter((i) => i.media.state === "ready")
            .map((i) => this.media.present(i.media)),
        );
        return {
          ...a,
          items,
          coverMediaId:
            items.find((m) => m.id === a.coverMediaId)?.id ||
            items[0]?.id ||
            null,
        };
      }),
    );
    if (id && !results.length)
      throw new NotFoundException("相册不存在或未公开");
    return id ? results[0] : results;
  }
  // Public stories from this calendar day in earlier years, plus the same day
  // of the month within the past year while there is little history yet.
  async onThisDay(query: unknown) {
    const at = z.object({ date: date.optional() }).parse(query).date;
    const today = at || shanghaiToday();
    const [year, month, day] = today.split("-").map(Number);
    const entries = await db.entry.findMany({
      where: {
        ...visible,
        occurredOn: { endsWith: today.slice(7), lt: today },
      },
      orderBy: entryOrder,
      include: {
        author: { select: { displayName: true } },
        media: { orderBy: mediaOrder, where: { attached: true } },
      },
    });
    const items = entries
      .map((entry) => {
        const [y, m] = entry.occurredOn.split("-").map(Number);
        const months = (year - y) * 12 + month - m;
        return months % 12 === 0
          ? { entry, yearsAgo: months / 12, monthsAgo: null }
          : months < 12
            ? { entry, yearsAgo: null, monthsAgo: months }
            : null;
      })
      .filter((x) => x !== null)
      .sort(
        (a, b) =>
          (a.yearsAgo === null ? 1 : 0) - (b.yearsAgo === null ? 1 : 0) ||
          (a.yearsAgo ?? a.monthsAgo!) - (b.yearsAgo ?? b.monthsAgo!),
      )
      .slice(0, 6);
    return {
      date: today,
      items: await Promise.all(
        items.map(async ({ entry, yearsAgo, monthsAgo }) => ({
          ...(await this.present(entry)),
          yearsAgo,
          monthsAgo,
        })),
      ),
    };
  }
  // Visitors see measurements only when the owner made the curve public, and
  // never the notes.
  async growth(admin = false) {
    const { growthPublic } = await db.profile.findUniqueOrThrow({
      where: { id: 1 },
    });
    const items =
      admin || growthPublic
        ? await db.measurement.findMany({
            orderBy: { measuredOn: "asc" },
            ...(admin
              ? {}
              : { select: { measuredOn: true, weight: true, height: true } }),
          })
        : [];
    return { public: growthPublic, items };
  }
}
function measurement(body: unknown) {
  const v = measurementInput.parse(body);
  if (v.measuredOn > shanghaiToday())
    throw new BadRequestException("不能记录今天以后的日期");
  const round = (n: number | null, places: number) =>
    n === null ? null : Math.round(n * 10 ** places) / 10 ** places;
  return { ...v, weight: round(v.weight, 2), height: round(v.height, 1) };
}
function healthRecord(body: unknown) {
  const value = healthRecordInput.parse(body);
  if (value.occurredOn > shanghaiToday())
    throw new BadRequestException("不能记录今天以后的完成日期");
  return value;
}
function sameDay(error: any): never {
  if (error.code === "P2002")
    throw new ConflictException("这一天已经有记录了，请直接修改那一条");
  throw error;
}
// Every family member can edit shared site content (profile, covers, albums,
// growth and health); each change is recorded for the family admin to review.
async function audit(
  admin: { id: string; displayName: string },
  action: string,
  summary: string,
) {
  await db.auditLog.create({
    data: { adminId: admin.id, actorName: admin.displayName, action, summary },
  });
}
const profileLabels: Record<string, string> = {
  siteName: "网站名称",
  name: "宠物名字",
  breed: "品种",
  birthday: "生日",
  homeDate: "到家日期",
  intro: "介绍",
  personality: "性格",
  hobbies: "爱好",
  coverMediaId: "首页封面",
  aboutCoverMediaId: "关于页封面",
};
const growthValues = (m: { weight: number | null; height: number | null }) =>
  [
    m.weight === null ? "" : `体重 ${m.weight} kg`,
    m.height === null ? "" : `肩高 ${m.height} cm`,
  ]
    .filter(Boolean)
    .join("，");
const healthLabels: Record<string, string> = {
  vaccine: "疫苗",
  deworming: "驱虫",
  checkup: "体检",
  grooming: "美容",
};
const healthSummary = (record: {
  kind: string;
  occurredOn: string;
  nextDueOn: string | null;
}) =>
  `${healthLabels[record.kind] ?? record.kind}（${record.occurredOn}${
    record.nextDueOn ? `，下次 ${record.nextDueOn}` : ""
  }）`;
@Controller("api")
class PublicController {
  constructor(
    private readonly content: Content,
    private readonly media: MediaService,
  ) {}
  @Get("health") async health() {
    await db.$queryRaw`SELECT 1`;
    return { ok: true };
  }
  @Get("profile") profile() {
    return this.content.profile();
  }
  @Get("entries") entries(@Query() q: any) {
    return this.content.list(q);
  }
  @Get("entries/:id") entry(@Param("id") id: string) {
    return this.content.get(id);
  }
  @Get("on-this-day") onThisDay(@Query() q: unknown) {
    return this.content.onThisDay(q);
  }
  @Get("growth") growth() {
    return this.content.growth();
  }
  @Get("albums") albums() {
    return this.content.albums();
  }
  @Get("albums/:id") album(@Param("id") id: string) {
    return this.content.albums(false, id);
  }
  @Get("media/:id/access") async access(
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    return this.media.present(
      await this.media.accessible(id, !!(await session(req))),
    );
  }
  @Get("media/:id/file/:variant") file(
    @Param("id") id: string,
    @Param("variant") variant: string,
    @Query("expires") expires: string,
    @Query("token") token: string,
    @Res() res: Response,
  ) {
    return this.media.serve(id, variant, expires, token, res);
  }
  @Post("auth/login") async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const v = z
      .object({ username: z.string().max(100), password: z.string().max(200) })
      .parse(body);
    const admin = await db.admin.findUnique({
      where: { username: v.username },
    });
    if (!admin?.active || !checkPassword(v.password, admin.passwordHash))
      throw new UnauthorizedException("用户名或密码不正确");
    const token = randomBytes(32).toString("hex");
    await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await db.session.create({
      data: {
        id: sign(token),
        adminId: admin.id,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    res.cookie("bobo_session", token, {
      httpOnly: true,
      secure: config().secure,
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 86400000,
    });
    // A readable hint so the public pages can show the family-only chat button
    // without asking the server on every visit. It carries nothing secret and
    // grants nothing: every endpoint still checks the session cookie.
    res.cookie("bobo_family", "1", {
      httpOnly: false,
      secure: config().secure,
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 86400000,
    });
    return authUser(admin);
  }
  @Get("auth/me") async me(@Req() req: Request) {
    return authUser(await currentAdmin(req));
  }
  @Put("auth/password") async changePassword(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const admin = await currentAdmin(req);
    const v = passwordChangeInput.parse(body);
    if (!checkPassword(v.currentPassword, admin.passwordHash))
      throw new BadRequestException("当前密码不正确");
    // Keep this session and sign out every other device.
    await db.$transaction([
      db.admin.update({
        where: { id: admin.id },
        data: { passwordHash: hashPassword(v.newPassword) },
      }),
      db.session.deleteMany({
        where: {
          adminId: admin.id,
          id: { not: sign(req.cookies.bobo_session) },
        },
      }),
    ]);
    return { ok: true };
  }
  @Post("auth/logout") async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (req.cookies?.bobo_session)
      await db.session.deleteMany({
        where: { id: sign(req.cookies.bobo_session) },
      });
    res.clearCookie("bobo_session", {
      path: "/",
      secure: config().secure,
      sameSite: "strict",
      httpOnly: true,
    });
    res.clearCookie("bobo_family", {
      path: "/",
      secure: config().secure,
      sameSite: "strict",
    });
    return { ok: true };
  }
}
@Controller("api/admin")
@UseGuards(AdminGuard)
class AdminController {
  constructor(
    private readonly content: Content,
    private readonly media: MediaService,
    private readonly ai: AiService,
  ) {}
  @Get("accounts") async accounts(@Req() req: Request) {
    await owner(req);
    const accounts = await db.admin.findMany({
      orderBy: [{ role: "desc" }, { displayName: "asc" }],
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        active: true,
        _count: { select: { entries: true } },
      },
    });
    return accounts.map(({ _count, ...account }) => ({
      ...account,
      entryCount: _count.entries,
    }));
  }
  @Post("accounts") async createAccount(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    await owner(req);
    const value = accountInput.parse(body);
    try {
      const account = await db.admin.create({
        data: {
          username: value.username,
          displayName: value.displayName,
          passwordHash: hashPassword(value.password),
        },
      });
      return { ...authUser(account), active: account.active, entryCount: 0 };
    } catch (error: any) {
      if (error.code === "P2002")
        throw new ConflictException("这个用户名已经被使用");
      throw error;
    }
  }
  @Put("accounts/:id/status") async setAccountStatus(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    await owner(req);
    idSchema.parse(id);
    const value = accountStatusInput.parse(body);
    const target = await db.admin.findUniqueOrThrow({ where: { id } });
    if (target.role === "owner")
      throw new BadRequestException("家庭管理员账号不能停用");
    const account = await db.admin.update({
      where: { id },
      data: { active: value.active },
    });
    if (!value.active) await db.session.deleteMany({ where: { adminId: id } });
    return { ...authUser(account), active: account.active };
  }
  @Put("accounts/:id/name") async setAccountName(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    await owner(req);
    idSchema.parse(id);
    const value = accountNameInput.parse(body);
    const account = await db.admin.update({ where: { id }, data: value });
    return { ...authUser(account), active: account.active };
  }
  @Put("accounts/:id/password") async resetAccountPassword(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    await owner(req);
    idSchema.parse(id);
    const value = passwordResetInput.parse(body);
    const target = await db.admin.findUniqueOrThrow({ where: { id } });
    if (target.role === "owner")
      throw new BadRequestException(
        "家庭管理员请通过「修改密码」更改自己的密码",
      );
    await db.$transaction([
      db.admin.update({
        where: { id },
        data: { passwordHash: hashPassword(value.password) },
      }),
      db.session.deleteMany({ where: { adminId: id } }),
    ]);
    return { ok: true };
  }
  @Delete("accounts/:id") async removeAccount(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    await owner(req);
    idSchema.parse(id);
    const target = await db.admin.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { entries: true } } },
    });
    if (target.role === "owner")
      throw new BadRequestException("家庭管理员账号不能删除");
    if (target._count.entries)
      throw new BadRequestException("这个账号已有记录，请改为停用以保留署名");
    await db.admin.delete({ where: { id } });
    return { ok: true };
  }
  @Get("entries") entries(@Query() q: any) {
    return this.content.list(q, true);
  }
  @Get("tags") async tags() {
    const [saved, entries] = await Promise.all([
      db.tag.findMany({ select: { name: true } }),
      db.entry.findMany({ select: { tags: true } }),
    ]);
    const counts = new Map<string, number>();
    for (const { name } of saved) counts.set(name, 0);
    for (const entry of entries)
      for (const name of new Set(entry.tags))
        counts.set(name, (counts.get(name) ?? 0) + 1);
    return [...counts]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }
  @Post("tags") async createTag(@Req() req: Request, @Body() body: unknown) {
    const admin = await owner(req);
    const { name } = tagCreateInput.parse(body);
    try {
      await db.$transaction(async (tx) => {
        await tx.tag.create({ data: { name } });
        await tx.auditLog.create({
          data: {
            adminId: admin.id,
            actorName: admin.displayName,
            action: "tag.create",
            summary: `新增了标签「${name}」`,
          },
        });
      });
      return { name, count: 0 };
    } catch (error: any) {
      if (error.code === "P2002")
        throw new ConflictException("这个标签已经存在");
      throw error;
    }
  }
  @Put("tags") async renameTag(@Req() req: Request, @Body() body: unknown) {
    const admin = await owner(req);
    const { name, newName } = tagRenameInput.parse(body);
    return db.$transaction(async (tx) => {
      const [saved, entries] = await Promise.all([
        tx.tag.findUnique({ where: { name } }),
        tx.entry.findMany({
          where: { tags: { has: name } },
          select: { id: true, tags: true },
        }),
      ]);
      if (!saved && !entries.length)
        throw new NotFoundException("这个标签不存在");
      if (name === newName)
        return { name, count: entries.length, merged: false };
      const [target, targetUsage] = await Promise.all([
        tx.tag.findUnique({ where: { name: newName } }),
        tx.entry.count({ where: { tags: { has: newName } } }),
      ]);
      await tx.tag.upsert({
        where: { name: newName },
        create: { name: newName },
        update: {},
      });
      for (const entry of entries)
        await tx.entry.update({
          where: { id: entry.id },
          data: {
            tags: [
              ...new Set(
                entry.tags.map((tag) => (tag === name ? newName : tag)),
              ),
            ],
          },
        });
      await tx.tag.deleteMany({ where: { name } });
      const merged = !!target || targetUsage > 0;
      await tx.auditLog.create({
        data: {
          adminId: admin.id,
          actorName: admin.displayName,
          action: "tag.rename",
          summary: `将标签「${name}」改为「${newName}」，已同步 ${entries.length} 篇记录${merged ? "并合并同名标签" : ""}`,
        },
      });
      return { name: newName, count: entries.length, merged };
    });
  }
  @Delete("tags") async removeTag(@Req() req: Request, @Body() body: unknown) {
    const admin = await owner(req);
    const { name } = tagCreateInput.parse(body);
    return db.$transaction(async (tx) => {
      // Remove only this exact array item, without overwriting other story fields.
      const count = await tx.$executeRaw`
        UPDATE "Entry"
        SET "tags" = array_remove("tags", ${name}), "updatedAt" = NOW()
        WHERE ${name} = ANY("tags")
      `;
      const removed = await tx.tag.deleteMany({ where: { name } });
      if (count || removed.count)
        await tx.auditLog.create({
          data: {
            adminId: admin.id,
            actorName: admin.displayName,
            action: "tag.delete",
            summary: `删除了标签「${name}」，已从 ${count} 篇记录中移除`,
          },
        });
      return { count };
    });
  }
  @Get("entries/:id") entry(@Param("id") id: string) {
    return this.content.get(id, true);
  }
  // The editor keeps a new story in the browser until there is something to
  // keep, then creates it in one go, so opening the page no longer leaves an
  // empty row behind. A body-less post still opens a blank draft, which the
  // integration tests fill in with PUT.
  @Post("entries") async create(@Req() req: Request, @Body() body: unknown) {
    const v = entryInput.partial().parse(body ?? {});
    const admin = await currentAdmin(req);
    const tags = [...new Set(v.tags || [])];
    const published = v.status === "published";
    const entry = await db.$transaction(async (tx) => {
      const created = await tx.entry.create({
        data: {
          title: v.title?.trim() || "",
          occurredOn: v.occurredOn || shanghaiToday(),
          kind: v.kind ?? "daily",
          body: v.body ?? "",
          tags,
          status: v.status ?? "draft",
          visibility: v.visibility ?? "private",
          milestone: v.milestone ?? false,
          featured: v.featured ?? false,
          // Media is attached by a later save; a brand new story has none.
          coverMediaId: null,
          authorId: admin.id,
          publishedAt: published ? new Date() : null,
        },
      });
      if (tags.length)
        await tx.tag.createMany({
          data: tags.map((name) => ({ name })),
          skipDuplicates: true,
        });
      return created;
    });
    return entry;
  }
  @Put("entries/:id") async save(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { admin, entry: existing } = await editableEntry(req, id);
    const { media, ...data } = entryInput.parse(body);
    if (
      data.coverMediaId &&
      !existing.media.some(
        (m) =>
          m.id === data.coverMediaId &&
          m.state === "ready" &&
          m.kind === "image",
      )
    )
      throw new BadRequestException("封面必须来自本篇已上传的照片");
    if (
      media &&
      (new Set(media.map((m) => m.id)).size !== media.length ||
        media.some(
          (m) =>
            !existing.media.some((e) => e.id === m.id && e.state === "ready"),
        ))
    )
      throw new BadRequestException("媒体不属于本篇记录");
    if (
      data.status === "published" &&
      existing.media.some((m) => m.state !== "ready")
    )
      throw new BadRequestException("请完成或移除未成功的上传后再发布");
    const tags = [...new Set(data.tags)];
    await db.$transaction(async (tx) => {
      await tx.entry.update({
        where: { id },
        data: {
          ...data,
          tags,
          authorId: existing.authorId ?? admin.id,
          publishedAt:
            data.status === "published"
              ? existing.publishedAt || new Date()
              : existing.publishedAt,
        },
      });
      if (tags.length)
        await tx.tag.createMany({
          data: tags.map((name) => ({ name })),
          skipDuplicates: true,
        });
      if (media)
        for (const [position, m] of media.entries())
          await tx.media.update({
            where: { id: m.id },
            data: { position, caption: m.caption, attached: true },
          });
    });
    return this.content.get(id, true);
  }
  @Delete("entries/:id") async remove(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const list = (await editableEntry(req, id)).entry.media;
    if (list.some((m) => ["uploading", "processing"].includes(m.state)))
      throw new BadRequestException("请等待媒体上传或处理完成后删除记录");
    await db.entry.delete({ where: { id } });
    for (const m of list) {
      for (const s of ["original", "display", "thumb", "staging"])
        await this.media.remove(`${m.key}.${s}`).catch(() => {});
      if (config().storage === "oss")
        await this.media.remove(`staging/${m.key}`).catch(() => {});
    }
    return { ok: true };
  }
  @Get("profile") profile() {
    return this.content.profile(true);
  }
  @Put("profile") async setProfile(@Req() req: Request, @Body() body: unknown) {
    const admin = await currentAdmin(req);
    const v = profileInput.parse(body);
    for (const id of [v.coverMediaId, v.aboutCoverMediaId])
      if (id && !(await db.media.findFirst({ where: { id, ...coverChoice } })))
        throw new BadRequestException(
          "封面需要选择上传的图片，或公开故事中的照片",
        );
    const before = await db.profile.findUniqueOrThrow({ where: { id: 1 } });
    await db.profile.update({ where: { id: 1 }, data: v });
    const changed = Object.keys(profileLabels).filter(
      (key) =>
        (before as Record<string, unknown>)[key] !==
        (v as Record<string, unknown>)[key],
    );
    if (changed.length)
      await audit(
        admin,
        "profile.update",
        `修改了网站资料：${changed.map((key) => profileLabels[key]).join("、")}`,
      );
    return this.content.profile(true);
  }
  @Post("media/authorize") async authorize(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const v = uploadInput.parse(body);
    if (v.entryId) await editableEntry(req, v.entryId);
    else if (v.mime.startsWith("video/"))
      throw new BadRequestException("页面封面只支持图片");
    return this.media.authorize(v);
  }
  @Put("media/:id/upload") async upload(
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    await editableMedia(req, id);
    return this.media.localUpload(id, req);
  }
  @Post("media/:id/complete") async complete(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const m = await editableMedia(req, id);
    const result = await this.media.complete(id);
    if (!m.entryId && m.state !== "ready" && result.state === "ready")
      await audit(
        await currentAdmin(req),
        "site-media.upload",
        `上传了页面图片「${m.name}」`,
      );
    return result;
  }
  @Get("media/:id/status") async mediaStatus(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    await editableMedia(req, id);
    return this.media.status(id);
  }
  @Delete("media/:id") async removeMedia(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const m = await editableMedia(req, id);
    if (["uploading", "processing"].includes(m.state))
      throw new BadRequestException("请等待文件处理完成");
    await db.media.delete({ where: { id } });
    for (const s of ["original", "display", "thumb", "staging"])
      await this.media.remove(`${m.key}.${s}`).catch(() => {});
    if (config().storage === "oss")
      await this.media.remove(`staging/${m.key}`).catch(() => {});
    if (!m.entryId && m.state === "ready")
      await audit(
        await currentAdmin(req),
        "site-media.delete",
        `删除了页面图片「${m.name}」`,
      );
    return { ok: true };
  }
  @Get("media") async allMedia(@Query("publicOnly") publicOnly?: string) {
    const list = await db.media.findMany({
      where: {
        state: "ready",
        entryId: { not: null },
        ...(publicOnly === "true" ? { entry: visible, attached: true } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return Promise.all(list.map((m) => this.media.present(m)));
  }
  @Get("site-media") async siteMedia() {
    const list = await db.media.findMany({
      where: { entryId: null, state: "ready" },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(list.map((m) => this.media.present(m)));
  }
  @Get("albums") albums() {
    return this.content.albums(true);
  }
  @Get("albums/:id") album(@Param("id") id: string) {
    return this.content.albums(true, id);
  }
  @Post("albums") async createAlbum(@Req() req: Request) {
    const admin = await currentAdmin(req);
    const album = await db.album.create({ data: { title: "新的相册" } });
    await audit(admin, "album.create", `新建了相册「${album.title}」`);
    return album;
  }
  @Put("albums/:id") async saveAlbum(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const admin = await currentAdmin(req);
    idSchema.parse(id);
    const { mediaIds, ...v } = albumInput.parse(body);
    if (
      (await db.media.count({
        where: {
          id: { in: mediaIds },
          state: "ready",
          entryId: { not: null },
        },
      })) !== mediaIds.length
    )
      throw new BadRequestException("包含不可用媒体");
    if (v.coverMediaId && !mediaIds.includes(v.coverMediaId))
      throw new BadRequestException("封面必须在相册内");
    const before = await db.album.findUniqueOrThrow({ where: { id } });
    await db.$transaction(async (tx) => {
      await tx.album.update({ where: { id }, data: v });
      await tx.albumItem.deleteMany({ where: { albumId: id } });
      await tx.albumItem.createMany({
        data: mediaIds.map((mediaId, position) => ({
          albumId: id,
          mediaId,
          position,
        })),
      });
    });
    await audit(
      admin,
      "album.update",
      before.title === v.title
        ? `修改了相册「${v.title}」`
        : `修改了相册「${before.title}」，并改名为「${v.title}」`,
    );
    return this.content.albums(true, id);
  }
  @Delete("albums/:id") async removeAlbum(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const admin = await currentAdmin(req);
    idSchema.parse(id);
    const album = await db.album.delete({ where: { id } });
    await audit(admin, "album.delete", `删除了相册「${album.title}」`);
    return { ok: true };
  }
  @Get("growth") growthRecords() {
    return this.content.growth(true);
  }
  @Post("growth") async addMeasurement(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const admin = await currentAdmin(req);
    const saved = await db.measurement
      .create({ data: measurement(body) })
      .catch(sameDay);
    await audit(
      admin,
      "growth.create",
      `添加了 ${saved.measuredOn} 的成长记录（${growthValues(saved)}）`,
    );
    return saved;
  }
  @Put("growth/:id") async saveMeasurement(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const admin = await currentAdmin(req);
    idSchema.parse(id);
    const saved = await db.measurement
      .update({ where: { id }, data: measurement(body) })
      .catch(sameDay);
    await audit(
      admin,
      "growth.update",
      `修改了 ${saved.measuredOn} 的成长记录（${growthValues(saved)}）`,
    );
    return saved;
  }
  @Delete("growth/:id") async removeMeasurement(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const admin = await currentAdmin(req);
    idSchema.parse(id);
    const removed = await db.measurement.delete({ where: { id } });
    await audit(
      admin,
      "growth.delete",
      `删除了 ${removed.measuredOn} 的成长记录（${growthValues(removed)}）`,
    );
    return { ok: true };
  }
  @Get("health-records") healthRecords() {
    return db.healthRecord.findMany({
      orderBy: [
        { nextDueOn: { sort: "asc", nulls: "last" } },
        { occurredOn: "desc" },
      ],
    });
  }
  @Post("health-records") async addHealthRecord(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const admin = await currentAdmin(req);
    const saved = await db.healthRecord.create({ data: healthRecord(body) });
    await audit(
      admin,
      "health.create",
      `添加了健康记录：${healthSummary(saved)}`,
    );
    return saved;
  }
  @Put("health-records/:id") async saveHealthRecord(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const admin = await currentAdmin(req);
    idSchema.parse(id);
    const saved = await db.healthRecord.update({
      where: { id },
      data: healthRecord(body),
    });
    await audit(
      admin,
      "health.update",
      `修改了健康记录：${healthSummary(saved)}`,
    );
    return saved;
  }
  @Delete("health-records/:id") async removeHealthRecord(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const admin = await currentAdmin(req);
    idSchema.parse(id);
    const removed = await db.healthRecord.delete({ where: { id } });
    await audit(
      admin,
      "health.delete",
      `删除了健康记录：${healthSummary(removed)}`,
    );
    return { ok: true };
  }
  @Put("growth-visibility") async setGrowthVisibility(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const admin = await currentAdmin(req);
    const v = z.object({ public: z.boolean() }).parse(body);
    const before = await db.profile.findUniqueOrThrow({ where: { id: 1 } });
    await db.profile.update({
      where: { id: 1 },
      data: { growthPublic: v.public },
    });
    if (before.growthPublic !== v.public)
      await audit(
        admin,
        "growth.visibility",
        v.public ? "在「关于啵啵」页面公开了成长曲线" : "取消了成长曲线的公开",
      );
    return v;
  }
  @Get("ai/status") async aiStatus(@Req() req: Request) {
    return this.ai.status(await currentAdmin(req));
  }
  @Put("ai/consent") async aiConsent(@Req() req: Request) {
    const admin = await currentAdmin(req);
    const saved = await db.admin.update({
      where: { id: admin.id },
      data: { aiConsentAt: new Date() },
    });
    return this.ai.status(saved);
  }
  @Post("ai/draft") async aiDraft(@Req() req: Request, @Body() body: unknown) {
    return this.ai.draft(await currentAdmin(req), body);
  }
  @Get("ai/quotas") async aiQuotas(@Req() req: Request) {
    await owner(req);
    return this.ai.usage();
  }
  @Put("ai/quotas") async setAiQuotas(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const admin = await owner(req);
    const v = aiQuotaInput.parse(body);
    await db.profile.update({
      where: { id: 1 },
      data: { aiDraftQuota: v.draft, aiChatQuota: v.chat },
    });
    await audit(
      admin,
      "ai.quotas",
      `把每人每天的 AI 额度改为写作 ${v.draft} 次、聊天 ${v.chat} 句`,
    );
    return this.ai.usage();
  }
  @Get("ai/conversations") async aiConversations(@Req() req: Request) {
    return this.ai.conversations(await currentAdmin(req));
  }
  @Post("ai/conversations") async aiNewConversation(@Req() req: Request) {
    return this.ai.newConversation(await currentAdmin(req));
  }
  @Delete("ai/conversations") async aiClearConversations(@Req() req: Request) {
    return this.ai.clearConversations(await currentAdmin(req));
  }
  @Get("ai/conversations/:id") async aiConversation(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    idSchema.parse(id);
    return this.ai.conversation(await currentAdmin(req), id);
  }
  @Delete("ai/conversations/:id") async aiRemoveConversation(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    idSchema.parse(id);
    return this.ai.removeConversation(await currentAdmin(req), id);
  }
  @Post("ai/conversations/:id/messages") async aiMessage(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    idSchema.parse(id);
    return this.ai.chat(await currentAdmin(req), id, body);
  }
  @Get("audit-logs") async auditLogs(@Req() req: Request) {
    await owner(req);
    return db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, actorName: true, summary: true, createdAt: true },
    });
  }
}
@Module({
  controllers: [PublicController, AdminController],
  providers: [Content, MediaService, AdminGuard, AiService],
})
class AppModule {}
async function main() {
  const cfg = config();
  await db.$connect();
  await db.media.updateMany({
    where: { state: { in: ["uploading", "processing"] } },
    data: { state: "pending" },
  });
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: true,
  });
  // The API is only reachable through Nginx, which sets X-Forwarded-For.
  app.set("trust proxy", 1);
  // A 50,000-character story body can exceed the 100kb default in UTF-8.
  app.useBodyParser("json", { limit: "1mb" });
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(cookieParser());
  const failedAttempts = (limit: number, message: string) =>
    rateLimit({
      windowMs: 15 * 60000,
      limit,
      skipSuccessfulRequests: true,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { message },
    });
  app.use("/api/auth/login", failedAttempts(15, "登录尝试过多，请稍后再试"));
  app.use(
    "/api/auth/password",
    failedAttempts(10, "密码尝试次数过多，请稍后再试"),
  );
  app.use((req: Request, res: Response, next: () => void) => {
    res.setHeader("Cache-Control", "no-store");
    // Sessions last a week, so an account signed in before the chat existed
    // would never receive the readable hint the public pages look for. Mirror
    // it from the session cookie instead of only issuing it at login. No query
    // is needed: it decides one button, and every endpoint still checks the
    // session itself.
    if (req.cookies?.bobo_session && req.cookies.bobo_family !== "1")
      res.cookie("bobo_family", "1", {
        httpOnly: false,
        secure: cfg.secure,
        sameSite: "strict",
        path: "/",
        maxAge: 7 * 86400000,
      });
    else if (!req.cookies?.bobo_session && req.cookies?.bobo_family)
      res.clearCookie("bobo_family", {
        path: "/",
        secure: cfg.secure,
        sameSite: "strict",
      });
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== cfg.origin
    )
      return res.status(403).json({ message: "请求来源不匹配" });
    next();
  });
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  await app.listen(3000, "0.0.0.0");
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
