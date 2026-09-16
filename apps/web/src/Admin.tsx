import { useState, useEffect, useRef, createContext, useContext } from "react";
import {
  Alert,
  App as AntApp,
  Button,
  Checkbox,
  ConfigProvider,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Tag,
  type ThemeConfig,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import type { TextAreaRef } from "antd/es/input/TextArea";
import {
  Routes,
  Route,
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import {
  PawPrint,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Camera,
  BookOpen,
  Plus,
  X,
  Lock,
  LogOut,
  Image as ImageIcon,
  Upload,
  Check,
  Trash2,
  ArrowUp,
  ArrowDown,
  Settings,
  Feather,
  Users,
} from "lucide-react";
import {
  api,
  json,
  today,
  coverOf,
  uploadFile,
  type Entry,
  type Profile,
  type Media,
  type Listing,
  type Album,
  type AuthUser,
  type Account,
} from "./lib";
import s from "./App.module.css";
import {
  ProfileContext,
  useData,
  Status,
  Empty,
  StoryView,
  AdminHeading,
  MediaImage,
  BoboIllustration,
  useUnsaved,
} from "./shared";

const UserContext = createContext<AuthUser | null>(null);
const canEdit = (user: AuthUser | null, entry: Entry) =>
  user?.role === "owner" || (!!user && entry.authorId === user.id);

const adminTheme: ThemeConfig = {
  token: {
    colorPrimary: "#6f835f",
    colorInfo: "#6f835f",
    colorSuccess: "#6f835f",
    colorWarning: "#b4875f",
    colorError: "#b45844",
    colorText: "#344137",
    colorTextSecondary: "#7e8974",
    colorBorder: "#dcded0",
    colorBgContainer: "#fffdf7",
    colorBgElevated: "#fffdf7",
    borderRadius: 6,
    controlHeight: 40,
    fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
  },
  components: {
    Button: { primaryShadow: "none" },
    Input: { activeShadow: "0 0 0 3px rgba(111, 131, 95, 0.12)" },
    Select: {
      activeOutlineColor: "rgba(111, 131, 95, 0.12)",
      optionSelectedBg: "#eaf0df",
    },
  },
};

function Login({ onLogin }: { onLogin: () => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className={s.login}>
      <Link to="/" className={s.textLink}>
        <ArrowLeft size={16} /> 回到小日子
      </Link>
      <div className={s.loginCard}>
        <PawPrint className={s.loginPaw} size={36} />
        <span className={s.eyebrow}>THE KEEPER OF LITTLE DAYS</span>
        <h1>欢迎回到啵啵的手账</h1>
        <p>今天，又有什么值得记下的小事？</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              await api("/auth/login", json("POST", Object.fromEntries(f)));
              onLogin();
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            用户名
            <Input required name="username" autoComplete="username" />
          </label>
          <label>
            密码
            <Input.Password
              required
              name="password"
              autoComplete="current-password"
            />
          </label>
          {error ? <Alert type="error" showIcon message={error} /> : null}
          <Button
            type="primary"
            htmlType="submit"
            loading={busy}
            block
            iconPosition="end"
            icon={<ArrowRight size={17} />}
          >
            打开我的手账
          </Button>
        </form>
        <small>
          <Lock size={13} /> 只有受邀的家人可以编辑
        </small>
      </div>
    </div>
  );
}

function AdminContent() {
  const [user, setUser] = useState<AuthUser | null | undefined>();
  const p = useData<Profile>("/profile");
  const check = () =>
    api<AuthUser>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null));
  useEffect(() => {
    check();
  }, []);
  if (user === undefined) return <Status loading />;
  if (!user) return <Login onLogin={check} />;
  return (
    <UserContext.Provider value={user}>
      <ProfileContext.Provider value={p.data}>
        <div className={s.adminLayout}>
          <aside className={s.sidebar}>
            <Link to="/" className={s.brand}>
              <PawPrint />
              <span>
                啵啵的小日子<small>手账工作室</small>
              </span>
            </Link>
            <nav>
              <NavLink to="/admin" end>
                <BookOpen size={18} /> 成长记录
              </NavLink>
              {user.role === "owner" ? (
                <>
                  <NavLink to="/admin/albums">
                    <ImageIcon size={18} /> 记忆相册
                  </NavLink>
                  <NavLink to="/admin/settings">
                    <Settings size={18} /> 啵啵与网站
                  </NavLink>
                  <NavLink to="/admin/accounts">
                    <Users size={18} /> 家庭账号
                  </NavLink>
                </>
              ) : null}
            </nav>
            <div className={s.sidebarBottom}>
              <Link to="/" className={s.textLink}>
                看看我的小站 <ArrowUpRight size={15} />
              </Link>
              <Button
                type="text"
                icon={<LogOut size={16} />}
                onClick={async () => {
                  await api("/auth/logout", json("POST"));
                  setUser(null);
                }}
              >
                退出登录
              </Button>
            </div>
          </aside>
          <main className={s.adminMain}>
            <div className={s.adminTop}>
              每一次记录，都是一份爱的存档。
              <span>
                <span className={s.onlineDot} /> {user.displayName}
              </span>
            </div>
            <Routes>
              <Route index element={<AdminEntries />} />
              <Route path="entries/:id" element={<EntryEditor />} />
              {user.role === "owner" ? (
                <>
                  <Route path="albums" element={<AdminAlbums />} />
                  <Route path="albums/:id" element={<AlbumEditor />} />
                  <Route
                    path="settings"
                    element={<ProfileEditor refresh={p.reload} />}
                  />
                  <Route
                    path="accounts"
                    element={<AccountManager onChanged={check} />}
                  />
                </>
              ) : null}
              <Route path="*" element={<Empty title="没有这一页" />} />
            </Routes>
          </main>
        </div>
      </ProfileContext.Provider>
    </UserContext.Provider>
  );
}

function Admin() {
  return (
    <ConfigProvider locale={zhCN} theme={adminTheme} variant="outlined">
      <AntApp>
        <AdminContent />
      </AntApp>
    </ConfigProvider>
  );
}

function AdminEntries() {
  const nav = useNavigate();
  const user = useContext(UserContext);
  const [q, setQ] = useSearchParams();
  const { data, error, reload } = useData<Listing>(
    `/admin/entries?limit=12&page=${q.get("page") || 1}`,
  );
  const [message, setMessage] = useState("");
  return (
    <>
      <AdminHeading
        title="成长记录"
        text="不必等到特别的日子，今天就值得记下来。"
      >
        <Button
          type="primary"
          icon={<Plus size={17} />}
          onClick={async () => {
            try {
              const e = await api(
                "/admin/entries",
                json("POST", { occurredOn: today() }),
              );
              nav(`/admin/entries/${e.id}`, {
                state: { usePublishDefaults: true },
              });
            } catch (e: any) {
              setMessage(e.message);
            }
          }}
        >
          写下新的一天
        </Button>
      </AdminHeading>
      {message ? <Alert type="error" showIcon message={message} /> : null}
      {error ? (
        <Status error={error} />
      ) : !data ? (
        <Status loading />
      ) : !data.items.length ? (
        <Empty
          title="啵啵的故事，等你开始"
          text="点击「写下新的一天」，记录第一个小瞬间。"
        />
      ) : (
        <>
          <div className={s.adminList}>
            {data.items.map((e) => (
              <div key={e.id} className={s.adminRow}>
                <div className={s.adminThumb}>
                  {coverOf(e) ? (
                    <MediaImage media={coverOf(e)} alt="" />
                  ) : (
                    <Feather size={24} />
                  )}
                </div>
                <Link to={`/admin/entries/${e.id}`}>
                  <h3>{e.title}</h3>
                  <small>
                    {e.occurredOn} · {e.media.length} 个媒体{" "}
                    {e.milestone ? "· 里程碑" : ""}
                    {e.author ? ` · ${e.author.displayName} 记录` : ""}
                  </small>
                </Link>
                <Tag
                  color={
                    e.status === "draft"
                      ? "default"
                      : e.visibility === "private"
                        ? "orange"
                        : "green"
                  }
                >
                  {e.status === "draft"
                    ? "草稿"
                    : e.visibility === "private"
                      ? "私密"
                      : "已公开"}
                </Tag>
                <Link to={`/admin/entries/${e.id}`} className={s.textLink}>
                  {canEdit(user, e) ? "编辑" : "查看"}{" "}
                  <ArrowUpRight size={15} />
                </Link>
                {canEdit(user, e) ? (
                  <Popconfirm
                    title="删除这篇记录？"
                    description="记录及其媒体都会删除，此操作不可撤销。"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={async () => {
                      try {
                        await api(`/admin/entries/${e.id}`, json("DELETE"));
                        reload();
                      } catch (e: any) {
                        setMessage(e.message);
                      }
                    }}
                  >
                    <Button
                      type="text"
                      danger
                      aria-label={`删除 ${e.title}`}
                      icon={<Trash2 size={16} />}
                    />
                  </Popconfirm>
                ) : null}
              </div>
            ))}
          </div>
          <div className={s.pagination}>
            <Button
              disabled={data.page <= 1}
              onClick={() => setQ({ page: String(data.page - 1) })}
            >
              上一页
            </Button>
            <span>
              共 {data.total} 篇 · 第 {data.page} 页
            </span>
            <Button
              disabled={data.page * 12 >= data.total}
              onClick={() => setQ({ page: String(data.page + 1) })}
            >
              下一页
            </Button>
          </div>
        </>
      )}
    </>
  );
}

type UploadTask = {
  file: File;
  progress: number;
  error?: string;
  id?: string;
  done?: boolean;
};

function EntryEditor() {
  const { id } = useParams();
  const location = useLocation();
  const user = useContext(UserContext);
  const usePublishDefaults = location.state?.usePublishDefaults === true;
  const remote = useData<Entry>(`/admin/entries/${id}`);
  const [form, setForm] = useState<Entry | null>(null),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false),
    [tasks, setTasks] = useState<UploadTask[]>([]);
  const text = useRef<TextAreaRef>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (remote.data)
      setForm(
        usePublishDefaults
          ? { ...remote.data, status: "published", visibility: "public" }
          : remote.data,
      );
  }, [remote.data, usePublishDefaults]);
  useUnsaved(dirty || tasks.some((t) => !t.done && !t.error));
  const change = (v: Partial<Entry>) => {
    setForm((f) => (f ? { ...f, ...v } : f));
    setDirty(true);
    setMessage("");
  };
  const refreshMedia = async () => {
    setDirty(true);
    const latest = await api<Entry>(`/admin/entries/${id}`);
    setForm((f) =>
      f
        ? {
            ...f,
            media: [
              ...f.media.filter((m) => latest.media.some((x) => x.id === m.id)),
              ...latest.media.filter(
                (m) => !f.media.some((x) => x.id === m.id),
              ),
            ],
            uploads: latest.uploads,
          }
        : f,
    );
  };
  async function save() {
    if (!form) return;
    setBusy(true);
    setMessage("");
    try {
      const saved = await api<Entry>(
        `/admin/entries/${id}`,
        json("PUT", {
          ...form,
          tags: form.tags.filter(Boolean),
          media: form.media.map((m) => ({ id: m.id, caption: m.caption })),
        }),
      );
      setForm(saved);
      setDirty(false);
      setMessage("已保存这一天。");
    } catch (e: any) {
      setMessage(`保存失败：${e.message}`);
    } finally {
      setBusy(false);
    }
  }
  async function run(task: UploadTask) {
    const patch = (v: Partial<UploadTask>) =>
      setTasks((t) =>
        t.map((x) => (x === task || x.file === task.file ? { ...x, ...v } : x)),
      );
    try {
      patch({ error: undefined, progress: 0, done: false });
      if (task.id) await api(`/admin/media/${task.id}`, json("DELETE"));
      const permit = await api(
        "/admin/media/authorize",
        json("POST", {
          entryId: id,
          name: task.file.name,
          mime: task.file.type,
          size: task.file.size,
        }),
      );
      task.id = permit.id;
      patch({ id: permit.id });
      await uploadFile(permit.url, task.file, permit.headers, (n) =>
        patch({ progress: n }),
      );
      await api(`/admin/media/${permit.id}/complete`, json("POST"));
      patch({ done: true });
      await refreshMedia();
    } catch (e: any) {
      patch({ error: e.message });
    }
  }
  if (remote.error) return <Status error={remote.error} />;
  if (!form) return <Status loading />;
  if (!canEdit(user, form))
    return (
      <>
        <Link to="/admin" className={s.textLink}>
          <ArrowLeft size={16} /> 全部记录
        </Link>
        <Alert
          type="info"
          showIcon
          message={`这是${form.author?.displayName || "其他家人"}记录的故事，只有记录人和家庭管理员可以修改。`}
        />
        <StoryView entry={form} preview />
      </>
    );
  const uploading = tasks.some((t) => !t.done && !t.error);
  function insert(mark: string) {
    const el = text.current?.resizableTextArea?.textArea;
    if (!el) return;
    const pos = el.selectionStart;
    change({ body: form!.body.slice(0, pos) + mark + form!.body.slice(pos) });
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(pos + mark.length, pos + mark.length);
    }, 0);
  }
  return (
    <>
      <Link to="/admin" className={s.textLink}>
        <ArrowLeft size={16} /> 全部记录
      </Link>
      <AdminHeading title="写下这一天" text="照片留住样子，文字留住心情。">
        <Button onClick={() => setPreview(true)}>预览</Button>
        <Button
          type="primary"
          disabled={busy || uploading}
          loading={busy}
          icon={<Check size={17} />}
          onClick={save}
        >
          保存记录
        </Button>
      </AdminHeading>
      {message ? (
        <Alert
          type={message.includes("失败") ? "error" : "success"}
          showIcon
          message={message}
        />
      ) : null}
      <div className={s.editorLayout}>
        <div className={s.editorMain}>
          <label>
            给这一天起个名字
            <Input
              className={s.titleInput}
              value={form.title}
              maxLength={150}
              onChange={(e) => change({ title: e.target.value })}
            />
          </label>
          <div className={s.toolbar}>
            <Button type="text" size="small" onClick={() => insert("## ")}>
              小标题
            </Button>
            <Button type="text" size="small" onClick={() => insert("- ")}>
              列表
            </Button>
            <Button type="text" size="small" onClick={() => insert("> ")}>
              引用
            </Button>
            <span>支持简单文字排版</span>
          </div>
          <Input.TextArea
            ref={text}
            className={s.bodyEditor}
            value={form.body}
            onChange={(e) => change({ body: e.target.value })}
            placeholder="今天的啵啵，发生了什么有趣的小事？"
          />
          <div className={s.uploadTitle}>
            <h3>照片与短视频</h3>
            <div className={s.uploadButton}>
              <Button
                icon={<Upload size={16} />}
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                添加媒体
              </Button>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4"
                disabled={uploading}
                onChange={async (e) => {
                  const selected = Array.from(e.target.files || []).map(
                    (file) => ({ file, progress: 0 }),
                  );
                  setTasks((t) => [...t, ...selected]);
                  e.target.value = "";
                  for (const task of selected) await run(task);
                }}
              />
            </div>
          </div>
          <p className={s.hint}>
            照片 ≤20MB；MP4 / H.264 视频 ≤200MB、3 分钟。上传完成后再保存发布。
          </p>
          {tasks.map((t, i) => (
            <div className={s.uploadTask} key={i}>
              <div>
                <span>{t.file.name}</span>
                {!t.done && !t.error ? (
                  <Progress
                    percent={t.progress}
                    size="small"
                    status={t.progress === 100 ? "active" : "normal"}
                  />
                ) : null}
              </div>
              {t.done ? (
                <Tag color="green">已上传</Tag>
              ) : t.error ? (
                <Tag color="red">{t.error}</Tag>
              ) : (
                <span>{t.progress === 100 ? "正在校验和处理…" : null}</span>
              )}
              {t.error ? (
                <Button type="link" size="small" onClick={() => run(t)}>
                  重试
                </Button>
              ) : null}
            </div>
          ))}
          {form.uploads?.map((m) => (
            <div key={m.id} className={s.uploadTask}>
              <span>{m.name} · 未完成上传</span>
              <Button
                type="link"
                size="small"
                danger
                onClick={async () => {
                  try {
                    await api(`/admin/media/${m.id}`, json("DELETE"));
                    await refreshMedia();
                  } catch (e: any) {
                    setMessage(e.message);
                  }
                }}
              >
                移除
              </Button>
            </div>
          ))}
          <div className={s.editorMedia}>
            {form.media.map((m, i) => (
              <div key={m.id}>
                <MediaImage media={m} alt={m.name} />
                {m.kind === "video" && <span className={s.badge}>视频</span>}
                <Input
                  size="small"
                  aria-label={`${m.name}的说明`}
                  value={m.caption}
                  placeholder="给这个瞬间写句话"
                  onChange={(e) =>
                    change({
                      media: form.media.map((x) =>
                        x.id === m.id ? { ...x, caption: e.target.value } : x,
                      ),
                    })
                  }
                />
                <div className={s.mediaActions}>
                  <Button
                    type="text"
                    size="small"
                    disabled={!i}
                    aria-label="向前移动"
                    icon={<ArrowUp size={15} />}
                    onClick={() => {
                      const a = [...form.media];
                      [a[i - 1], a[i]] = [a[i], a[i - 1]];
                      change({ media: a });
                    }}
                  />
                  <Button
                    type="text"
                    size="small"
                    disabled={i === form.media.length - 1}
                    aria-label="向后移动"
                    icon={<ArrowDown size={15} />}
                    onClick={() => {
                      const a = [...form.media];
                      [a[i + 1], a[i]] = [a[i], a[i + 1]];
                      change({ media: a });
                    }}
                  />
                  {m.kind === "image" && (
                    <Button
                      type="text"
                      size="small"
                      onClick={() => change({ coverMediaId: m.id })}
                    >
                      {form.coverMediaId === m.id ? "✓ 封面" : "设为封面"}
                    </Button>
                  )}
                  <Popconfirm
                    title="删除这个媒体？"
                    description="相册中的引用也会一并移除。"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={async () => {
                      try {
                        await api(`/admin/media/${m.id}`, json("DELETE"));
                        change({
                          media: form.media.filter((x) => x.id !== m.id),
                          coverMediaId:
                            form.coverMediaId === m.id
                              ? null
                              : form.coverMediaId,
                        });
                      } catch (e: any) {
                        setMessage(e.message);
                      }
                    }}
                  >
                    <Button
                      type="text"
                      size="small"
                      danger
                      aria-label="删除媒体"
                      icon={<Trash2 size={15} />}
                    />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        </div>
        <aside className={s.editorSettings}>
          <h3>这一天的标签</h3>
          <label>
            发生日期
            <Input
              type="date"
              required
              value={form.occurredOn}
              onChange={(e) => change({ occurredOn: e.target.value })}
            />
          </label>
          <label>
            记录类型
            <Select
              value={form.kind}
              onChange={(kind: Entry["kind"]) => change({ kind })}
              options={[
                { value: "daily", label: "日常碎片" },
                { value: "event", label: "特别事件" },
              ]}
            />
          </label>
          <label>
            标签，用逗号分隔
            <Input
              value={form.tags.join(",")}
              onChange={(e) =>
                change({
                  tags: e.target.value.split(/[,，]/).map((x) => x.trim()),
                })
              }
              placeholder="散步，美食，旅行"
            />
          </label>
          <Checkbox
            className={s.checkLine}
            checked={form.milestone}
            onChange={(e) => change({ milestone: e.target.checked })}
          >
            成长里程碑
          </Checkbox>
          <Checkbox
            className={s.checkLine}
            checked={form.featured}
            onChange={(e) => change({ featured: e.target.checked })}
          >
            首页精选
          </Checkbox>
          <hr />
          <h3>发布设置</h3>
          <label>
            状态
            <Select
              value={form.status}
              onChange={(status: Entry["status"]) => change({ status })}
              options={[
                { value: "draft", label: "草稿" },
                { value: "published", label: "已发布" },
              ]}
            />
          </label>
          <label>
            谁可以看
            <Select
              value={form.visibility}
              onChange={(visibility: Entry["visibility"]) =>
                change({ visibility })
              }
              options={[
                { value: "private", label: "只有自己" },
                { value: "public", label: "所有访客" },
              ]}
            />
          </label>
          <p className={s.hint}>
            <Lock size={14} /> 草稿始终仅自己可见，修改后点击保存生效。
          </p>
        </aside>
      </div>
      {preview && (
        <div
          className={s.previewOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="故事预览"
        >
          <div className={s.previewTop}>
            预览 · 尚未保存的内容
            <Button
              type="text"
              icon={<X size={20} />}
              onClick={() => setPreview(false)}
            >
              关闭预览
            </Button>
          </div>
          <StoryView entry={form} preview />
        </div>
      )}
    </>
  );
}

function AdminAlbums() {
  const nav = useNavigate();
  const { data, error, reload } = useData<Album[]>("/admin/albums");
  const [msg, setMsg] = useState("");
  return (
    <>
      <AdminHeading title="记忆相册" text="给同一份喜欢，找一个共同的家。">
        <Button
          type="primary"
          icon={<Plus size={17} />}
          onClick={async () => {
            try {
              const a = await api("/admin/albums", json("POST"));
              nav(`/admin/albums/${a.id}`);
            } catch (e: any) {
              setMsg(e.message);
            }
          }}
        >
          新建相册
        </Button>
      </AdminHeading>
      {msg ? <Alert type="error" showIcon message={msg} /> : null}
      {error ? (
        <Status error={error} />
      ) : !data ? (
        <Status loading />
      ) : !data.length ? (
        <Empty
          title="为回忆装订一本相册"
          text="从已经上传的照片和视频中挑选，不需要重复上传。"
        />
      ) : (
        <div className={s.adminList}>
          {data.map((a) => (
            <div className={s.adminRow} key={a.id}>
              <Camera size={28} />
              <Link to={`/admin/albums/${a.id}`}>
                <h3>{a.title}</h3>
                <small>
                  {a.items.length} 个瞬间 ·{" "}
                  {a.visibility === "public" ? "公开" : "私密"}
                </small>
              </Link>
              <Link to={`/admin/albums/${a.id}`} className={s.textLink}>
                整理相册 <ArrowUpRight size={15} />
              </Link>
              <Popconfirm
                title="删除这本相册？"
                description="原始照片与故事会保留。"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={async () => {
                  try {
                    await api(`/admin/albums/${a.id}`, json("DELETE"));
                    reload();
                  } catch (e: any) {
                    setMsg(e.message);
                  }
                }}
              >
                <Button
                  type="text"
                  danger
                  aria-label={`删除 ${a.title}`}
                  icon={<Trash2 size={16} />}
                />
              </Popconfirm>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function AlbumEditor() {
  const { id } = useParams();
  const remote = useData<Album>(`/admin/albums/${id}`),
    library = useData<Media[]>("/admin/media");
  const [form, setForm] = useState<Album | null>(null),
    [msg, setMsg] = useState(""),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (remote.data) setForm(remote.data);
  }, [remote.data]);
  useUnsaved(dirty);
  const update = (v: Partial<Album>) => {
    setForm((f) => (f ? { ...f, ...v } : f));
    setDirty(true);
  };
  if (remote.error) return <Status error={remote.error} />;
  if (!form) return <Status loading />;
  return (
    <>
      <Link className={s.textLink} to="/admin/albums">
        <ArrowLeft size={16} /> 全部相册
      </Link>
      <AdminHeading
        title="整理这本相册"
        text="选择、排序，把回忆放在喜欢的位置。"
      >
        <Button
          type="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const v = await api<Album>(
                `/admin/albums/${id}`,
                json("PUT", { ...form, mediaIds: form.items.map((m) => m.id) }),
              );
              setForm(v);
              setDirty(false);
              setMsg("相册已保存。");
            } catch (e: any) {
              setMsg(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          保存相册
        </Button>
      </AdminHeading>
      {msg ? (
        <Alert
          type={msg.includes("已保存") ? "success" : "error"}
          showIcon
          message={msg}
        />
      ) : null}
      <div className={s.panel}>
        <div className={s.formRow}>
          <label>
            相册名称
            <Input
              value={form.title}
              onChange={(e) => update({ title: e.target.value })}
            />
          </label>
          <label>
            可见性
            <Select
              value={form.visibility}
              onChange={(visibility: Album["visibility"]) =>
                update({ visibility })
              }
              options={[
                { value: "private", label: "只有自己" },
                { value: "public", label: "公开" },
              ]}
            />
          </label>
        </div>
        <label>
          相册介绍
          <Input.TextArea
            value={form.description}
            onChange={(e) => update({ description: e.target.value })}
          />
        </label>
        <p className={s.hint}>公开相册会自动隐藏私密或草稿故事中的媒体。</p>
        <h3>已选择 · {form.items.length}</h3>
        <div className={s.editorMedia}>
          {form.items.map((m, i) => (
            <div key={m.id}>
              <MediaImage media={m} alt={m.name} />
              <div className={s.mediaActions}>
                <Button
                  type="text"
                  size="small"
                  aria-label="向前移动"
                  disabled={!i}
                  icon={<ArrowUp size={15} />}
                  onClick={() => {
                    const items = [...form.items];
                    [items[i - 1], items[i]] = [items[i], items[i - 1]];
                    update({ items });
                  }}
                />
                <Button
                  type="text"
                  size="small"
                  aria-label="向后移动"
                  disabled={i === form.items.length - 1}
                  icon={<ArrowDown size={15} />}
                  onClick={() => {
                    const items = [...form.items];
                    [items[i + 1], items[i]] = [items[i], items[i + 1]];
                    update({ items });
                  }}
                />
                <Button
                  type="text"
                  size="small"
                  onClick={() => update({ coverMediaId: m.id })}
                >
                  {form.coverMediaId === m.id ? "✓ 封面" : "封面"}
                </Button>
                <Button
                  type="text"
                  size="small"
                  aria-label="从相册移除"
                  icon={<X size={15} />}
                  onClick={() =>
                    update({
                      items: form.items.filter((x) => x.id !== m.id),
                      coverMediaId:
                        form.coverMediaId === m.id ? null : form.coverMediaId,
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>
        <h3>从媒体库添加</h3>
        {library.error ? (
          <Status error={library.error} />
        ) : (
          <div className={s.library}>
            {library.data
              ?.filter((m) => !form.items.some((x) => x.id === m.id))
              .map((m) => (
                <Button
                  key={m.id}
                  onClick={() => update({ items: [...form.items, m] })}
                  title={`添加 ${m.name}`}
                >
                  <MediaImage media={m} alt={m.name} />
                  <Plus size={18} />
                </Button>
              ))}
          </div>
        )}
      </div>
    </>
  );
}

function AccountManager({
  onChanged,
}: {
  onChanged: () => void | Promise<void>;
}) {
  const { data, error, reload } = useData<Account[]>("/admin/accounts");
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  return (
    <>
      <AdminHeading
        title="家庭账号"
        text="邀请家人一起记录，每篇故事都会留下记录人的名字。"
      />
      {notice ? (
        <Alert type={notice.type} showIcon message={notice.text} />
      ) : null}
      <div className={s.accountLayout}>
        <form
          className={`${s.panel} ${s.accountForm}`}
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setNotice(null);
            const form = event.currentTarget;
            const value = Object.fromEntries(new FormData(form));
            try {
              await api("/admin/accounts", json("POST", value));
              form.reset();
              reload();
              setNotice({ type: "success", text: "家庭成员账号已创建。" });
            } catch (e: any) {
              setNotice({ type: "error", text: e.message });
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>添加家庭成员</h3>
          <p className={s.hint}>
            用户名用于登录，显示名字会出现在对外公开的故事中。
          </p>
          <label>
            显示名字
            <Input
              required
              name="displayName"
              maxLength={30}
              placeholder="例如：妈妈"
              autoComplete="off"
            />
          </label>
          <label>
            登录用户名
            <Input
              required
              name="username"
              minLength={2}
              maxLength={50}
              placeholder="例如：mama"
              autoComplete="off"
            />
          </label>
          <label>
            初始密码
            <Input.Password
              required
              name="password"
              minLength={12}
              maxLength={200}
              placeholder="至少 12 位"
              autoComplete="new-password"
            />
          </label>
          <Button type="primary" htmlType="submit" loading={busy} block>
            创建账号
          </Button>
        </form>
        <section className={`${s.panel} ${s.accountList}`}>
          <h3>家庭成员</h3>
          {error ? (
            <Status error={error} />
          ) : !data ? (
            <Status loading />
          ) : (
            data.map((account) => (
              <div className={s.accountRow} key={account.id}>
                <Users size={20} />
                <div className={s.accountIdentity}>
                  <strong>{account.displayName}</strong>
                  <small>
                    @{account.username} · {account.entryCount} 篇记录
                  </small>
                </div>
                <div className={s.accountTags}>
                  {account.role === "owner" ? (
                    <Tag color="gold">家庭管理员</Tag>
                  ) : (
                    <Tag>家庭成员</Tag>
                  )}
                  <Tag color={account.active ? "green" : "default"}>
                    {account.active ? "可登录" : "已停用"}
                  </Tag>
                </div>
                <div className={s.accountActions}>
                  <Button
                    size="small"
                    onClick={() => {
                      setEditing(account);
                      setEditingName(account.displayName);
                    }}
                  >
                    修改名字
                  </Button>
                  {account.role !== "owner" ? (
                    <>
                      <Popconfirm
                        title={
                          account.active ? "停用这个账号？" : "启用这个账号？"
                        }
                        description={
                          account.active
                            ? "停用后会立即退出登录，已有故事署名仍会保留。"
                            : "启用后，家庭成员可以再次登录。"
                        }
                        okText={account.active ? "停用" : "启用"}
                        cancelText="取消"
                        onConfirm={async () => {
                          try {
                            await api(
                              `/admin/accounts/${account.id}/status`,
                              json("PUT", { active: !account.active }),
                            );
                            reload();
                            setNotice({
                              type: "success",
                              text: account.active
                                ? `${account.displayName}的账号已停用。`
                                : `${account.displayName}的账号已启用。`,
                            });
                          } catch (e: any) {
                            setNotice({ type: "error", text: e.message });
                          }
                        }}
                      >
                        <Button size="small">
                          {account.active ? "停用" : "启用"}
                        </Button>
                      </Popconfirm>
                      {account.entryCount === 0 ? (
                        <Popconfirm
                          title="删除这个账号？"
                          description="没有发布记录的成员账号可以直接删除。"
                          okText="删除"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                          onConfirm={async () => {
                            try {
                              await api(
                                `/admin/accounts/${account.id}`,
                                json("DELETE"),
                              );
                              reload();
                              setNotice({
                                type: "success",
                                text: "成员账号已删除。",
                              });
                            } catch (e: any) {
                              setNotice({ type: "error", text: e.message });
                            }
                          }}
                        >
                          <Button size="small" danger>
                            删除
                          </Button>
                        </Popconfirm>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </section>
      </div>
      <Modal
        title={`修改${editing ? `「${editing.displayName}」` : ""}的显示名字`}
        open={editing !== null}
        okText="保存"
        cancelText="取消"
        confirmLoading={editBusy}
        onCancel={() => setEditing(null)}
        onOk={async () => {
          if (!editing) return;
          setEditBusy(true);
          try {
            await api(
              `/admin/accounts/${editing.id}/name`,
              json("PUT", { displayName: editingName }),
            );
            reload();
            await onChanged();
            setNotice({ type: "success", text: "显示名字已更新。" });
            setEditing(null);
          } catch (e: any) {
            setNotice({ type: "error", text: e.message });
          } finally {
            setEditBusy(false);
          }
        }}
      >
        <label className={s.modalField}>
          对外显示名字
          <Input
            value={editingName}
            maxLength={30}
            autoFocus
            onChange={(event) => setEditingName(event.target.value)}
          />
        </label>
      </Modal>
    </>
  );
}

const coverTypes = ["image/jpeg", "image/png", "image/webp"];

function CoverPicker({
  title,
  hint,
  value,
  current,
  uploaded,
  stories,
  onChange,
  onUpload,
  onRemove,
}: {
  title: string;
  hint: string;
  value: string | null;
  current: Media | null;
  uploaded: Media[];
  stories: Media[];
  onChange: (id: string | null) => void;
  onUpload: (file: File, progress: (n: number) => void) => Promise<string>;
  onRemove: (m: Media) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState("");
  const tile = (m: Media) => (
    <Button
      key={m.id}
      className={value === m.id ? s.chosen : ""}
      title={m.name}
      onClick={() => onChange(m.id)}
    >
      <MediaImage media={m} alt={m.name} />
      {value === m.id && <Check size={20} />}
    </Button>
  );
  return (
    <section className={s.coverPicker}>
      <div className={s.coverCurrent}>
        <div className={s.coverPreview}>
          {current ? (
            <MediaImage media={current} variant="url" alt={`${title}预览`} />
          ) : (
            <BoboIllustration />
          )}
        </div>
        <div>
          <h3>{title}</h3>
          <p className={s.hint}>{hint}</p>
          <div className={s.coverActions}>
            <Button
              icon={<Upload size={16} />}
              loading={progress !== null}
              onClick={() => input.current?.click()}
            >
              {progress === null
                ? "上传图片"
                : progress < 100
                  ? `上传中 ${progress}%`
                  : "正在处理…"}
            </Button>
            <Button disabled={!value} onClick={() => onChange(null)}>
              使用默认插画
            </Button>
            <input
              ref={input}
              type="file"
              hidden
              accept={coverTypes.join(",")}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setError("");
                setProgress(0);
                try {
                  onChange(await onUpload(file, setProgress));
                } catch (err: any) {
                  setError(err.message);
                } finally {
                  setProgress(null);
                }
              }}
            />
          </div>
          {error ? <Alert type="error" showIcon message={error} /> : null}
        </div>
      </div>
      {uploaded.length ? (
        <>
          <h4>上传的图片</h4>
          <div className={s.library}>
            {uploaded.map((m) => (
              <div className={s.libraryTile} key={m.id}>
                {tile(m)}
                <Popconfirm
                  title="删除这张上传的图片？"
                  description="使用它的封面会恢复为默认插画。"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() =>
                    onRemove(m).catch((err) => setError(err.message))
                  }
                >
                  <Button
                    className={s.tileDelete}
                    size="small"
                    type="text"
                    danger
                    aria-label={`删除 ${m.name}`}
                    icon={<Trash2 size={14} />}
                  />
                </Popconfirm>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <h4>公开故事中的照片</h4>
      {stories.length ? (
        <div className={s.library}>{stories.map(tile)}</div>
      ) : (
        <p className={s.hint}>还没有公开故事中的照片。</p>
      )}
    </section>
  );
}

function ProfileEditor({ refresh }: { refresh: () => void }) {
  const remote = useData<Profile>("/admin/profile"),
    media = useData<Media[]>("/admin/media?publicOnly=true"),
    siteMedia = useData<Media[]>("/admin/site-media");
  const [form, setForm] = useState<Profile | null>(null),
    [uploaded, setUploaded] = useState<Media[]>([]),
    [msg, setMsg] = useState(""),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (remote.data) setForm(remote.data);
  }, [remote.data]);
  useEffect(() => {
    if (siteMedia.data) setUploaded(siteMedia.data);
  }, [siteMedia.data]);
  useUnsaved(dirty);
  if (remote.error) return <Status error={remote.error} />;
  if (!form) return <Status loading />;
  const update = (v: Partial<Profile>) => {
    setForm((f) => (f ? { ...f, ...v } : f));
    setDirty(true);
  };
  const stories = media.data?.filter((m) => m.kind === "image") || [];
  const find = (id: string | null) =>
    (id &&
      [...uploaded, ...stories, form.cover, form.aboutCover].find(
        (m) => m?.id === id,
      )) ||
    null;
  async function upload(file: File, progress: (n: number) => void) {
    if (!coverTypes.includes(file.type))
      throw new Error("封面只支持 JPG、PNG、WebP 图片");
    const permit = await api(
      "/admin/media/authorize",
      json("POST", {
        entryId: null,
        name: file.name,
        mime: file.type,
        size: file.size,
      }),
    );
    try {
      await uploadFile(permit.url, file, permit.headers, progress);
      await api(`/admin/media/${permit.id}/complete`, json("POST"));
    } catch (e) {
      await api(`/admin/media/${permit.id}`, json("DELETE")).catch(() => {});
      throw e;
    }
    const m = await api<Media>(`/media/${permit.id}/access`);
    setUploaded((list) => [m, ...list]);
    return m.id;
  }
  async function remove(m: Media) {
    await api(`/admin/media/${m.id}`, json("DELETE"));
    setUploaded((list) => list.filter((x) => x.id !== m.id));
    if (form?.coverMediaId === m.id) update({ coverMediaId: null });
    if (form?.aboutCoverMediaId === m.id) update({ aboutCoverMediaId: null });
  }
  return (
    <>
      <AdminHeading
        title="啵啵与这个小站"
        text="让每一页，都有啵啵自己的样子。"
      >
        <Button
          type="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/admin/profile", json("PUT", form));
              setDirty(false);
              setMsg("资料已保存。");
              refresh();
            } catch (e: any) {
              setMsg(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          保存资料
        </Button>
      </AdminHeading>
      {msg ? (
        <Alert
          type={msg.includes("已保存") ? "success" : "error"}
          showIcon
          message={msg}
        />
      ) : null}
      <div className={s.panel}>
        <div className={s.formRow}>
          <label>
            网站名称
            <Input
              value={form.siteName}
              onChange={(e) => update({ siteName: e.target.value })}
            />
          </label>
          <label>
            宠物名字
            <Input
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </label>
          <label>
            品种
            <Input
              value={form.breed}
              onChange={(e) => update({ breed: e.target.value })}
            />
          </label>
        </div>
        <div className={s.formRow}>
          <label>
            生日（可留空）
            <Input
              type="date"
              value={form.birthday || ""}
              onChange={(e) => update({ birthday: e.target.value || null })}
            />
          </label>
          <label>
            到家日期（可留空）
            <Input
              type="date"
              value={form.homeDate || ""}
              onChange={(e) => update({ homeDate: e.target.value || null })}
            />
          </label>
        </div>
        <label>
          一句介绍
          <Input.TextArea
            value={form.intro}
            onChange={(e) => update({ intro: e.target.value })}
          />
        </label>
        <div className={s.formRow}>
          <label>
            性格
            <Input
              value={form.personality}
              onChange={(e) => update({ personality: e.target.value })}
            />
          </label>
          <label>
            爱好
            <Input
              value={form.hobbies}
              onChange={(e) => update({ hobbies: e.target.value })}
            />
          </label>
        </div>
        <CoverPicker
          title="首页封面"
          hint="显示在首页的拍立得相框里。可以上传图片，或从公开故事中选择照片；未选择时显示默认插画。"
          value={form.coverMediaId}
          current={find(form.coverMediaId)}
          uploaded={uploaded}
          stories={stories}
          onChange={(coverMediaId) => update({ coverMediaId })}
          onUpload={upload}
          onRemove={remove}
        />
        <CoverPicker
          title="关于页封面"
          hint="显示在「关于啵啵」页面。可以上传图片，或从公开故事中选择照片；未选择时显示默认插画。"
          value={form.aboutCoverMediaId}
          current={find(form.aboutCoverMediaId)}
          uploaded={uploaded}
          stories={stories}
          onChange={(aboutCoverMediaId) => update({ aboutCoverMediaId })}
          onUpload={upload}
          onRemove={remove}
        />
      </div>
    </>
  );
}
export default Admin;
