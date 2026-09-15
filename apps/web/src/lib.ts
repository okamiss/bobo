export type Media = {
  id: string;
  entryId: string;
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
  coverMediaId: string | null;
  media: Media[];
  previous?: { id: string; title: string };
  next?: { id: string; title: string };
  uploads?: { id: string; name: string; state: string }[];
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
};
export type Album = {
  id: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  coverMediaId: string | null;
  items: Media[];
};
export type Listing = {
  items: Entry[];
  total: number;
  page: number;
  years: string[];
  tags: string[];
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
export function daysSince(date: string, at = today()) {
  return Math.floor(
    (Date.parse(`${at}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) /
      86400000,
  );
}
export function age(date: string, at = today()) {
  if (at < date) return "";
  let [y, m, d] = at.split("-").map(Number);
  const [by, bm, bd] = date.split("-").map(Number);
  let months = (y - by) * 12 + m - bm - (d < bd ? 1 : 0);
  if (months < 1) return `${daysSince(date, at)} 天`;
  return `${Math.floor(months / 12) ? `${Math.floor(months / 12)} 岁 ` : ""}${months % 12 ? `${months % 12} 个月` : ""}`.trim();
}
export const coverOf = (e: Entry) =>
  e.media.find((m) => m.id === e.coverMediaId) || e.media[0];
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
