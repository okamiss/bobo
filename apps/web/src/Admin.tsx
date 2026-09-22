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
  Space,
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
  ChevronsUp,
  Settings,
  Feather,
  Users,
  KeyRound,
  ChartLine,
  Sparkles,
  HeartPulse,
  Tags,
} from "lucide-react";
import {
  api,
  json,
  today,
  coverOf,
  uploadFile,
  uploadType,
  waitForMedia,
  type Entry,
  type Profile,
  type Media,
  type Listing,
  type ManagedTag,
  type AiStatus,
  type AiDraft,
  type AiQuotas,
  type Album,
  type AuthUser,
  type Account,
  type Growth,
  type HealthRecord,
  type AuditEntry,
  healthReminder,
  postedTime,
  moveToFront,
  draftOf,
  withDraft,
  mergeMedia,
  afterSave,
  type Draft,
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
  GrowthChart,
  GrowthTable,
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

function PasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { message } = AntApp.useApp();
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [repeat, setRepeat] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="修改密码"
      open={open}
      okText="保存新密码"
      cancelText="取消"
      confirmLoading={busy}
      onCancel={onClose}
      afterClose={() => {
        setCurrent("");
        setNext("");
        setRepeat("");
        setError("");
      }}
      onOk={async () => {
        if (next.length < 12) return setError("新密码至少 12 位");
        if (next !== repeat) return setError("两次输入的新密码不一致");
        setBusy(true);
        setError("");
        try {
          await api(
            "/auth/password",
            json("PUT", { currentPassword: current, newPassword: next }),
          );
          message.success("密码已修改，其他设备上的登录已退出。");
          onClose();
        } catch (e: any) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className={s.modalField}>
        当前密码
        <Input.Password
          value={current}
          autoComplete="current-password"
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <label className={s.modalField}>
        新密码
        <Input.Password
          value={next}
          maxLength={200}
          placeholder="至少 12 位"
          autoComplete="new-password"
          onChange={(e) => setNext(e.target.value)}
        />
      </label>
      <label className={s.modalField}>
        再输入一次新密码
        <Input.Password
          value={repeat}
          maxLength={200}
          autoComplete="new-password"
          onChange={(e) => setRepeat(e.target.value)}
        />
      </label>
      {error ? <Alert type="error" showIcon message={error} /> : null}
    </Modal>
  );
}

function AdminContent() {
  const [user, setUser] = useState<AuthUser | null | undefined>();
  const [passwordOpen, setPasswordOpen] = useState(false);
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
              <NavLink to="/admin/growth">
                <ChartLine size={18} /> 成长曲线
              </NavLink>
              <HealthNavLink />
              <NavLink to="/admin/albums">
                <ImageIcon size={18} /> 记忆相册
              </NavLink>
              <NavLink to="/admin/settings">
                <Settings size={18} /> 啵啵与网站
              </NavLink>
              {user.role === "owner" ? (
                <NavLink to="/admin/tags">
                  <Tags size={18} /> 管理标签
                </NavLink>
              ) : null}
              {user.role === "owner" ? (
                <NavLink to="/admin/accounts">
                  <Users size={18} /> 家庭账号
                </NavLink>
              ) : null}
            </nav>
            <div className={s.sidebarBottom}>
              <Link to="/" className={s.textLink}>
                看看我的小站 <ArrowUpRight size={15} />
              </Link>
              <Button
                type="text"
                icon={<KeyRound size={16} />}
                aria-label="修改密码"
                onClick={() => setPasswordOpen(true)}
              >
                修改密码
              </Button>
              <PasswordModal
                open={passwordOpen}
                onClose={() => setPasswordOpen(false)}
              />
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
              <Route path="growth" element={<GrowthManager />} />
              <Route path="health" element={<HealthManager />} />
              <Route path="albums" element={<AdminAlbums />} />
              <Route path="albums/:id" element={<AlbumEditor />} />
              <Route
                path="settings"
                element={<ProfileEditor refresh={p.reload} />}
              />
              {user.role === "owner" ? (
                <Route
                  path="tags"
                  element={
                    <>
                      <AdminHeading
                        title="管理标签"
                        text="新增固定标签，或重命名、删除已有标签。"
                      />
                      <section className={s.panel}>
                        <TagManager />
                      </section>
                    </>
                  }
                />
              ) : null}
              {user.role === "owner" ? (
                <Route
                  path="accounts"
                  element={<AccountManager onChanged={check} />}
                />
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

type ManagedTagChange =
  | { type: "create"; name: string }
  | { type: "rename"; name: string; newName: string }
  | { type: "delete"; name: string };

const applyManagedTagChange = (tags: string[], change: ManagedTagChange) => {
  if (change.type === "create") return tags;
  return [
    ...new Set(
      tags.flatMap((tag) => {
        if (tag !== change.name) return [tag];
        return change.type === "rename" ? [change.newName] : [];
      }),
    ),
  ];
};

function TagManager({
  onChanged,
}: {
  onChanged?: (change: ManagedTagChange) => void;
}) {
  const { data, error, reload } = useData<ManagedTag[]>("/admin/tags");
  const [search, setSearch] = useState("");
  const [newTag, setNewTag] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ManagedTag | null>(null);
  const [renamedTag, setRenamedTag] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const createTag = async () => {
    const name = newTag.trim();
    if (!name || creating) return;
    setCreating(true);
    setNotice(null);
    try {
      const created = await api<ManagedTag>(
        "/admin/tags",
        json("POST", { name }),
      );
      setNewTag("");
      setNotice({
        type: "success",
        text: `已新增标签「${created.name}」。`,
      });
      onChanged?.({ type: "create", name: created.name });
      reload();
    } catch (caught: any) {
      setNotice({ type: "error", text: caught.message });
    } finally {
      setCreating(false);
    }
  };
  if (error) return <Status error={error} />;
  if (!data) return <Status loading />;
  const matches = data.filter((tag) =>
    tag.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <div className={s.tagManager}>
      <p className={s.hint}>
        新增的固定标签会直接出现在发布页。重命名或删除会同步所有记录（含草稿和仅家人可见的记录），正文和照片不受影响。
      </p>
      <div className={s.tagCreator}>
        <Input
          aria-label="新标签名称"
          placeholder="输入新标签名称"
          maxLength={30}
          value={newTag}
          onChange={(event) => setNewTag(event.target.value)}
          onPressEnter={createTag}
        />
        <Button
          type="primary"
          icon={<Plus size={15} />}
          loading={creating}
          disabled={!newTag.trim() || deleting !== null || renaming}
          onClick={createTag}
        >
          新增
        </Button>
      </div>
      <Input
        aria-label="搜索标签"
        placeholder="搜索标签"
        allowClear
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {notice ? (
        <Alert type={notice.type} showIcon message={notice.text} />
      ) : null}
      {matches.length ? (
        <ul className={s.managedTags}>
          {matches.map(({ name, count }) => (
            <li key={name}>
              <span className={s.managedTagName}>{name}</span>
              <span className={s.hint}>{count} 篇记录</span>
              <Space size={6}>
                <Button
                  size="small"
                  disabled={deleting !== null || creating || renaming}
                  aria-label={`编辑标签 ${name}`}
                  onClick={() => {
                    setEditing({ name, count });
                    setRenamedTag(name);
                    setNotice(null);
                  }}
                >
                  编辑
                </Button>
                <Popconfirm
                  title={`删除标签「${name}」？`}
                  description={`将从所有使用它的记录中移除，当前有 ${count} 篇。`}
                  okText="删除标签"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  disabled={deleting !== null || creating || renaming}
                  onConfirm={async () => {
                    setDeleting(name);
                    setNotice(null);
                    try {
                      const result = await api<{ count: number }>(
                        "/admin/tags",
                        json("DELETE", { name }),
                      );
                      onChanged?.({ type: "delete", name });
                      setNotice({
                        type: "success",
                        text: `已删除标签「${name}」，从 ${result.count} 篇记录中移除。`,
                      });
                      reload();
                    } catch (caught: any) {
                      setNotice({ type: "error", text: caught.message });
                    } finally {
                      setDeleting(null);
                    }
                  }}
                >
                  <Button
                    danger
                    size="small"
                    loading={deleting === name}
                    disabled={deleting !== null || creating || renaming}
                    aria-label={`删除标签 ${name}`}
                  >
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          title={data.length ? "没有匹配的标签" : "还没有标签"}
          text="可以在上方新增固定标签，也可以在记录中输入后保存。"
        />
      )}
      <Modal
        title={`编辑标签「${editing?.name || ""}」`}
        open={!!editing}
        okText="保存修改"
        cancelText="取消"
        confirmLoading={renaming}
        okButtonProps={{
          disabled: !renamedTag.trim() || renamedTag.trim() === editing?.name,
        }}
        onCancel={() => {
          if (!renaming) setEditing(null);
        }}
        onOk={async () => {
          if (!editing) return;
          const newName = renamedTag.trim();
          if (!newName || newName === editing.name) return;
          setRenaming(true);
          setNotice(null);
          try {
            const result = await api<{
              name: string;
              count: number;
              merged: boolean;
            }>("/admin/tags", json("PUT", { name: editing.name, newName }));
            onChanged?.({
              type: "rename",
              name: editing.name,
              newName: result.name,
            });
            setEditing(null);
            setNotice({
              type: "success",
              text: result.merged
                ? `已将「${editing.name}」合并为「${result.name}」，同步 ${result.count} 篇记录。`
                : `已将「${editing.name}」改为「${result.name}」，同步 ${result.count} 篇记录。`,
            });
            reload();
          } catch (caught: any) {
            setNotice({ type: "error", text: caught.message });
          } finally {
            setRenaming(false);
          }
        }}
      >
        <label>
          新标签名称
          <Input
            autoFocus
            maxLength={30}
            value={renamedTag}
            onChange={(event) => setRenamedTag(event.target.value)}
            onPressEnter={(event) => event.preventDefault()}
          />
        </label>
        <p className={s.hint}>
          如果新名称已经存在，将合并为同一个标签，并自动去除记录中的重复标签。
        </p>
      </Modal>
    </div>
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
  // The editor sends the family back here after a save; say so, then drop the
  // note from the history entry so a refresh does not repeat it.
  const location = useLocation();
  const [saved, setSaved] = useState<string>(location.state?.saved || "");
  useEffect(() => {
    if (location.state?.saved) {
      setSaved(location.state.saved);
      nav(`${location.pathname}${location.search}`, { replace: true });
    }
  }, [location, nav]);
  return (
    <>
      <AdminHeading
        title="成长记录"
        text="不必等到特别的日子，今天就值得记下来。"
      >
        <Button
          type="primary"
          icon={<Plus size={17} />}
          // Opens an empty page; the story is only created once it has
          // something in it.
          onClick={() => nav("/admin/entries/new")}
        >
          写下新的一天
        </Button>
      </AdminHeading>
      {saved ? (
        <Alert
          type="success"
          showIcon
          closable
          message={saved}
          onClose={() => setSaved("")}
        />
      ) : null}
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
                  {/* A story created by adding a photo may not be named yet. */}
                  <h3>{e.title || "还没起名字"}</h3>
                  <small>
                    {e.occurredOn}
                    {postedTime(e) ? ` ${postedTime(e)}` : ""} ·{" "}
                    {e.media.length} 个媒体 {e.milestone ? "· 里程碑" : ""}
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
                      ? "不公开"
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
                        drafts.clear(e.id);
                        reload();
                      } catch (e: any) {
                        setMessage(e.message);
                      }
                    }}
                  >
                    <Button
                      type="text"
                      danger
                      aria-label={`删除 ${e.title || "还没起名字的记录"}`}
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
  converting?: boolean;
};

// Unsaved editor changes are kept in this browser, so a refresh, a closed tab
// or a phone reclaiming the page while picking photos does not lose them.
const draftKey = (id: string) => `bobo:draft:${id}`;
const drafts = {
  read(id: string): Draft | null {
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey(id)) || "null");
      return typeof draft?.savedAt === "number" && draft.entry?.media
        ? draft
        : null;
    } catch {
      return null;
    }
  },
  write(id: string, e: Entry) {
    try {
      localStorage.setItem(
        draftKey(id),
        JSON.stringify({ savedAt: Date.now(), entry: draftOf(e) }),
      );
    } catch {}
  },
  clear(id: string) {
    try {
      localStorage.removeItem(draftKey(id));
    } catch {}
  },
};
// Writing help: the model only proposes text. Nothing is saved or published
// until the family applies a piece and then saves the story themselves.
function AiDraftModal({
  open,
  onClose,
  entry,
  apply,
}: {
  open: boolean;
  onClose: () => void;
  entry: Entry;
  apply: (v: Partial<Entry>) => void;
}) {
  const photos = entry.media.filter((m) => m.kind === "image").slice(0, 4);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [hint, setHint] = useState("");
  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  useEffect(() => {
    if (!open) return;
    setError("");
    api<AiStatus>("/admin/ai/status")
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, [open]);
  const consent = async () => {
    setBusy(true);
    setError("");
    try {
      setStatus(await api<AiStatus>("/admin/ai/consent", json("PUT")));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const generate = async () => {
    setBusy(true);
    setError("");
    setDone("");
    try {
      const result = await api<AiDraft>(
        "/admin/ai/draft",
        json("POST", {
          mediaIds: photos.map((m) => m.id),
          occurredOn: entry.occurredOn || null,
          kind: entry.kind,
          hint,
        }),
      );
      setDraft(result);
      setStatus((s) =>
        s ? { ...s, remaining: Math.max(0, s.remaining - 1) } : s,
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const addTags = () => {
    const merged = [...entry.tags];
    for (const t of draft?.tags || [])
      if (!merged.includes(t) && merged.length < 20) merged.push(t);
    apply({ tags: merged });
    setDone("标签已添加，记得保存。");
  };
  const useCaptions = () => {
    const map = new Map(
      (draft?.captions || [])
        .filter((c) => c.caption)
        .map((c) => [c.mediaId, c.caption]),
    );
    apply({
      media: entry.media.map((m) =>
        map.has(m.id) ? { ...m, caption: map.get(m.id)! } : m,
      ),
    });
    setDone("照片说明已套用，记得保存。");
  };
  return (
    <Modal
      title="AI 帮我写"
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
      width={640}
    >
      {error ? <Alert type="error" showIcon message={error} /> : null}
      {!status && !error ? <Status loading /> : null}
      {status && !status.enabled ? (
        <Alert
          type="info"
          showIcon
          message="还没有配置 AI 服务"
          description="请家庭管理员在服务器的 .env 里填写 DEEPSEEK_API_KEY，再重启网站。"
        />
      ) : null}
      {status?.enabled && !status.consented ? (
        <div className={s.aiPanel}>
          <p>
            用这个功能时，这篇记录的日期、你写的重点，以及选中照片的缩略图会发送给
            DeepSeek 生成文字。不会发送你的账号、密码和整个数据库。
          </p>
          <p className={s.hint}>
            生成的内容只是草稿，需要你逐项应用并手动保存，AI 不会自动改动网站。
          </p>
          <Button type="primary" loading={busy} onClick={consent}>
            我知道了，开始使用
          </Button>
        </div>
      ) : null}
      {status?.enabled && status.consented ? (
        <div className={s.aiPanel}>
          {photos.length ? (
            <div className={s.aiPhotos}>
              {photos.map((m) => (
                <MediaImage key={m.id} media={m} alt={m.caption || m.name} />
              ))}
            </div>
          ) : (
            <p className={s.hint}>
              这篇还没有照片。也可以直接写，先上传照片会更贴近实际。
            </p>
          )}
          <label>
            想写的重点（可留空）
            <Input
              value={hint}
              maxLength={200}
              placeholder="例如：第一次剪毛，有点紧张但很乖"
              onChange={(e) => setHint(e.target.value)}
            />
          </label>
          <Space wrap>
            <Button
              type="primary"
              icon={<Sparkles size={16} />}
              loading={busy}
              disabled={status.remaining <= 0}
              onClick={generate}
            >
              {draft ? "再写一版" : "让啵啵写一段"}
            </Button>
            <span className={s.hint}>
              今天还能用 {status.remaining} / {status.quota} 次
            </span>
          </Space>
          {done ? <Alert type="success" showIcon message={done} /> : null}
          {draft ? (
            <div className={s.aiResult}>
              <h4>标题</h4>
              <Space direction="vertical" style={{ width: "100%" }}>
                {draft.titles.map((t, i) => (
                  <div className={s.aiRow} key={i}>
                    <span>{t}</span>
                    <Button
                      size="small"
                      onClick={() => {
                        apply({ title: t });
                        setDone("标题已填入，记得保存。");
                      }}
                    >
                      用这个
                    </Button>
                  </div>
                ))}
              </Space>
              <h4>正文</h4>
              <Input.TextArea
                value={draft.body}
                readOnly
                autoSize={{ minRows: 6, maxRows: 14 }}
              />
              <Space wrap>
                <Button
                  size="small"
                  onClick={() => {
                    apply({ body: draft.body });
                    setDone("正文已替换，记得保存。");
                  }}
                >
                  替换正文
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    apply({
                      body: entry.body
                        ? `${entry.body}\n\n${draft.body}`
                        : draft.body,
                    });
                    setDone("正文已追加，记得保存。");
                  }}
                >
                  追加到正文末尾
                </Button>
              </Space>
              {draft.tags.length ? (
                <>
                  <h4>标签</h4>
                  <Space wrap>
                    {draft.tags.map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                    <Button size="small" onClick={addTags}>
                      添加这些标签
                    </Button>
                  </Space>
                </>
              ) : null}
              {photos.length && draft.captions.some((c) => c.caption) ? (
                <>
                  <h4>照片说明</h4>
                  <Space direction="vertical" style={{ width: "100%" }}>
                    {draft.captions
                      .filter((c) => c.caption)
                      .map((c) => (
                        <div className={s.aiRow} key={c.mediaId}>
                          <span>{c.caption}</span>
                        </div>
                      ))}
                    <Button size="small" onClick={useCaptions}>
                      套用照片说明
                    </Button>
                  </Space>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

// A story that has not been created yet. It lives here in the browser until
// the first save, or until a photo is added, so simply opening the page never
// leaves an empty record behind.
const blankEntry = (user: AuthUser | null): Entry => ({
  id: "",
  title: "",
  occurredOn: today(),
  kind: "daily",
  body: "",
  tags: [],
  status: "published",
  visibility: "public",
  milestone: false,
  featured: false,
  coverMediaId: null,
  authorId: user?.id ?? null,
  author: user ? { displayName: user.displayName } : null,
  media: [],
});

function EntryEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = useContext(UserContext);
  const fresh = id === "new";
  // Everything that talks to the server uses this, not the address bar: a new
  // story gets its id partway through, when it is first written down.
  const [entryId, setEntryId] = useState(fresh ? "" : id || "");
  // The id as a ref too: uploads run in callbacks created before the story
  // existed, and state set halfway through never reaches those closures.
  const idRef = useRef(fresh ? "" : id || "");
  const creating = useRef<Promise<string> | null>(null);
  const remote = useData<Entry>(fresh ? "" : `/admin/entries/${id}`);
  const tagPool = useData<ManagedTag[]>("/admin/tags");
  const [tagsOpen, setTagsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [form, setForm] = useState<Entry | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false),
    [tasks, setTasks] = useState<UploadTask[]>([]);
  const text = useRef<TextAreaRef>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // A story created during this visit already holds the newest content, so a
  // later fetch of it must not overwrite what is on screen.
  const loaded = useRef("");
  useEffect(() => {
    if (fresh) {
      setForm((current) => current || blankEntry(user));
      return;
    }
    if (!remote.data || !id || loaded.current === id) return;
    loaded.current = id;
    setForm(remote.data);
    const saved = drafts.read(id);
    const differs =
      saved &&
      JSON.stringify(draftOf(withDraft(remote.data, saved))) !==
        JSON.stringify(draftOf(remote.data));
    if (differs) setDraft(saved);
    else drafts.clear(id);
  }, [remote.data, id, fresh, user]);
  // Uploading and saving start from callbacks built earlier in this page's
  // life. They read the story from here rather than from the value their
  // closure captured, which may be several keystrokes out of date.
  const formRef = useRef<Entry | null>(null);
  // While a previous draft awaits a decision, do not overwrite it.
  const pending = useRef<Entry | null>(null);
  useEffect(() => {
    formRef.current = form;
    pending.current = dirty && !draft ? form : null;
  }, [form, dirty, draft]);
  useEffect(() => {
    // Nothing is kept for a story that has no id yet: there is no saved
    // version to compare a recovered draft against.
    if (!entryId || !pending.current) return;
    const timer = setTimeout(() => {
      if (pending.current) drafts.write(entryId, pending.current);
    }, 800);
    return () => clearTimeout(timer);
  }, [entryId, form, dirty, draft]);
  useEffect(() => {
    const flush = () => {
      if (entryId && pending.current) drafts.write(entryId, pending.current);
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [entryId]);
  useUnsaved(dirty || tasks.some((t) => !t.done && !t.error));
  // Saving takes the family back to the list, but the guard above reads dirty
  // as it was when the render began: leaving in the same breath as the save
  // would ask them to confirm abandoning the changes they just saved. So the
  // trip waits for a render in which there is nothing left unsaved.
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (leaving && !dirty)
      nav("/admin", { state: { saved: "已保存这一天。" } });
  }, [leaving, dirty, nav]);
  const change = (v: Partial<Entry>) => {
    setForm((f) => (f ? { ...f, ...v } : f));
    setDirty(true);
    setMessage("");
    // Typing again cancels a pending trip back, so the page never leaves
    // under someone who has started writing more.
    setLeaving(false);
  };
  // Adding a photo needs somewhere to put it, so that is the other moment a
  // story stops being just a page on screen.
  async function ensureEntry(current: Entry) {
    if (idRef.current) return idRef.current;
    // Several photos are uploaded one after another from the same callback, so
    // the first one's creation is shared rather than repeated: otherwise each
    // photo would start a story of its own.
    if (!creating.current)
      // Deliberately without status and visibility, so this always starts as a
      // private draft: adding a photo must never put an unwritten story on the
      // public site. The save that follows sets what the family chose.
      creating.current = api<Entry>(
        "/admin/entries",
        json("POST", {
          title: current.title.trim(),
          occurredOn: current.occurredOn,
          kind: current.kind,
          body: current.body,
          tags: current.tags.filter(Boolean),
          milestone: current.milestone,
          featured: current.featured,
        }),
      )
        .then((created) => {
          // All three move together: the ref for callbacks already running,
          // the state for what is on screen, and loaded so that fetching this
          // story back does not overwrite what has been typed since.
          idRef.current = created.id;
          loaded.current = created.id;
          setEntryId(created.id);
          return created.id;
        })
        .finally(() => {
          creating.current = null;
        });
    return creating.current;
  }
  const refreshMedia = async (target = idRef.current) => {
    if (!target) return;
    setDirty(true);
    const latest = await api<Entry>(`/admin/entries/${target}`);
    setForm((f) =>
      f
        ? {
            ...f,
            media: mergeMedia(f.media, latest.media),
            uploads: latest.uploads,
          }
        : f,
    );
  };
  async function save() {
    if (!form) return;
    // Checked here as well as on the server, so a story that cannot be saved
    // is never created in the first place.
    if (!form.title.trim()) {
      setMessage("保存失败：给这一天起个名字吧");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const sent = form;
      const target = await ensureEntry(sent);
      const saved = await api<Entry>(
        `/admin/entries/${target}`,
        json("PUT", {
          ...sent,
          tags: sent.tags.filter(Boolean),
          media: sent.media.map((m) => ({ id: m.id, caption: m.caption })),
        }),
      );
      // Anything typed while the request was in flight is kept.
      const next = afterSave(sent, saved, formRef.current);
      setForm(next.form);
      setDirty(next.dirty);
      if (!next.dirty) drafts.clear(target);
      setMessage("已保存这一天。");
      // Anything typed while the save was in flight keeps the page open, so
      // those words are not carried off the screen unsaved.
      setLeaving(!next.dirty);
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
      patch({ error: undefined, progress: 0, done: false, converting: false });
      const mime = uploadType(task.file);
      if (task.id) await api(`/admin/media/${task.id}`, json("DELETE"));
      // A photo is worth keeping, so this is where an unsaved story becomes a
      // real one if it is not already.
      const current = formRef.current;
      const target = current ? await ensureEntry(current) : idRef.current;
      const permit = await api(
        "/admin/media/authorize",
        json("POST", {
          entryId: target,
          name: task.file.name,
          mime,
          size: task.file.size,
        }),
      );
      task.id = permit.id;
      patch({ id: permit.id });
      await uploadFile(permit.url, task.file, permit.headers, (n) =>
        patch({ progress: n }),
      );
      const processed = await api<{ state: string }>(
        `/admin/media/${permit.id}/complete`,
        json("POST"),
      );
      if (processed.state !== "ready") {
        patch({ converting: true });
        await waitForMedia(permit.id);
      }
      patch({ done: true, converting: false });
      await refreshMedia(target);
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
      {draft ? (
        <Alert
          type="warning"
          showIcon
          message={`发现 ${new Date(draft.savedAt).toLocaleString("zh-CN", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })} 自动保存、还没有提交的修改`}
          description="可能是上次刷新、关闭页面或网络中断时留下的。恢复后记得点击「保存记录」。"
          action={
            <Space>
              <Button
                size="small"
                type="primary"
                onClick={() => {
                  setForm((f) => (f ? withDraft(f, draft) : f));
                  setDirty(true);
                  setDraft(null);
                }}
              >
                恢复
              </Button>
              <Button
                size="small"
                onClick={() => {
                  if (entryId) drafts.clear(entryId);
                  setDraft(null);
                }}
              >
                丢弃
              </Button>
            </Space>
          }
        />
      ) : null}
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
              placeholder="例如：第一次剪毛"
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
            <Button
              type="text"
              size="small"
              icon={<Sparkles size={14} />}
              onClick={() => setAiOpen(true)}
            >
              AI 帮我写
            </Button>
            {/* Kept next to its button so the two can never end up under
                different conditions, and only built once asked for, so its
                own rendering can never break the editor around it. */}
            {aiOpen && (
              <AiDraftModal
                open
                onClose={() => setAiOpen(false)}
                entry={form}
                apply={change}
              />
            )}
          </div>
          <Input.TextArea
            ref={text}
            className={s.bodyEditor}
            value={form.body}
            // Ant Design writes the height inline, which is the only way it
            // reliably reaches the textarea itself. It also means the box
            // grows with the story instead of scrolling inside a fixed frame.
            autoSize={{ minRows: 10, maxRows: 30 }}
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
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,.mov"
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
            照片 ≤20MB，支持 JPG、PNG、WebP、GIF，动图会保留动画；视频 ≤500MB、3
            分钟以内，iPhone 拍的视频会自动转换格式。上传完成后再保存发布。
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
                <span>
                  {t.converting
                    ? "正在转换视频格式，可能需要几分钟，可以先继续写"
                    : t.progress === 100
                      ? "正在校验和处理…"
                      : null}
                </span>
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
                  {/* Stepping one place at a time is slow once a story has
                      dozens of photos, so a picture can jump to the front. */}
                  <Button
                    type="text"
                    size="small"
                    disabled={!i}
                    aria-label="放到最前"
                    title="放到最前"
                    icon={<ChevronsUp size={15} />}
                    onClick={() =>
                      change({ media: moveToFront(form.media, i) })
                    }
                  />
                  <Button
                    type="text"
                    size="small"
                    disabled={!i}
                    aria-label="向前移动"
                    title="向前移动"
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
                    title="向后移动"
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
            标签（可选择或输入后回车）
            <Select
              mode="tags"
              value={form.tags}
              onChange={(tags: string[]) =>
                change({
                  tags: [
                    ...new Set(tags.map((tag) => tag.trim()).filter(Boolean)),
                  ],
                })
              }
              options={[
                ...new Set([
                  ...(tagPool.data?.map((tag) => tag.name) || []),
                  ...form.tags,
                ]),
              ].map((tag) => ({ value: tag, label: tag }))}
              tokenSeparators={[",", "，"]}
              showSearch={{ optionFilterProp: "label" }}
              maxCount={20}
              maxTagCount="responsive"
              placeholder="选择已有标签，或输入新标签"
            />
          </label>
          {user?.role === "owner" ? (
            <>
              <Button
                type="link"
                size="small"
                icon={<Tags size={14} />}
                disabled={busy}
                onClick={() => setTagsOpen(true)}
              >
                管理标签
              </Button>
              <Modal
                title="管理标签"
                open={tagsOpen}
                footer={null}
                onCancel={() => setTagsOpen(false)}
                destroyOnHidden
              >
                <TagManager
                  onChanged={(managedChange) => {
                    tagPool.reload();
                    if (managedChange.type === "create") return;
                    change({
                      tags: applyManagedTagChange(form.tags, managedChange),
                    });
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            entry: {
                              ...current.entry,
                              tags: applyManagedTagChange(
                                current.entry.tags,
                                managedChange,
                              ),
                            },
                          }
                        : null,
                    );
                    if (entryId) {
                      const saved = drafts.read(entryId);
                      if (saved)
                        drafts.write(
                          entryId,
                          withDraft(form, {
                            ...saved,
                            entry: {
                              ...saved.entry,
                              tags: applyManagedTagChange(
                                saved.entry.tags,
                                managedChange,
                              ),
                            },
                          }),
                        );
                    }
                  }}
                />
              </Modal>
            </>
          ) : null}
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
          <p className={s.hint}>
            精选会出现在首页「偏爱的这一页」，按日期从新到旧最多显示 3
            篇，其余可以在成长手账里筛选查看。
          </p>
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
                { value: "private", label: "不公开（仅家庭账号）" },
                { value: "public", label: "公开（所有人）" },
              ]}
            />
          </label>
          <p className={s.hint}>
            <Lock size={14} />{" "}
            草稿始终不公开，只有家庭账号能看到；修改后点击保存生效。
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
                  {a.visibility === "public" ? "公开" : "不公开"}
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
  // Everything in the library that is not already in this album.
  const available = (library.data || []).filter(
    (m) => !form.items.some((x) => x.id === m.id),
  );
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
            谁可以看
            <Select
              value={form.visibility}
              onChange={(visibility: Album["visibility"]) =>
                update({ visibility })
              }
              options={[
                { value: "private", label: "不公开（仅家庭账号）" },
                { value: "public", label: "公开（所有人）" },
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
        <p className={s.hint}>公开相册会自动隐藏不公开或草稿故事中的媒体。</p>
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
        <h3>
          从媒体库添加
          {available.length ? ` · ${available.length} 个可选` : ""}
        </h3>
        {library.error ? (
          <Status error={library.error} />
        ) : !available.length ? (
          <p className={s.hint}>
            {library.data
              ? "媒体库里的照片都已经在这本相册里了。"
              : "正在读取媒体库…"}
          </p>
        ) : (
          <div className={s.library}>
            {available.map((m) => (
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

// Only the family owner reaches this page, so the panel is plain: two numbers,
// plus what everyone has used today so the numbers are not chosen blind.
function AiQuotaPanel() {
  const { data, error, reload } = useData<AiQuotas>("/admin/ai/quotas");
  const [form, setForm] = useState<{ draft: string; chat: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  useEffect(() => {
    if (data && !form)
      setForm({ draft: String(data.draft), chat: String(data.chat) });
  }, [data, form]);
  if (error) return <Status error={error} />;
  if (!data || !form) return <Status loading />;
  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await api(
        "/admin/ai/quotas",
        json("PUT", { draft: Number(form.draft), chat: Number(form.chat) }),
      );
      await reload();
      setNotice({ type: "success", text: "已保存，立即对所有家人生效。" });
    } catch (e: any) {
      setNotice({ type: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={`${s.panel} ${s.auditLog}`}>
      <h3>AI 额度</h3>
      <p className={s.hint}>
        每个家庭账号每天可以用多少次，按上海时区每天零点重置。填 0
        表示关闭该功能。这是防止意外用量的上限，真正的花费上限是 AI
        服务账户里的余额。
      </p>
      {notice ? (
        <Alert type={notice.type} showIcon message={notice.text} />
      ) : null}
      <div className={s.formRow}>
        <label>
          每人每天可用「AI 帮我写」
          <Input
            type="number"
            min={0}
            max={500}
            value={form.draft}
            onChange={(e) => setForm({ ...form, draft: e.target.value })}
          />
        </label>
        <label>
          每人每天可和啵啵聊
          <Input
            type="number"
            min={0}
            max={500}
            value={form.chat}
            onChange={(e) => setForm({ ...form, chat: e.target.value })}
          />
        </label>
      </div>
      <Space wrap>
        <Button type="primary" loading={busy} onClick={save}>
          保存额度
        </Button>
        <span className={s.hint}>修改会记入操作记录。</span>
      </Space>
      <h4 className={s.quotaHead}>今天的用量</h4>
      {data.today.every((u) => !u.draft && !u.chat) ? (
        <p className={s.hint}>今天还没有人用过。</p>
      ) : (
        <div className={s.quotaRows}>
          {data.today.map((u) => (
            <div className={s.quotaRow} key={u.id}>
              <span>{u.displayName}</span>
              <small>
                写作 {u.draft} / {data.draft} · 聊天 {u.chat} / {data.chat}
              </small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AccountManager({
  onChanged,
}: {
  onChanged: () => void | Promise<void>;
}) {
  const { data, error, reload } = useData<Account[]>("/admin/accounts");
  const logs = useData<AuditEntry[]>("/admin/audit-logs");
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [resetting, setResetting] = useState<Account | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

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
                      <Button
                        size="small"
                        onClick={() => {
                          setResetting(account);
                          setResetPassword("");
                          setResetError("");
                        }}
                      >
                        重置密码
                      </Button>
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
      <AiQuotaPanel />
      <section className={`${s.panel} ${s.auditLog}`}>
        <h3>操作记录</h3>
        <p className={s.hint}>
          家人修改网站资料、页面封面、相册、成长曲线和健康档案，以及管理员删除标签时会记在这里，显示最近
          200 条。
        </p>
        {logs.error ? (
          <Status error={logs.error} />
        ) : !logs.data ? (
          <Status loading />
        ) : !logs.data.length ? (
          <p className={s.hint}>还没有操作记录。</p>
        ) : (
          <ol className={s.auditList}>
            {logs.data.map((log) => (
              <li key={log.id}>
                <time dateTime={log.createdAt}>
                  {new Date(log.createdAt).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                    year: "numeric",
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                <strong>{log.actorName}</strong>
                <span>{log.summary}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
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
      <Modal
        title={`重置${resetting ? `「${resetting.displayName}」` : ""}的密码`}
        open={resetting !== null}
        okText="重置密码"
        cancelText="取消"
        confirmLoading={resetBusy}
        onCancel={() => setResetting(null)}
        onOk={async () => {
          if (!resetting) return;
          setResetBusy(true);
          setResetError("");
          try {
            await api(
              `/admin/accounts/${resetting.id}/password`,
              json("PUT", { password: resetPassword }),
            );
            setNotice({
              type: "success",
              text: `${resetting.displayName}的密码已重置，请把新密码告诉对方。对方所有设备上的登录已退出。`,
            });
            setResetting(null);
          } catch (e: any) {
            setResetError(e.message);
          } finally {
            setResetBusy(false);
          }
        }}
      >
        <label className={s.modalField}>
          新密码
          <Input
            value={resetPassword}
            maxLength={200}
            placeholder="至少 12 位"
            autoComplete="new-password"
            onChange={(event) => setResetPassword(event.target.value)}
          />
        </label>
        <Button size="small" onClick={() => setResetPassword(randomPassword())}>
          随机生成
        </Button>
        <p className={s.hint}>
          密码以明文显示，方便抄给家人。重置后对方需要用新密码重新登录。
        </p>
        {resetError ? (
          <Alert type="error" showIcon message={resetError} />
        ) : null}
      </Modal>
    </>
  );
}

// Unambiguous characters, so a reset password is easy to read out to family.
const passwordAlphabet =
  "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomPassword = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(14)),
    (b) => passwordAlphabet[b % passwordAlphabet.length],
  ).join("");

const healthKindLabels: Record<HealthRecord["kind"], string> = {
  vaccine: "疫苗",
  deworming: "驱虫",
  checkup: "体检",
  grooming: "美容",
};
const healthKindOptions = Object.entries(healthKindLabels).map(
  ([value, label]) => ({ value, label }),
);
const healthNeedsAttention = (record: HealthRecord) =>
  ["overdue", "today", "soon"].includes(
    healthReminder(record.nextDueOn).status,
  );

function HealthNavLink() {
  const { data, reload } = useData<HealthRecord[]>("/admin/health-records");
  useEffect(() => {
    const refresh = () => reload();
    window.addEventListener("health-records-changed", refresh);
    return () => window.removeEventListener("health-records-changed", refresh);
  }, []);
  const attention = data?.filter(healthNeedsAttention).length ?? 0;
  return (
    <NavLink to="/admin/health">
      <HeartPulse size={18} /> 健康档案
      {attention ? (
        <span className={s.navCount} aria-label={`${attention} 项待关注`}>
          {attention > 99 ? "99+" : attention}
        </span>
      ) : null}
    </NavLink>
  );
}

type HealthForm = {
  kind: HealthRecord["kind"];
  occurredOn: string;
  nextDueOn: string;
  note: string;
};
const blankHealthForm = (): HealthForm => ({
  kind: "vaccine",
  occurredOn: today(),
  nextDueOn: "",
  note: "",
});
const reminderColor = (status: ReturnType<typeof healthReminder>["status"]) =>
  status === "overdue"
    ? "red"
    : status === "today"
      ? "orange"
      : status === "soon"
        ? "gold"
        : status === "later"
          ? "green"
          : "default";

function HealthManager() {
  const { data, error, reload } = useData<HealthRecord[]>(
    "/admin/health-records",
  );
  const [form, setForm] = useState<HealthForm>(blankHealthForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  if (error) return <Status error={error} />;
  if (!data) return <Status loading />;
  const attention = data.filter(healthNeedsAttention);
  const field = <K extends keyof HealthForm>(name: K, value: HealthForm[K]) =>
    setForm((current) => ({ ...current, [name]: value }));
  const changed = () => {
    reload();
    window.dispatchEvent(new Event("health-records-changed"));
  };
  return (
    <>
      <AdminHeading
        title="健康档案"
        text="记录疫苗、驱虫、体检和美容；这些内容只对已登录的家人可见。"
      />
      {notice ? (
        <Alert type={notice.type} showIcon message={notice.text} />
      ) : null}
      {attention.length ? (
        <Alert
          className={s.healthReminder}
          type={
            attention.some(
              (record) => healthReminder(record.nextDueOn).status === "overdue",
            )
              ? "warning"
              : "info"
          }
          showIcon
          message={`有 ${attention.length} 项健康安排需要关注`}
          description={attention
            .slice(0, 3)
            .map((record) => {
              const reminder = healthReminder(record.nextDueOn);
              return `${healthKindLabels[record.kind]}：${record.nextDueOn}（${reminder.text}）`;
            })
            .join("；")}
        />
      ) : null}
      <div className={s.healthLayout}>
        <form
          className={`${s.panel} ${s.healthForm}`}
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setNotice(null);
            try {
              await api(
                editing
                  ? `/admin/health-records/${editing}`
                  : "/admin/health-records",
                json(editing ? "PUT" : "POST", {
                  ...form,
                  nextDueOn: form.nextDueOn || null,
                }),
              );
              setNotice({
                type: "success",
                text: editing ? "健康记录已更新。" : "健康记录已添加。",
              });
              setEditing(null);
              setForm(blankHealthForm());
              changed();
            } catch (caught: any) {
              setNotice({ type: "error", text: caught.message });
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>{editing ? "修改健康记录" : "添加健康记录"}</h3>
          <label>
            类型
            <Select
              value={form.kind}
              options={healthKindOptions}
              onChange={(value) => field("kind", value)}
            />
          </label>
          <label>
            本次日期
            <Input
              type="date"
              required
              max={today()}
              value={form.occurredOn}
              onChange={(event) => field("occurredOn", event.target.value)}
            />
          </label>
          <label>
            下次时间（可留空）
            <Input
              type="date"
              min={form.occurredOn}
              value={form.nextDueOn}
              onChange={(event) => field("nextDueOn", event.target.value)}
            />
          </label>
          <label>
            备注（可留空）
            <Input.TextArea
              value={form.note}
              maxLength={500}
              autoSize={{ minRows: 3, maxRows: 7 }}
              placeholder="例如：疫苗品牌、医院、医生建议"
              onChange={(event) => field("note", event.target.value)}
            />
          </label>
          <p className={s.hint}>
            下次时间到期、当天或进入 7 天内时，会在本页和侧栏提醒。
          </p>
          <Space wrap>
            <Button type="primary" htmlType="submit" loading={busy}>
              {editing ? "保存修改" : "添加记录"}
            </Button>
            {editing ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setForm(blankHealthForm());
                }}
              >
                取消修改
              </Button>
            ) : null}
          </Space>
        </form>
        <section className={`${s.panel} ${s.healthList}`}>
          <h3>全部记录</h3>
          {data.length ? (
            data.map((record) => {
              const reminder = healthReminder(record.nextDueOn);
              return (
                <article
                  className={`${s.healthRow} ${
                    healthNeedsAttention(record) ? s.healthAttention : ""
                  }`}
                  key={record.id}
                >
                  <Tag color="green">{healthKindLabels[record.kind]}</Tag>
                  <div className={s.healthMain}>
                    <strong>{record.occurredOn}</strong>
                    <div className={s.healthMeta}>
                      <span>
                        {record.nextDueOn
                          ? `下次 ${record.nextDueOn}`
                          : "未设置下次时间"}
                      </span>
                      {record.nextDueOn ? (
                        <Tag color={reminderColor(reminder.status)}>
                          {reminder.text}
                        </Tag>
                      ) : null}
                    </div>
                    {record.note ? (
                      <p className={s.healthNote}>{record.note}</p>
                    ) : null}
                  </div>
                  <div className={s.healthActions}>
                    <Button
                      size="small"
                      type="link"
                      onClick={() => {
                        setEditing(record.id);
                        setForm({
                          kind: record.kind,
                          occurredOn: record.occurredOn,
                          nextDueOn: record.nextDueOn ?? "",
                          note: record.note,
                        });
                        setNotice(null);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      修改
                    </Button>
                    <Popconfirm
                      title="删除这条健康记录？"
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={async () => {
                        try {
                          await api(
                            `/admin/health-records/${record.id}`,
                            json("DELETE"),
                          );
                          if (editing === record.id) {
                            setEditing(null);
                            setForm(blankHealthForm());
                          }
                          setNotice({
                            type: "success",
                            text: "健康记录已删除。",
                          });
                          changed();
                        } catch (caught: any) {
                          setNotice({ type: "error", text: caught.message });
                        }
                      }}
                    >
                      <Button size="small" type="link" danger>
                        删除
                      </Button>
                    </Popconfirm>
                  </div>
                </article>
              );
            })
          ) : (
            <Empty
              title="还没有健康记录"
              text="从最近一次疫苗、驱虫、体检或美容开始记录吧。"
            />
          )}
        </section>
      </div>
    </>
  );
}

function GrowthManager() {
  const { data, error, reload } = useData<Growth>("/admin/growth");
  const blank = () => ({
    measuredOn: today(),
    weight: "",
    height: "",
    note: "",
  });
  const [form, setForm] = useState(blank),
    [editing, setEditing] = useState<string | null>(null),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<{
      type: "success" | "error";
      text: string;
    } | null>(null);
  useEffect(() => {
    if (data) setVisible(data.public);
  }, [data]);
  if (error) return <Status error={error} />;
  if (!data) return <Status loading />;
  const field = (name: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [name]: value }));
  const amount = (value: string) =>
    value.trim() === "" ? null : Number(value);
  return (
    <>
      <AdminHeading
        title="成长曲线"
        text="称一称体重、量一量肩高，看看啵啵长大了多少。"
      />
      {notice ? (
        <Alert type={notice.type} showIcon message={notice.text} />
      ) : null}
      <form
        className={`${s.panel} ${s.growthForm}`}
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setNotice(null);
          try {
            await api(
              editing ? `/admin/growth/${editing}` : "/admin/growth",
              json(editing ? "PUT" : "POST", {
                measuredOn: form.measuredOn,
                weight: amount(form.weight),
                height: amount(form.height),
                note: form.note,
              }),
            );
            setNotice({
              type: "success",
              text: editing ? "这次测量已更新。" : "已记下这次测量。",
            });
            setEditing(null);
            setForm(blank());
            reload();
          } catch (e: any) {
            setNotice({ type: "error", text: e.message });
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>{editing ? "修改这次测量" : "记录一次测量"}</h3>
        <div className={s.formRow}>
          <label>
            测量日期
            <Input
              type="date"
              required
              max={today()}
              value={form.measuredOn}
              onChange={(e) => field("measuredOn", e.target.value)}
            />
          </label>
          <label>
            体重（kg）
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="例如 4.25"
              value={form.weight}
              onChange={(e) => field("weight", e.target.value)}
            />
          </label>
          <label>
            肩高（cm）
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              placeholder="例如 28.5"
              value={form.height}
              onChange={(e) => field("height", e.target.value)}
            />
          </label>
        </div>
        <label>
          备注（可留空，只有家人能看到）
          <Input
            maxLength={200}
            placeholder="例如：打完第二针疫苗后称重"
            value={form.note}
            onChange={(e) => field("note", e.target.value)}
          />
        </label>
        <p className={s.hint}>
          体重和肩高至少填一项；同一天只保留一条记录，需要改就点下方表格里的「修改」。
        </p>
        <Space wrap>
          <Button type="primary" htmlType="submit" loading={busy}>
            {editing ? "保存修改" : "添加记录"}
          </Button>
          {editing ? (
            <Button
              onClick={() => {
                setEditing(null);
                setForm(blank());
              }}
            >
              取消修改
            </Button>
          ) : null}
        </Space>
        <hr />
        <Checkbox
          className={s.checkLine}
          checked={visible}
          onChange={async (e) => {
            const next = e.target.checked;
            setVisible(next);
            try {
              await api(
                "/admin/growth-visibility",
                json("PUT", { public: next }),
              );
              setNotice({
                type: "success",
                text: next
                  ? "成长曲线已在「关于啵啵」页面公开，备注不会公开。"
                  : "成长曲线已改为不公开，只有家庭账号能看到。",
              });
            } catch (err: any) {
              setVisible(!next);
              setNotice({ type: "error", text: err.message });
            }
          }}
        >
          在「关于啵啵」页面公开成长曲线（不含备注）
        </Checkbox>
      </form>
      {data.items.length ? (
        <div className={`${s.panel} ${s.growthPanel}`}>
          <div className={s.growthCharts}>
            <GrowthChart
              items={data.items}
              metric="weight"
              title="体重"
              unit="kg"
            />
            <GrowthChart
              items={data.items}
              metric="height"
              title="肩高"
              unit="cm"
            />
          </div>
          <h3>全部记录</h3>
          <GrowthTable
            items={data.items}
            open
            actions={(m) => (
              <Space size={2}>
                <Button
                  size="small"
                  type="link"
                  onClick={() => {
                    setEditing(m.id!);
                    setForm({
                      measuredOn: m.measuredOn,
                      weight: m.weight?.toString() ?? "",
                      height: m.height?.toString() ?? "",
                      note: m.note ?? "",
                    });
                    setNotice(null);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  修改
                </Button>
                <Popconfirm
                  title="删除这次测量？"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={async () => {
                    try {
                      await api(`/admin/growth/${m.id}`, json("DELETE"));
                      if (editing === m.id) {
                        setEditing(null);
                        setForm(blank());
                      }
                      reload();
                    } catch (err: any) {
                      setNotice({ type: "error", text: err.message });
                    }
                  }}
                >
                  <Button size="small" type="link" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            )}
          />
        </div>
      ) : (
        <Empty
          title="还没有成长记录"
          text="从今天开始记下体重和肩高，这里就会画出成长曲线。"
        />
      )}
    </>
  );
}

const coverTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

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
          <h4>上传的图片 · {uploaded.length} 张</h4>
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
      <h4>公开故事中的照片{stories.length ? ` · ${stories.length} 张` : ""}</h4>
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
      throw new Error("封面只支持 JPG、PNG、WebP、GIF 图片");
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
