import OSS from "ali-oss";
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
export type OssClient = OSS & {
  signatureUrlV4(
    method: string,
    expires: number,
    options: Record<string, unknown>,
    name: string,
  ): Promise<string>;
};
export function ossClient() {
  const e = process.env;
  return new OSS({
    region: e.OSS_REGION!,
    bucket: e.OSS_BUCKET!,
    accessKeyId: e.OSS_ACCESS_KEY_ID!,
    accessKeySecret: e.OSS_ACCESS_KEY_SECRET!,
    secure: true,
    authorizationV4: true,
  } as any) as OssClient;
}
export function config() {
  const e = process.env;
  for (const key of ["DATABASE_URL", "APP_ORIGIN", "SESSION_SECRET"])
    if (!e[key]) throw new Error(`缺少配置 ${key}`);
  if (e.SESSION_SECRET!.length < 32)
    throw new Error("SESSION_SECRET 至少 32 位");
  const origin = new URL(e.APP_ORIGIN!).origin;
  const secure = origin.startsWith("https:");
  if (e.DEPLOY_ENV === "production" && !secure)
    throw new Error("生产环境 APP_ORIGIN 必须使用 HTTPS");
  const storage = e.STORAGE_DRIVER || "local";
  if (!["local", "oss"].includes(storage))
    throw new Error("STORAGE_DRIVER 必须为 local 或 oss");
  if (storage === "oss")
    for (const key of [
      "OSS_REGION",
      "OSS_BUCKET",
      "OSS_ACCESS_KEY_ID",
      "OSS_ACCESS_KEY_SECRET",
    ])
      if (!e[key]) throw new Error(`OSS 模式缺少 ${key}`);
  return {
    origin,
    secure,
    storage,
    secret: e.SESSION_SECRET!,
    root: e.MEDIA_ROOT || "/data/media",
  };
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function sign(value: string) {
  return createHmac("sha256", config().secret).update(value).digest("hex");
}
