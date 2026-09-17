import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaClient, Media } from "@prisma/client";
import sharp from "sharp";
import { mkdir, stat, unlink, open } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { config, sign, ossClient, type OssClient } from "./config";
import { visible } from "./validation";
const exec = promisify(execFile);
export const db = new PrismaClient();
export const mediaOrder = [
  { position: "asc" as const },
  { id: "asc" as const },
];
@Injectable()
export class MediaService {
  private oss: OssClient | undefined;
  constructor() {
    if (config().storage === "oss") this.oss = ossClient();
  }
  path(key: string) {
    return join(config().root, key);
  }
  async put(key: string, file: string, contentType?: string) {
    if (this.oss)
      await this.oss.put(key, file, {
        headers: {
          ...(contentType ? { "Content-Type": contentType } : {}),
          "Cache-Control": "private, max-age=0",
        },
      });
    else {
      await mkdir(config().root, { recursive: true });
      await pipeline(createReadStream(file), createWriteStream(this.path(key)));
    }
  }
  async remove(key: string) {
    if (this.oss) await this.oss.delete(key);
    else await unlink(this.path(key)).catch(() => {});
  }
  async authorize(data: {
    entryId: string | null;
    name: string;
    mime: string;
    size: number;
  }) {
    if (
      data.entryId &&
      !(await db.entry.findUnique({ where: { id: data.entryId } }))
    )
      throw new NotFoundException();
    const id = randomUUID();
    const m = await db.media.create({
      data: {
        ...data,
        id,
        key: id,
        kind: data.mime === "video/mp4" ? "video" : "image",
      },
    });
    const url = this.oss
      ? await this.oss.signatureUrlV4(
          "PUT",
          600,
          { headers: { "Content-Type": data.mime } },
          `staging/${id}`,
        )
      : `/api/admin/media/${id}/upload`;
    return {
      id: m.id,
      url,
      method: "PUT",
      headers: { "Content-Type": data.mime },
    };
  }
  async localUpload(id: string, req: Request) {
    if (this.oss) throw new BadRequestException("当前为 OSS 直传模式");
    const m = await db.media.findUnique({ where: { id } });
    if (!m || m.state !== "pending")
      throw new BadRequestException("上传任务不可用");
    const claim = await db.media.updateMany({
      where: { id, state: "pending" },
      data: { state: "uploading" },
    });
    if (!claim.count) throw new BadRequestException("上传正在进行");
    await mkdir(config().root, { recursive: true });
    let size = 0;
    try {
      await pipeline(
        req,
        new Transform({
          transform(chunk, _, cb) {
            size += chunk.length;
            cb(size > m.size ? new Error("文件超限") : null, chunk);
          },
        }),
        createWriteStream(this.path(`${id}.staging`)),
      );
      if (size !== m.size) throw new Error("文件大小不符");
    } catch {
      await this.remove(`${id}.staging`);
      throw new BadRequestException("文件上传失败或大小不符");
    } finally {
      await db.media.update({ where: { id }, data: { state: "pending" } });
    }
    return { ok: true };
  }
  async complete(id: string) {
    const m = await db.media.findUnique({ where: { id } });
    if (!m) throw new NotFoundException();
    if (m.state === "ready") return m;
    const lock = await db.media.updateMany({
      where: { id, state: "pending" },
      data: { state: "processing" },
    });
    if (!lock.count) throw new BadRequestException("文件处理中，请稍后重试");
    const temp = join("/tmp", `bobo-${randomUUID()}`);
    await mkdir(temp, { recursive: true });
    const input = join(temp, "input");
    try {
      if (this.oss) {
        const h = await this.oss.head(`staging/${id}`);
        if (
          Number(
            (h.res.headers as Record<string, string>)["content-length"],
          ) !== m.size
        )
          throw new Error("文件大小不符");
        const r = await this.oss.getStream(`staging/${id}`);
        let n = 0;
        await pipeline(
          r.stream,
          new Transform({
            transform(c, _, cb) {
              n += c.length;
              cb(n > m.size ? new Error("文件超限") : null, c);
            },
          }),
          createWriteStream(input),
        );
      } else
        await pipeline(
          createReadStream(this.path(`${id}.staging`)),
          createWriteStream(input),
        );
      if ((await stat(input)).size !== m.size) throw new Error("文件大小不符");
      let width: number | undefined,
        height: number | undefined,
        duration: number | undefined;
      if (m.kind === "image") {
        const meta = await sharp(input, {
          limitInputPixels: 60000000,
        }).metadata();
        if (
          !["jpeg", "png", "webp"].includes(meta.format || "") ||
          (meta.pages && meta.pages > 1)
        )
          throw new Error("仅支持静态 JPG、PNG、WebP 图片");
        const expected: { [key: string]: string } = {
          jpeg: "image/jpeg",
          png: "image/png",
          webp: "image/webp",
        };
        if (expected[meta.format!] !== m.mime)
          throw new Error("文件类型与声明不符");
        const info = await sharp(input)
          .rotate()
          .resize({
            width: 2000,
            height: 2000,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 85 })
          .toFile(join(temp, "display"));
        width = info.width;
        height = info.height;
        await sharp(input)
          .rotate()
          .resize(640, 640, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(join(temp, "thumb"));
      } else {
        const { stdout } = await exec(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            input,
          ],
          { timeout: 30000, maxBuffer: 1024 * 1024 },
        );
        const probe = JSON.parse(stdout);
        const v = probe.streams.filter((s: any) => s.codec_type === "video"),
          a = probe.streams.filter((s: any) => s.codec_type === "audio");
        duration = Number(probe.format.duration);
        const file = await open(input, "r");
        const header = Buffer.alloc(32);
        try {
          await file.read(header, 0, 32, 0);
        } finally {
          await file.close();
        }
        if (
          header.subarray(4, 8).toString() !== "ftyp" ||
          header.subarray(8, 12).toString().trim() === "qt" ||
          v.length !== 1 ||
          v[0].codec_name !== "h264" ||
          a.some((s: any) => s.codec_name !== "aac") ||
          !duration ||
          duration > 180 ||
          v[0].width > 7680 ||
          v[0].height > 7680
        )
          throw new Error("需要 3 分钟以内的 MP4 / H.264 视频，音轨为 AAC");
        width = v[0].width;
        height = v[0].height;
        await exec(
          "ffmpeg",
          [
            "-v",
            "error",
            "-i",
            input,
            "-frames:v",
            "1",
            "-vf",
            "scale=640:-2",
            "-y",
            join(temp, "poster.png"),
          ],
          { timeout: 60000 },
        );
        await sharp(join(temp, "poster.png"))
          .webp()
          .toFile(join(temp, "thumb"));
      }
      await this.put(`${id}.original`, input, m.mime);
      await this.put(`${id}.thumb`, join(temp, "thumb"), "image/webp");
      if (m.kind === "image")
        await this.put(
          `${id}.display`,
          join(temp, "display"),
          "image/webp",
        );
      const result = await db.media.update({
        where: { id },
        data: { state: "ready", width, height, duration },
      });
      await this.remove(this.oss ? `staging/${id}` : `${id}.staging`).catch(
        () => {},
      );
      return result;
    } catch (e: any) {
      await db.media.update({ where: { id }, data: { state: "pending" } });
      throw new BadRequestException(e.message?.slice(0, 200) || "媒体处理失败");
    } finally {
      const { rm } = await import("node:fs/promises");
      await rm(temp, { recursive: true, force: true });
    }
  }
  async accessible(id: string, admin: boolean) {
    // Site images are public only while they are used as a page cover.
    const p = admin ? null : await db.profile.findUnique({ where: { id: 1 } });
    const covers = [p?.coverMediaId, p?.aboutCoverMediaId].filter(
      (x): x is string => !!x,
    );
    const m = await db.media.findFirst({
      where: {
        id,
        state: "ready",
        ...(admin
          ? {}
          : {
              OR: [
                { entry: visible, attached: true },
                { entryId: null, id: { in: covers } },
              ],
            }),
      },
    });
    if (!m) throw new NotFoundException();
    return m;
  }
  async url(m: Media, variant: string) {
    const suffix =
      variant === "thumb"
        ? "thumb"
        : m.kind === "image"
          ? "display"
          : "original";
    const key = `${m.key}.${suffix}`;
    if (this.oss)
      return await this.oss.signatureUrlV4("GET", 300, {}, key);
    const expires = Date.now() + 300000;
    return `/api/media/${m.id}/file/${suffix}?expires=${expires}&token=${sign(`${m.id}:${suffix}:${expires}`)}`;
  }
  async present(m: Media) {
    return {
      ...m,
      url: await this.url(m, "display"),
      thumb: await this.url(m, "thumb"),
    };
  }
  async serve(
    id: string,
    variant: string,
    expires: string,
    token: string,
    res: Response,
  ) {
    if (this.oss || !["thumb", "display", "original"].includes(variant))
      throw new NotFoundException();
    const expected = sign(`${id}:${variant}:${expires}`);
    if (
      !token ||
      !/^[a-f0-9]{64}$/.test(token) ||
      !/^\d{13}$/.test(expires) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected)) ||
      Number(expires) < Date.now() ||
      Number(expires) > Date.now() + 300000
    )
      throw new UnauthorizedException();
    const m = await db.media.findUnique({ where: { id } });
    if (
      !m ||
      m.state !== "ready" ||
      (variant === "original" && m.kind !== "video")
    )
      throw new NotFoundException();
    res.setHeader("Cache-Control", "private, no-store");
    res.type(variant === "original" ? "video/mp4" : "image/webp");
    res.sendFile(this.path(`${m.key}.${variant}`));
  }
}
