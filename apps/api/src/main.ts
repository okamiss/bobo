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
} from "./validation";
const idSchema = z.string().uuid();
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
  if (media.entryId) await editableEntry(req, media.entryId);
  else await owner(req);
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
        kind: z.enum(["daily", "event"]).optional(),
        tag: z.string().max(30).optional(),
        q: z.string().max(100).optional(),
        milestone: z.enum(["true"]).optional(),
        featured: z.enum(["true"]).optional(),
      })
      .parse(query);
    const where: any = {
      ...(admin ? {} : visible),
      ...(q.year ? { occurredOn: { startsWith: q.year } } : {}),
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
        orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
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
    const [previous, next] = admin
      ? [null, null]
      : await Promise.all([
          db.entry.findFirst({
            where: {
              ...visible,
              OR: [
                { occurredOn: { gt: entry.occurredOn } },
                { occurredOn: entry.occurredOn, id: { gt: id } },
              ],
            },
            select,
            orderBy: [{ occurredOn: "asc" }, { id: "asc" }],
          }),
          db.entry.findFirst({
            where: {
              ...visible,
              OR: [
                { occurredOn: { lt: entry.occurredOn } },
                { occurredOn: entry.occurredOn, id: { lt: id } },
              ],
            },
            select,
            orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
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
      orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
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
function sameDay(error: any): never {
  if (error.code === "P2002")
    throw new ConflictException("这一天已经有记录了，请直接修改那一条");
  throw error;
}
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
    return { ok: true };
  }
}
@Controller("api/admin")
@UseGuards(AdminGuard)
class AdminController {
  constructor(
    private readonly content: Content,
    private readonly media: MediaService,
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
  @Get("entries/:id") entry(@Param("id") id: string) {
    return this.content.get(id, true);
  }
  @Post("entries") async create(@Req() req: Request, @Body() body: unknown) {
    const v = z.object({ occurredOn: date.optional() }).parse(body);
    const admin = await currentAdmin(req);
    return db.entry.create({
      data: {
        title: "未命名的日子",
        authorId: admin.id,
        occurredOn: v.occurredOn || shanghaiToday(),
      },
    });
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
    await db.$transaction(async (tx) => {
      await tx.entry.update({
        where: { id },
        data: {
          ...data,
          tags: [...new Set(data.tags)],
          authorId: existing.authorId ?? admin.id,
          publishedAt:
            data.status === "published"
              ? existing.publishedAt || new Date()
              : existing.publishedAt,
        },
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
    await owner(req);
    const v = profileInput.parse(body);
    for (const id of [v.coverMediaId, v.aboutCoverMediaId])
      if (id && !(await db.media.findFirst({ where: { id, ...coverChoice } })))
        throw new BadRequestException(
          "封面需要选择上传的图片，或公开故事中的照片",
        );
    await db.profile.update({ where: { id: 1 }, data: v });
    return this.content.profile(true);
  }
  @Post("media/authorize") async authorize(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const v = uploadInput.parse(body);
    if (v.entryId) await editableEntry(req, v.entryId);
    else {
      await owner(req);
      if (v.mime.startsWith("video/"))
        throw new BadRequestException("页面封面只支持图片");
    }
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
    await editableMedia(req, id);
    return this.media.complete(id);
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
  @Get("site-media") async siteMedia(@Req() req: Request) {
    await owner(req);
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
    await owner(req);
    return db.album.create({ data: { title: "新的相册" } });
  }
  @Put("albums/:id") async saveAlbum(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    await owner(req);
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
    return this.content.albums(true, id);
  }
  @Delete("albums/:id") async removeAlbum(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    await owner(req);
    idSchema.parse(id);
    await db.album.delete({ where: { id } });
    return { ok: true };
  }
  @Get("growth") async growthRecords(@Req() req: Request) {
    await owner(req);
    return this.content.growth(true);
  }
  @Post("growth") async addMeasurement(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    await owner(req);
    return db.measurement.create({ data: measurement(body) }).catch(sameDay);
  }
  @Put("growth/:id") async saveMeasurement(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    await owner(req);
    idSchema.parse(id);
    return db.measurement
      .update({ where: { id }, data: measurement(body) })
      .catch(sameDay);
  }
  @Delete("growth/:id") async removeMeasurement(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    await owner(req);
    idSchema.parse(id);
    await db.measurement.delete({ where: { id } });
    return { ok: true };
  }
  @Put("growth-visibility") async setGrowthVisibility(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    await owner(req);
    const v = z.object({ public: z.boolean() }).parse(body);
    await db.profile.update({
      where: { id: 1 },
      data: { growthPublic: v.public },
    });
    return v;
  }
}
@Module({
  controllers: [PublicController, AdminController],
  providers: [Content, MediaService, AdminGuard],
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
