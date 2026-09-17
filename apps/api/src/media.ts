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
  // Every OSS object of this site lives under OSS_PREFIX (default "bobo/").
  objectKey(key: string) {
    return config().ossPrefix + key;
  }
  async put(key: string, file: string, contentType?: string) {
    if (this.oss)
      await this.oss.put(this.objectKey(key), file, {
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
    if (this.oss) await this.oss.delete(this.objectKey(key));
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
        kind: data.mime.startsWith("video/") ? "video" : "image",
      },
    });
    const url = this.oss
      ? await this.oss.signatureUrlV4(
          "PUT",
          600,
          { headers: { "Content-Type": data.mime } },
          this.objectKey(`staging/${id}`),
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
  // Background failures, reported by status() until the next attempt.
  private failures = new Map<string, string>();
  // Transcoding is CPU heavy, so videos that need it are processed one by one.
  private transcoding: Promise<unknown> = Promise.resolve();
  async complete(id: string) {
    const m = await db.media.findUnique({ where: { id } });
    if (!m) throw new NotFoundException();
    if (m.state === "ready") return m;
    const lock = await db.media.updateMany({
      where: { id, state: "pending" },
      data: { state: "processing" },
    });
    if (!lock.count) throw new BadRequestException("文件处理中，请稍后重试");
    this.failures.delete(id);
    const job = this.process(m);
    // Most files finish quickly and answer this request directly. A long video
    // transcode would outlive the proxy timeout, so it continues in the
    // background while the admin page polls status().
    const wait = Number(process.env.MEDIA_WAIT_SECONDS ?? 20) * 1000;
    let timer: NodeJS.Timeout | undefined;
    const finished = await Promise.race([
      job.then(
        () => true,
        () => true,
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(resolve, wait, false);
      }),
    ]);
    clearTimeout(timer);
    if (!finished) return { ...m, state: "processing" };
    return job;
  }
  async status(id: string) {
    const m = await db.media.findUniqueOrThrow({ where: { id } });
    return {
      id,
      state: m.state,
      error: m.state === "pending" ? this.failures.get(id) || null : null,
    };
  }
  private async process(m: Media) {
    const id = m.id;
    const temp = join("/tmp", `bobo-${randomUUID()}`);
    await mkdir(temp, { recursive: true });
    const input = join(temp, "input");
    try {
      if (this.oss) {
        const h = await this.oss.head(this.objectKey(`staging/${id}`));
        if (
          Number(
            (h.res.headers as Record<string, string>)["content-length"],
          ) !== m.size
        )
          throw new Error("文件大小不符");
        const r = await this.oss.getStream(this.objectKey(`staging/${id}`));
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
      let file = input,
        mime = m.mime,
        width: number | undefined,
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
        ({ file, width, height, duration } = await this.video(input, temp));
        mime = "video/mp4";
      }
      await this.put(`${id}.original`, file, mime);
      await this.put(`${id}.thumb`, join(temp, "thumb"), "image/webp");
      if (m.kind === "image")
        await this.put(
          `${id}.display`,
          join(temp, "display"),
          "image/webp",
        );
      const result = await db.media.update({
        where: { id },
        data: {
          state: "ready",
          mime,
          size: (await stat(file)).size,
          width,
          height,
          duration,
        },
      });
      await this.remove(this.oss ? `staging/${id}` : `${id}.staging`).catch(
        () => {},
      );
      return result;
    } catch (e: any) {
      const message = e.message?.slice(0, 200) || "媒体处理失败";
      this.failures.set(id, message);
      await db.media.update({ where: { id }, data: { state: "pending" } });
      throw new BadRequestException(message);
    } finally {
      const { rm } = await import("node:fs/promises");
      await rm(temp, { recursive: true, force: true });
    }
  }
  private async probe(file: string) {
    const { stdout } = await exec(
      "ffprobe",
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", file],
      { timeout: 30000, maxBuffer: 4 * 1024 * 1024 },
    );
    const probe = JSON.parse(stdout);
    return {
      duration: Number(probe.format?.duration),
      video: probe.streams.filter((s: any) => s.codec_type === "video"),
      audio: probe.streams.filter((s: any) => s.codec_type === "audio"),
    };
  }
  // Browsers play MP4 with 8-bit 4:2:0 H.264 and AAC, so such uploads are kept
  // as they are. Anything else, such as iPhone HEVC/HDR MOV, becomes H.264 MP4.
  private async video(input: string, temp: string) {
    const source = await this.probe(input).catch(() => {
      throw new Error("无法识别这个视频文件，请上传 MP4 或 MOV 视频");
    });
    const [v] = source.video;
    if (!v || !source.duration)
      throw new Error("无法识别这个视频文件，请上传 MP4 或 MOV 视频");
    if (source.duration > 180)
      throw new Error("视频最长 3 分钟，请剪短后再上传");
    if (v.width > 7680 || v.height > 7680) throw new Error("视频分辨率过大");
    const header = Buffer.alloc(12);
    const handle = await open(input, "r");
    try {
      await handle.read(header, 0, 12, 0);
    } finally {
      await handle.close();
    }
    const playable =
      header.subarray(4, 8).toString() === "ftyp" &&
      header.subarray(8, 12).toString().trim() !== "qt" &&
      source.video.length === 1 &&
      v.codec_name === "h264" &&
      v.pix_fmt === "yuv420p" &&
      source.audio.every((s: any) => s.codec_name === "aac");
    let file = input,
      result = source;
    if (!playable) {
      file = join(temp, "video.mp4");
      await this.transcode(input, file, v, source.audio);
      result = await this.probe(file);
    }
    await exec(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        file,
        "-frames:v",
        "1",
        "-vf",
        "scale=640:-2",
        "-y",
        join(temp, "poster.png"),
      ],
      { timeout: 60000 },
    );
    await sharp(join(temp, "poster.png")).webp().toFile(join(temp, "thumb"));
    // Phones store portrait video as landscape frames plus a rotation.
    const [out] = result.video;
    const rotation = Number(
      out.side_data_list?.find((d: any) => d.rotation !== undefined)
        ?.rotation ??
        out.tags?.rotate ??
        0,
    );
    const turned = Math.abs(rotation) % 180 === 90;
    return {
      file,
      width: turned ? out.height : out.width,
      height: turned ? out.width : out.height,
      duration: result.duration,
    };
  }
  private transcode(input: string, output: string, video: any, audio: any[]) {
    const decodable = ["aac", "alac", "mp3", "opus", "ac3", "eac3", "flac"];
    const sound = audio.find(
      (s) =>
        decodable.includes(s.codec_name) || s.codec_name?.startsWith("pcm_"),
    );
    const size =
      "scale=w=min(1920\\,iw):h=min(1920\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2";
    // HDR (HLG or PQ, as iPhones record by default) looks washed out when
    // simply converted to 8-bit, so tone map it to SDR first.
    const hdr = ["arib-std-b67", "smpte2084"].includes(video.color_transfer);
    const toneMap =
      "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv";
    const run = (filters: string) =>
      exec(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          input,
          "-map",
          "0:v:0",
          ...(sound ? ["-map", `0:${sound.index}`] : []),
          "-vf",
          // The encoder takes color tags from the frames, so set them here.
          `${filters},format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709`,
          "-fpsmax",
          "30",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "23",
          ...(sound ? ["-c:a", "aac", "-b:a", "128k", "-ac", "2"] : []),
          "-movflags",
          "+faststart",
          "-y",
          output,
        ],
        { timeout: 30 * 60000, maxBuffer: 4 * 1024 * 1024 },
      );
    const task = async () => {
      try {
        try {
          await run(hdr ? `${size},${toneMap}` : size);
        } catch (e) {
          if (!hdr) throw e;
          console.error("Tone mapping failed, converting without it", e);
          await run(size);
        }
      } catch (e) {
        console.error("Video transcode failed", e);
        throw new Error("视频格式转换失败，请换一个视频或重新导出后再试");
      }
    };
    const queued = this.transcoding.then(task);
    this.transcoding = queued.catch(() => {});
    return queued;
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
      return await this.oss.signatureUrlV4(
        "GET",
        300,
        {},
        this.objectKey(key),
      );
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
