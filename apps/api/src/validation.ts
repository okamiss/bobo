import { z } from "zod";
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, "日期无效");
export const measurementInput = z
  .object({
    measuredOn: date,
    weight: z
      .number()
      .gt(0, "体重需要大于 0")
      .max(100, "体重不能超过 100 kg")
      .nullable(),
    height: z
      .number()
      .gt(0, "肩高需要大于 0")
      .max(150, "肩高不能超过 150 cm")
      .nullable(),
    note: z.string().trim().max(200),
  })
  .refine(
    (v) => v.weight !== null || v.height !== null,
    "体重和肩高至少填写一项",
  );
export const healthRecordInput = z
  .object({
    kind: z.enum(["vaccine", "deworming", "checkup", "grooming"], {
      errorMap: () => ({ message: "请选择疫苗、驱虫、体检或美容" }),
    }),
    occurredOn: date,
    nextDueOn: date.nullable(),
    note: z.string().trim().max(500),
  })
  .refine((v) => !v.nextDueOn || v.nextDueOn >= v.occurredOn, {
    message: "下次时间不能早于本次日期",
    path: ["nextDueOn"],
  });
export const tagName = z
  .string()
  .trim()
  .min(1, "标签不能为空")
  .max(30, "标签最多 30 个字符");
export const tagCreateInput = z.object({ name: tagName });
export const tagRenameInput = z.object({ name: tagName, newName: tagName });
export const entryInput = z.object({
  title: z.string().trim().min(1).max(150),
  occurredOn: date,
  kind: z.enum(["daily", "event"]),
  body: z.string().max(50000),
  tags: z.array(tagName).max(20),
  status: z.enum(["draft", "published"]),
  visibility: z.enum(["public", "private"]),
  milestone: z.boolean(),
  featured: z.boolean(),
  coverMediaId: z.string().uuid().nullable(),
  media: z
    .array(z.object({ id: z.string().uuid(), caption: z.string().max(500) }))
    .max(100)
    .optional(),
});
export const profileInput = z.object({
  siteName: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(50),
  breed: z.string().max(50),
  birthday: date.nullable(),
  homeDate: date.nullable(),
  intro: z.string().max(2000),
  personality: z.string().max(500),
  hobbies: z.string().max(500),
  coverMediaId: z.string().uuid().nullable(),
  aboutCoverMediaId: z.string().uuid().nullable(),
});
export const albumInput = z
  .object({
    title: z.string().trim().min(1).max(100),
    description: z.string().max(2000),
    visibility: z.enum(["public", "private"]),
    coverMediaId: z.string().uuid().nullable(),
    mediaIds: z.array(z.string().uuid()).max(300),
  })
  .refine(
    (v) => new Set(v.mediaIds).size === v.mediaIds.length,
    "相册不能重复添加同一媒体",
  );
export const uploadInput = z
  .object({
    // Null uploads a site image, such as a page cover, outside of any story.
    entryId: z.string().uuid().nullable(),
    name: z.string().min(1).max(250),
    // video/quicktime is the MOV an iPhone records; it is converted to MP4.
    mime: z.enum(
      [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "video/mp4",
        "video/quicktime",
      ],
      {
        errorMap: () => ({
          message: "只支持 JPG、PNG、WebP、GIF 图片和 MP4、MOV 视频",
        }),
      },
    ),
    size: z.number().int().positive(),
  })
  .refine(
    (v) => v.size <= (v.mime.startsWith("video/") ? 500 : 20) * 1024 * 1024,
    "文件太大：照片最大 20MB，视频最大 500MB",
  );
export const visible = { status: "published", visibility: "public" };
// Images that may be chosen as a page cover: site uploads or public story photos.
export const coverChoice = {
  state: "ready",
  kind: "image",
  OR: [{ entryId: null }, { entry: visible, attached: true }],
};

const username = z
  .string()
  .trim()
  .min(2, "用户名至少 2 个字符")
  .max(50)
  .regex(/^[\p{L}\p{N}._-]+$/u, "用户名只能包含文字、数字、点、横线或下划线");

const password = z.string().min(12, "密码至少 12 位").max(200);

export const accountInput = z.object({
  username,
  displayName: z.string().trim().min(1, "显示名字不能为空").max(30),
  password,
});

export const passwordChangeInput = z.object({
  currentPassword: z.string().max(200),
  newPassword: password,
});
export const passwordResetInput = z.object({ password });

export const accountStatusInput = z.object({ active: z.boolean() });
export const accountNameInput = z.object({
  displayName: z.string().trim().min(1, "显示名字不能为空").max(30),
});
