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
  BadRequestException,
  NotFoundException,
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
} from "@nestjs/common";
import { Request, Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomBytes } from "node:crypto";
import { z, ZodError } from "zod";
import { config, sign, checkPassword } from "./config";
import { db, MediaService, mediaOrder } from "./media";
import {
  entryInput,
  profileInput,
  albumInput,
  uploadInput,
  visible,
  date,
} from "./validation";
const idSchema = z.string().uuid();
async function session(req: Request) {
  const token = req.cookies?.bobo_session;
  if (!token) return null;
  return db.session.findFirst({
    where: { id: sign(token), expiresAt: { gt: new Date() } },
  });
}
@Injectable()
class AdminGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext) {
    if (!(await session(ctx.switchToHttp().getRequest())))
      throw new UnauthorizedException("请先登录");
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
        media: { orderBy: mediaOrder, where: admin ? {} : { attached: true } },
      },
    });
    if (!entry) throw new NotFoundException("这篇故事暂时没有公开");
    const ordering = [{ occurredOn: "desc" as const }, { id: "desc" as const }];
    const neighbors = admin
      ? []
      : await db.entry.findMany({
          where: visible,
          select: { id: true, title: true, occurredOn: true },
          orderBy: ordering,
        });
    const index = neighbors.findIndex((x) => x.id === id);
    return {
      ...(await this.present(entry)),
      uploads: admin
        ? entry.media
            .filter((m) => m.state !== "ready")
            .map((m) => ({ id: m.id, name: m.name, state: m.state }))
        : undefined,
      previous: neighbors[index - 1] || null,
      next: neighbors[index + 1] || null,
    };
  }
  async profile(admin = false) {
    const p = await db.profile.findUniqueOrThrow({ where: { id: 1 } });
    const cover = p.coverMediaId
      ? await db.media.findFirst({
          where: {
            id: p.coverMediaId,
            state: "ready",
            kind: "image",
            ...(admin ? {} : { entry: visible, attached: true }),
          },
        })
      : null;
    return {
      ...p,
      coverMediaId: cover?.id || null,
      cover: cover ? await this.media.present(cover) : null,
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
    if (!admin || !checkPassword(v.password, admin.passwordHash))
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
    return { username: admin.username };
  }
  @Get("auth/me") async me(@Req() req: Request) {
    const s = await session(req);
    if (!s) throw new UnauthorizedException("请先登录");
    return {
      username: (await db.admin.findUniqueOrThrow({ where: { id: s.adminId } }))
        .username,
    };
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
  @Get("entries") entries(@Query() q: any) {
    return this.content.list(q, true);
  }
  @Get("entries/:id") entry(@Param("id") id: string) {
    return this.content.get(id, true);
  }
  @Post("entries") async create(@Body() body: unknown) {
    const v = z.object({ occurredOn: date.optional() }).parse(body);
    return db.entry.create({
      data: {
        title: "未命名的日子",
        occurredOn:
          v.occurredOn ||
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Shanghai",
          }).format(new Date()),
      },
    });
  }
  @Put("entries/:id") async save(
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    idSchema.parse(id);
    const { media, ...data } = entryInput.parse(body);
    const existing = await db.entry.findUnique({
      where: { id },
      include: { media: true },
    });
    if (!existing) throw new NotFoundException();
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
  @Delete("entries/:id") async remove(@Param("id") id: string) {
    idSchema.parse(id);
    const list = await db.media.findMany({ where: { entryId: id } });
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
  @Put("profile") async setProfile(@Body() body: unknown) {
    const v = profileInput.parse(body);
    if (
      v.coverMediaId &&
      !(await db.media.findFirst({
        where: {
          id: v.coverMediaId,
          state: "ready",
          attached: true,
          kind: "image",
          entry: visible,
        },
      }))
    )
      throw new BadRequestException("首页封面需要选择公开故事中的照片");
    await db.profile.update({ where: { id: 1 }, data: v });
    return this.content.profile(true);
  }
  @Post("media/authorize") authorize(@Body() body: unknown) {
    return this.media.authorize(uploadInput.parse(body));
  }
  @Put("media/:id/upload") upload(
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    idSchema.parse(id);
    return this.media.localUpload(id, req);
  }
  @Post("media/:id/complete") complete(@Param("id") id: string) {
    idSchema.parse(id);
    return this.media.complete(id);
  }
  @Delete("media/:id") async removeMedia(@Param("id") id: string) {
    idSchema.parse(id);
    const m = await db.media.findUniqueOrThrow({ where: { id } });
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
        ...(publicOnly === "true" ? { entry: visible, attached: true } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return Promise.all(list.map((m) => this.media.present(m)));
  }
  @Get("albums") albums() {
    return this.content.albums(true);
  }
  @Get("albums/:id") album(@Param("id") id: string) {
    return this.content.albums(true, id);
  }
  @Post("albums") async createAlbum() {
    return db.album.create({ data: { title: "新的相册" } });
  }
  @Put("albums/:id") async saveAlbum(
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    idSchema.parse(id);
    const { mediaIds, ...v } = albumInput.parse(body);
    if (
      (await db.media.count({
        where: { id: { in: mediaIds }, state: "ready" },
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
  @Delete("albums/:id") async removeAlbum(@Param("id") id: string) {
    idSchema.parse(id);
    await db.album.delete({ where: { id } });
    return { ok: true };
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
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(cookieParser());
  app.use(
    "/api/auth/login",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 15,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { message: "登录尝试过多，请稍后再试" },
    }),
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
