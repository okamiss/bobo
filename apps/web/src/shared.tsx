import {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { Link, useBlocker } from "react-router";
import {
  PawPrint,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  X,
  Play,
  Feather,
} from "lucide-react";
import { api, age, coverOf, type Entry, type Profile, type Media } from "./lib";
import s from "./App.module.css";
export const ProfileContext = createContext<Profile | null>(null);

export function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setError("");
    setData(null);
    api<T>(path)
      .then((x) => {
        if (alive) setData(x);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [path, revision]);
  return { data, error, reload: () => setRevision((v) => v + 1) };
}

export function Status({
  error,
  loading = false,
}: {
  error?: string;
  loading?: boolean;
}) {
  return (
    <div className={s.status} role={error ? "alert" : "status"}>
      {error || (loading ? "正在翻开手账…" : "这里暂时还没有内容。")}
      {error && <button onClick={() => location.reload()}>重新加载</button>}
    </div>
  );
}

export function Empty({
  title = "好日子，慢慢收集",
  text = "第一篇故事，还在等你写下。",
  action = false,
}: {
  title?: string;
  text?: string;
  action?: boolean;
}) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon}>
        <PawPrint size={30} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <Link to="/admin" className={s.textLink}>
          写下第一篇故事 <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}

export function SectionTitle({
  en,
  title,
  to,
  label = "全部看看",
}: {
  en: string;
  title: string;
  to?: string;
  label?: string;
}) {
  return (
    <div className={s.sectionTitle}>
      <div>
        <span className={s.eyebrow}>{en}</span>
        <h2>
          {title}
          <span className={s.titleDot}> ✳</span>
        </h2>
      </div>
      {to && (
        <Link className={s.textLink} to={to}>
          {label}
          <ArrowUpRight size={17} />
        </Link>
      )}
    </div>
  );
}

export function EntryCard({ entry }: { entry: Entry }) {
  const m = coverOf(entry);
  return (
    <Link to={`/stories/${entry.id}`} className={s.entryCard}>
      <div className={s.cardPhoto}>
        {m ? (
          <img src={m.thumb} alt={m.caption || entry.title} loading="lazy" />
        ) : (
          <div className={s.textPhoto}>
            <Feather size={42} />
            <span>一页文字，也值得珍藏</span>
          </div>
        )}
        {m?.kind === "video" && (
          <span className={s.playBadge}>
            <Play size={19} />
          </span>
        )}
        {entry.milestone && (
          <span className={s.stamp}>
            第一次
            <br />
            的珍藏
          </span>
        )}
      </div>
      <div className={s.cardMeta}>
        {entry.occurredOn.replaceAll("-", ".")}{" "}
        <span>{entry.kind === "event" ? "特别的一天" : "日常碎片"}</span>
      </div>
      <h3>{entry.title}</h3>
      <p>
        {entry.body.replace(/[#>*]/g, "").slice(0, 65) ||
          "把这个瞬间，轻轻夹进手账。"}
      </p>
      <span className={s.readStory}>
        翻开这一天 <ArrowUpRight size={16} />
      </span>
    </Link>
  );
}

export function PageHeader({
  en,
  title,
  text,
}: {
  en: string;
  title: string;
  text: string;
}) {
  return (
    <div className={s.pageHeader}>
      <span className={s.eyebrow}>{en}</span>
      <h1>
        {title}
        <span> ✳</span>
      </h1>
      <p>{text}</p>
    </div>
  );
}

export function BodyText({ text }: { text: string }) {
  return (
    <div className={s.bodyText}>
      {text.split("\n").map((line, i) =>
        line.startsWith("## ") ? (
          <h2 key={i}>{line.slice(3)}</h2>
        ) : line.startsWith("> ") ? (
          <blockquote key={i}>{line.slice(2)}</blockquote>
        ) : line.startsWith("- ") ? (
          <p key={i} className={s.listLine}>
            • {line.slice(2)}
          </p>
        ) : (
          <p key={i}>{line || "\u00a0"}</p>
        ),
      )}
    </div>
  );
}

export function Lightbox({
  items,
  start,
  onClose,
}: {
  items: Media[];
  start: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(start);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    close.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((n) => (n + 1) % items.length);
      if (e.key === "ArrowLeft")
        setIndex((n) => (n - 1 + items.length) % items.length);
      if (e.key === "Tab") {
        const buttons = Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-lightbox] button, [data-lightbox] a, [data-lightbox] video",
          ),
        );
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = previous;
      old?.focus();
    };
  }, [items.length, onClose]);
  const m = items[index];
  const access = useData<Media>(`/media/${m.id}/access`);
  const fresh = access.data?.id === m.id ? access.data : null;
  return (
    <div
      className={s.lightbox}
      data-lightbox
      role="dialog"
      aria-modal="true"
      aria-label="照片与视频查看器"
    >
      <button
        ref={close}
        className={s.close}
        onClick={onClose}
        aria-label="关闭"
      >
        <X />
      </button>
      <button
        onClick={() => setIndex((n) => (n - 1 + items.length) % items.length)}
        aria-label="上一张"
      >
        <ChevronLeft />
      </button>
      <figure>
        {access.error ? (
          <Status error={access.error} />
        ) : !fresh ? (
          <Status loading />
        ) : m.kind === "video" ? (
          <video
            key={m.id}
            src={fresh.url}
            controls
            poster={fresh.thumb}
            tabIndex={0}
          />
        ) : (
          <img src={fresh.url} alt={m.caption || m.name} />
        )}
        <figcaption>
          {m.caption || m.name}
          <small>
            {index + 1} / {items.length}
          </small>
          <Link to={`/stories/${m.entryId}`} onClick={onClose}>
            回到原故事 ↗
          </Link>
        </figcaption>
      </figure>
      <button
        onClick={() => setIndex((n) => (n + 1) % items.length)}
        aria-label="下一张"
      >
        <ChevronRight />
      </button>
    </div>
  );
}

export function MediaGrid({ items }: { items: Media[] }) {
  const [index, setIndex] = useState<number | null>(null);
  return (
    <>
      <div className={s.mediaGrid}>
        {items.map((m, i) => (
          <button
            className={s.mediaTile}
            key={m.id}
            onClick={() => setIndex(i)}
            aria-label={`查看 ${m.caption || m.name}`}
          >
            <img src={m.thumb} alt={m.caption || m.name} loading="lazy" />
            {m.kind === "video" && (
              <span className={s.playBadge}>
                <Play />
              </span>
            )}
            {m.caption && <span>{m.caption}</span>}
          </button>
        ))}
      </div>
      {index !== null && (
        <Lightbox items={items} start={index} onClose={() => setIndex(null)} />
      )}
    </>
  );
}

export function StoryView({
  entry,
  preview = false,
}: {
  entry: Entry;
  preview?: boolean;
}) {
  const p = useContext(ProfileContext);
  return (
    <article className={s.story}>
      <div className={s.storyMeta}>
        {entry.occurredOn.replaceAll("-", ".")} <span>·</span>{" "}
        {entry.kind === "event" ? "特别的一天" : "日常碎片"}{" "}
        {p?.birthday && age(p.birthday, entry.occurredOn) && (
          <span>· {age(p.birthday, entry.occurredOn)}的啵啵</span>
        )}
      </div>
      <h1>{entry.title}</h1>
      {entry.milestone && (
        <div className={s.milestoneLabel}>
          <Sparkles size={15} /> 值得珍藏的成长里程碑
        </div>
      )}
      <div className={s.tags}>
        {entry.tags.map((t) => (
          <span key={t}>#{t}</span>
        ))}
      </div>
      <BodyText text={entry.body} />
      <MediaGrid items={entry.media} />
      {!preview && (
        <div className={s.storyNeighbors}>
          {entry.previous ? (
            <Link to={`/stories/${entry.previous.id}`}>
              <ArrowLeft size={17} />
              {entry.previous.title}
            </Link>
          ) : (
            <span />
          )}
          {entry.next && (
            <Link to={`/stories/${entry.next.id}`}>
              {entry.next.title}
              <ArrowRight size={17} />
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

export function AdminHeading({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className={s.adminHeading}>
      <div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {children}
    </div>
  );
}

export function useUnsaved(dirty: boolean) {
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (confirm("还有未保存的修改，确定离开吗？")) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", before);
    return () => {
      window.removeEventListener("beforeunload", before);
    };
  }, [dirty]);
}
