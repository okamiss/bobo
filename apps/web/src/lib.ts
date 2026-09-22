export type Media = {
  id: string;
  entryId: string | null;
  name: string;
  mime: string;
  kind: "image" | "video";
  url: string;
  thumb: string;
  caption: string;
  width?: number;
  height?: number;
  duration?: number;
};
export type Entry = {
  id: string;
  title: string;
  occurredOn: string;
  kind: "daily" | "event";
  body: string;
  tags: string[];
  status: "draft" | "published";
  visibility: "public" | "private";
  milestone: boolean;
  featured: boolean;
  publishedAt?: string | null;
  coverMediaId: string | null;
  authorId: string | null;
  author: { displayName: string } | null;
  media: Media[];
  previous?: { id: string; title: string };
  next?: { id: string; title: string };
  uploads?: { id: string; name: string; state: string }[];
};
export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: "owner" | "member";
};
export type Account = AuthUser & {
  active: boolean;
  entryCount: number;
};
export type Profile = {
  siteName: string;
  name: string;
  breed: string;
  birthday: string | null;
  homeDate: string | null;
  intro: string;
  personality: string;
  hobbies: string;
  coverMediaId: string | null;
  cover: Media | null;
  aboutCoverMediaId: string | null;
  aboutCover: Media | null;
};
export type Album = {
  id: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  coverMediaId: string | null;
  items: Media[];
};
export type Measurement = {
  id?: string;
  measuredOn: string;
  weight: number | null;
  height: number | null;
  note?: string;
};
export type Growth = { public: boolean; items: Measurement[] };
export type HealthRecordKind = "vaccine" | "deworming" | "checkup" | "grooming";
export type HealthRecord = {
  id: string;
  kind: HealthRecordKind;
  occurredOn: string;
  nextDueOn: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
};
export type HealthReminder = {
  status: "none" | "overdue" | "today" | "soon" | "later";
  days: number | null;
  text: string;
};
export type AuditEntry = {
  id: string;
  actorName: string;
  summary: string;
  createdAt: string;
};
export type Memory = Entry & {
  yearsAgo: number | null;
  monthsAgo: number | null;
};
export type Listing = {
  items: Entry[];
  total: number;
  page: number;
  years: string[];
  tags: string[];
};
export type ManagedTag = { name: string; count: number };
export type AiStatus = {
  enabled: boolean;
  model: string;
  consented: boolean;
  remaining: number;
  quota: number;
  chatRemaining: number;
  chatQuota: number;
};
export type AiQuotas = {
  draft: number;
  chat: number;
  today: { id: string; displayName: string; draft: number; chat: number }[];
};
export type AiSource = {
  id: string;
  title: string;
  occurredOn: string;
  public: boolean;
};
export type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: AiSource[];
  createdAt: string;
};
export type AiConversation = {
  id: string;
  title: string;
  updatedAt: string;
};
export type AiDraft = {
  titles: string[];
  body: string;
  tags: string[];
  captions: { mediaId: string; caption: string }[];
};
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const r = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await r.json().catch(() => ({ message: "网络请求失败" }));
  if (!r.ok) throw new Error(data.message || "请求失败");
  return data;
}
export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
export const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
    new Date(),
  );
// The clock time a story went up, to tell apart several stories from one day.
// Only shown when it was published on the day it is filed under: a story
// backdated to last month must not borrow today's clock.
export function postedTime(entry: {
  occurredOn: string;
  publishedAt?: string | null;
}) {
  if (!entry.publishedAt) return "";
  const at = new Date(entry.publishedAt);
  if (isNaN(+at)) return "";
  const shanghai = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      ...options,
    }).format(at);
  if (
    shanghai({ year: "numeric", month: "2-digit", day: "2-digit" }) !==
    entry.occurredOn.split("-").reverse().join("/")
  )
    return "";
  return shanghai({ hour: "2-digit", minute: "2-digit", hour12: false });
}
export function daysSince(date: string, at = today()) {
  return Math.floor(
    (Date.parse(`${at}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) /
      86400000,
  );
}
export function healthReminder(
  nextDueOn: string | null,
  at = today(),
): HealthReminder {
  if (!nextDueOn) return { status: "none", days: null, text: "未设置下次时间" };
  const days = daysSince(at, nextDueOn);
  if (days < 0) return { status: "overdue", days, text: `已超期 ${-days} 天` };
  if (days === 0) return { status: "today", days, text: "今天到期" };
  if (days <= 7) return { status: "soon", days, text: `${days} 天后` };
  return { status: "later", days, text: `${days} 天后` };
}
export function age(date: string, at = today()) {
  if (at < date) return "";
  let [y, m, d] = at.split("-").map(Number);
  const [by, bm, bd] = date.split("-").map(Number);
  let months = (y - by) * 12 + m - bm - (d < bd ? 1 : 0);
  if (months < 1) return `${daysSince(date, at)} 天`;
  return `${Math.floor(months / 12) ? `${Math.floor(months / 12)} 岁 ` : ""}${months % 12 ? `${months % 12} 个月` : ""}`.trim();
}
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000)
    .toISOString()
    .slice(0, 10);
// The first day that is n whole months after date, matching age(): when the
// month is too short (for example Jan 31 + 1), that is the 1st of the next.
function addMonths(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  if (d > last) target.setUTCMonth(target.getUTCMonth() + 1);
  else target.setUTCDate(d);
  return target.toISOString().slice(0, 10);
}
export type Anniversary = {
  date: string;
  title: string;
  kind: "birthday" | "home";
  daysLeft: number;
};
export function anniversaries(
  p: { birthday: string | null; homeDate: string | null },
  at = today(),
  limit = 3,
): Anniversary[] {
  const events: Omit<Anniversary, "daysLeft">[] = [];
  const years = Array.from({ length: 30 }, (_, i) => i + 1);
  if (p.birthday) {
    for (let n = 1; n < 12; n++)
      events.push({
        date: addMonths(p.birthday, n),
        title: `满 ${n} 个月`,
        kind: "birthday",
      });
    for (const n of years)
      events.push({
        date: addMonths(p.birthday, n * 12),
        title: `${n} 岁生日`,
        kind: "birthday",
      });
  }
  if (p.homeDate) {
    for (const n of [100, 200, 300, 500, 1000, 1500, 2000, 3000, 5000])
      events.push({
        date: addDays(p.homeDate, n - 1),
        title: `到家第 ${n} 天`,
        kind: "home",
      });
    for (const n of years)
      events.push({
        date: addMonths(p.homeDate, n * 12),
        title: `到家 ${n} 周年`,
        kind: "home",
      });
  }
  return events
    .filter((e) => e.date >= at)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit)
    .map((e) => ({ ...e, daysLeft: daysSince(at, e.date) }));
}
// Chart value ticks from zero to a round top, in 1/2/2.5/5 × 10ⁿ steps.
export function valueTicks(max: number, count = 4) {
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10]
    .map((m) => m * power)
    .find((s) => s >= rough)!;
  const steps = Math.ceil(max / step - 1e-9);
  return Array.from({ length: steps + 1 }, (_, i) => +(i * step).toFixed(6));
}
// First day of each month between two dates, thinned to at most `limit`.
export function monthTicks(first: string, last: string, limit = 6) {
  const ticks: string[] = [];
  const [y, m, d] = first.split("-").map(Number);
  for (let i = d === 1 ? 0 : 1; ; i++) {
    const date = new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 10);
    if (date > last) break;
    ticks.push(date);
  }
  const every = Math.ceil(ticks.length / Math.max(1, limit));
  return ticks.filter((_, i) => i % every === 0);
}
// Stepping a photo up one place at a time is slow once a story has dozens of
// them, so one can be lifted straight to the front, the rest keeping order.
export const moveToFront = <T>(list: T[], index: number) =>
  index <= 0 || index >= list.length
    ? list
    : [list[index], ...list.filter((_, at) => at !== index)];
export const coverOf = (e: Entry) =>
  e.media.find((m) => m.id === e.coverMediaId) || e.media[0];
export const albumCover = (a: Album): Media | undefined =>
  a.items.find((m) => m.id === a.coverMediaId) || a.items[0];
const uploadTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
};
// Some browsers leave File.type empty for .mov files; fall back to the name.
export function uploadType(file: File) {
  const mime =
    file.type || uploadTypes[file.name.split(".").pop()!.toLowerCase()] || "";
  if (!Object.values(uploadTypes).includes(mime))
    throw new Error("只支持 JPG、PNG、WebP、GIF 图片和 MP4、MOV 视频");
  const video = mime.startsWith("video/");
  if (file.size > (video ? 500 : 20) * 1024 * 1024)
    throw new Error(video ? "视频最大 500MB" : "照片最大 20MB");
  return mime;
}
// Long video conversions finish in the background; poll until done.
export async function waitForMedia(id: string) {
  for (let misses = 0; ; ) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      const status = await api<{ state: string; error: string | null }>(
        `/admin/media/${id}/status`,
      );
      misses = 0;
      if (status.state === "ready") return;
      if (status.state === "pending")
        throw new Error(status.error || "视频处理被中断，请重试");
    } catch (e: any) {
      if (e.message.includes("视频") || ++misses >= 5) throw e;
    }
  }
}
export function uploadFile(
  url: string,
  file: File,
  headers: Record<string, string>,
  progress: (n: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    Object.entries(headers).forEach(([k, v]) => x.setRequestHeader(k, v));
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(Math.round((e.loaded / e.total) * 100));
    };
    x.onload = () =>
      x.status >= 200 && x.status < 300
        ? resolve()
        : reject(new Error("上传失败，请重试"));
    x.onerror = () => reject(new Error("连接中断，请重试"));
    x.send(file);
  });
}
