import {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  type ImgHTMLAttributes,
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

// Shown in place of a page cover or album photos that have not been chosen.
export function BoboIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 400 340"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="雪纳瑞啵啵的插画"
    >
      <rect width="400" height="340" fill="#e4e9d5" />
      <circle cx="200" cy="176" r="132" fill="#d6ddc0" />
      <g fill="#bcc6a2">
        <circle cx="70" cy="70" r="4" />
        <circle cx="332" cy="250" r="5" />
        <circle cx="352" cy="118" r="3" />
      </g>
      <path
        d="M96 118v18M87 127h18"
        stroke="#b3bf97"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M312 70c-6-10-22-6-18 8 3 8 18 16 18 16s15-8 18-16c4-14-12-18-18-8z"
        fill="#d9a184"
      />
      <ellipse cx="200" cy="296" rx="116" ry="14" fill="#c4cdaa" />
      <ellipse cx="146" cy="272" rx="32" ry="26" fill="#7c8277" />
      <ellipse cx="254" cy="272" rx="32" ry="26" fill="#7c8277" />
      <path d="M138 296c-8-54 8-100 62-108 54 8 70 54 62 108z" fill="#8f958a" />
      <path d="M168 296c-6-44 6-80 32-86 26 6 38 42 32 86z" fill="#ecebdf" />
      <rect x="166" y="232" width="28" height="62" rx="14" fill="#e5e3d6" />
      <rect x="206" y="232" width="28" height="62" rx="14" fill="#e5e3d6" />
      <ellipse cx="180" cy="294" rx="19" ry="9" fill="#f4f2e8" />
      <ellipse cx="220" cy="294" rx="19" ry="9" fill="#f4f2e8" />
      <path
        d="M174 290v6M181 290v7M188 290v6M212 290v6M219 290v7M226 290v6"
        stroke="#d3d1c3"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M148 180c20 16 84 16 104 0"
        fill="none"
        stroke="#c98c63"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path d="M162 80c-16-10-38-6-42 8 4 14 18 22 34 20z" fill="#6c7266" />
      <path d="M238 80c16-10 38-6 42 8-4 14-18 22-34 20z" fill="#6c7266" />
      <rect x="146" y="68" width="108" height="100" rx="40" fill="#9ea397" />
      <path
        d="M162 124c-4 36 8 74 26 82 5 2 8-3 12 1 4-4 7 1 12-1 18-8 30-46 26-82-14 9-62 9-76 0z"
        fill="#efeee4"
      />
      <path
        d="M200 152c-7 10-18 14-28 11M200 152c7 10 18 14 28 11"
        fill="none"
        stroke="#d5d3c6"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M189 174q11 9 22 0"
        fill="none"
        stroke="#8f958a"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M195 177q5 11 10 0z" fill="#e49b90" />
      <path d="M156 112c10-15 30-16 40-5-8 6-25 10-40 9z" fill="#f1f0e6" />
      <path d="M244 112c-10-15-30-16-40-5 8 6 25 10 40 9z" fill="#f1f0e6" />
      <circle cx="178" cy="123" r="7" fill="#2c312a" />
      <circle cx="222" cy="123" r="7" fill="#2c312a" />
      <circle cx="180.5" cy="120.5" r="2.2" fill="#fff" />
      <circle cx="224.5" cy="120.5" r="2.2" fill="#fff" />
      <ellipse cx="200" cy="143" rx="13" ry="9" fill="#2c312a" />
      <ellipse cx="195" cy="140" rx="3.5" ry="2" fill="#6b7166" />
      <ellipse cx="162" cy="150" rx="8" ry="5" fill="#e3b29b" opacity=".55" />
      <ellipse cx="238" cy="150" rx="8" ry="5" fill="#e3b29b" opacity=".55" />
      <circle cx="200" cy="214" r="8" fill="#e0b155" />
      <g fill="#b6c09a">
        <ellipse cx="70" cy="262" rx="9" ry="7" />
        <circle cx="58" cy="250" r="3.5" />
        <circle cx="66" cy="245" r="3.5" />
        <circle cx="75" cy="245" r="3.5" />
        <circle cx="83" cy="251" r="3.5" />
      </g>
    </svg>
  );
}

// Signed media URLs expire after 5 minutes. Lazily loaded images and long-open
// videos can hit an expired URL, so request a fresh one once and retry.
export function MediaImage({
  media,
  variant = "thumb",
  ...props
}: { media: Media; variant?: "thumb" | "url" } & Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "onError"
>) {
  const signed = media[variant];
  const [fresh, setFresh] = useState<{ stale: string; src: string } | null>(
    null,
  );
  const refreshed = fresh !== null && fresh.stale === signed;
  return (
    <img
      {...props}
      src={refreshed ? fresh.src : signed}
      onError={() => {
        if (!refreshed)
          api<Media>(`/media/${media.id}/access`)
            .then((m) => setFresh({ stale: signed, src: m[variant] }))
            .catch(() => {});
      }}
    />
  );
}

function MediaVideo({ media }: { media: Media }) {
  const video = useRef<HTMLVideoElement>(null);
  const [signed, setSigned] = useState(() => ({
    url: media.url,
    at: Date.now(),
  }));
  return (
    <video
      ref={video}
      src={signed.url}
      controls
      poster={media.thumb}
      tabIndex={0}
      onError={() => {
        const v = video.current;
        // An error soon after loading is a real playback failure, not expiry.
        if (!v || Date.now() - signed.at < 60000) return;
        const time = v.currentTime,
          resume = !v.paused;
        api<Media>(`/media/${media.id}/access`)
          .then((m) => {
            v.addEventListener(
              "loadedmetadata",
              () => {
                v.currentTime = time;
                if (resume) v.play().catch(() => {});
              },
              { once: true },
            );
            setSigned({ url: m.url, at: Date.now() });
          })
          .catch(() => {});
      }}
    />
  );
}

export function EntryCard({ entry }: { entry: Entry }) {
  const m = coverOf(entry);
  return (
    <Link to={`/stories/${entry.id}`} className={s.entryCard}>
      <div className={s.cardPhoto}>
        {m ? (
          <MediaImage media={m} alt={m.caption || entry.title} loading="lazy" />
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
        {entry.author ? <span> · {entry.author.displayName} 记录</span> : null}
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
          <MediaVideo key={m.id} media={fresh} />
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
            <MediaImage media={m} alt={m.caption || m.name} loading="lazy" />
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
        {entry.author ? <span>· {entry.author.displayName} 记录</span> : null}{" "}
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
