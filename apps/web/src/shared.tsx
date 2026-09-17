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
import {
  api,
  age,
  coverOf,
  valueTicks,
  monthTicks,
  type Entry,
  type Profile,
  type Media,
  type Measurement,
} from "./lib";
import s from "./App.module.css";
import illustration from "./assets/illustration.webp";
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
    <img
      className={className}
      src={illustration}
      alt="雪纳瑞啵啵的水彩插画"
      decoding="async"
    />
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

// Growth line color: the site's sage pushed to a chroma that reads as green
// (checked with the dataviz palette validator against the #fffdf7 surface).
const growthColor = "#5f8c46";
const unitText = (value: number, unit: string) => `${value} ${unit}`;

// One measure over time. Weight and shoulder height are separate charts
// rather than two scales on one plot.
export function GrowthChart({
  items,
  metric,
  title,
  unit,
}: {
  items: Measurement[];
  metric: "weight" | "height";
  title: string;
  unit: string;
}) {
  const profile = useContext(ProfileContext);
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560),
    [active, setActive] = useState<number | null>(null);
  const points = items
    .filter((m) => m[metric] !== null)
    .map((m) => ({
      date: m.measuredOn,
      value: m[metric] as number,
      t: Date.parse(`${m.measuredOn}T00:00:00Z`),
    }));
  const drawn = points.length > 0;
  useEffect(() => {
    if (!plot.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(260, Math.round(entry.contentRect.width))),
    );
    observer.observe(plot.current);
    return () => observer.disconnect();
  }, [drawn]);
  if (!drawn) return null;
  const H = 230,
    L = 38,
    R = 64,
    T = 16,
    B = 30;
  const first = points[0],
    last = points[points.length - 1];
  const x = (t: number) =>
    first.t === last.t
      ? L + (width - L - R) / 2
      : L + ((t - first.t) / (last.t - first.t)) * (width - L - R);
  const ticks = valueTicks(Math.max(...points.map((p) => p.value)) * 1.08);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const line = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.t)},${y(p.value)}`)
    .join("");
  const area = `${line}L${x(last.t)},${y(0)}L${x(first.t)},${y(0)}Z`;
  const sameYear = first.date.slice(0, 4) === last.date.slice(0, 4);
  const months = monthTicks(first.date, last.date, Math.floor(width / 90));
  const dateLabels = months.length
    ? months.map((d) => ({
        d,
        text: sameYear
          ? `${Number(d.slice(5, 7))}月`
          : `${d.slice(0, 4)}.${Number(d.slice(5, 7))}`,
      }))
    : [first, last]
        .filter((p, i) => i === 0 || p.t !== first.t)
        .map((p) => ({
          d: p.date,
          text: `${Number(p.date.slice(5, 7))}.${Number(p.date.slice(8))}`,
        }));
  const shown = active === null ? null : points[active];
  const shownAt = shown ? x(shown.t) / width : 0;
  const pick = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.t) - px) < Math.abs(x(points[best].t) - px)) best = i;
    });
    setActive(best);
  };
  return (
    <figure className={s.growthChart}>
      <figcaption>
        {title}
        <small>单位 {unit}</small>
      </figcaption>
      <div className={s.growthPlot} ref={plot}>
        <svg
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          tabIndex={0}
          aria-label={`${title}，共 ${points.length} 次记录，最近 ${last.date} 为 ${unitText(last.value, unit)}。可用左右方向键查看每次记录。`}
          onPointerMove={(e) =>
            pick(e.clientX, e.currentTarget.getBoundingClientRect())
          }
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(points.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft")
              setActive((i) => Math.max(0, (i ?? points.length) - 1));
            if (e.key === "ArrowRight")
              setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1));
          }}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={L}
                x2={width - R}
                y1={y(v)}
                y2={y(v)}
                stroke="#ebe9dc"
                strokeWidth={1}
              />
              <text x={L - 8} y={y(v)} dy="0.32em" textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {dateLabels.map(({ d, text }) => (
            <text
              key={d}
              x={x(Date.parse(`${d}T00:00:00Z`))}
              y={H - 8}
              textAnchor="middle"
            >
              {text}
            </text>
          ))}
          <path d={area} fill={growthColor} fillOpacity={0.1} />
          <path
            d={line}
            fill="none"
            stroke={growthColor}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {shown ? (
            <line
              x1={x(shown.t)}
              x2={x(shown.t)}
              y1={T}
              y2={H - B}
              stroke="#cfd0c2"
              strokeWidth={1}
            />
          ) : null}
          {points.map((p, i) => (
            <circle
              key={p.date}
              cx={x(p.t)}
              cy={y(p.value)}
              r={i === active ? 6 : 4}
              fill={growthColor}
              stroke="#fffdf7"
              strokeWidth={2}
            />
          ))}
          <text
            className={s.growthLatest}
            x={x(last.t) + 10}
            y={y(last.value)}
            dy="0.32em"
          >
            {unitText(last.value, unit)}
          </text>
        </svg>
        {shown ? (
          <div
            className={s.growthTooltip}
            style={{
              left: x(shown.t),
              top: y(shown.value),
              transform: `translate(${shownAt < 0.2 ? -15 : shownAt > 0.8 ? -85 : -50}%, calc(-100% - 12px))`,
            }}
          >
            <strong>{unitText(shown.value, unit)}</strong>
            <span>
              {shown.date.replaceAll("-", ".")}
              {profile?.birthday && age(profile.birthday, shown.date)
                ? ` · ${age(profile.birthday, shown.date)}`
                : ""}
            </span>
          </div>
        ) : null}
      </div>
    </figure>
  );
}

// The table view twin of the growth charts; newest measurements first.
export function GrowthTable({
  items,
  open = false,
  actions,
}: {
  items: Measurement[];
  open?: boolean;
  actions?: (m: Measurement) => ReactNode;
}) {
  const profile = useContext(ProfileContext);
  const table = (
    <div className={s.tableScroll}>
      <table className={s.growthTable}>
        <thead>
          <tr>
            <th>日期</th>
            <th>年龄</th>
            <th>体重</th>
            <th>肩高</th>
            {actions ? (
              <>
                <th>备注</th>
                <th aria-label="操作" />
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {[...items].reverse().map((m) => (
            <tr key={m.measuredOn}>
              <td>{m.measuredOn.replaceAll("-", ".")}</td>
              <td>
                {(profile?.birthday && age(profile.birthday, m.measuredOn)) ||
                  "—"}
              </td>
              <td>{m.weight === null ? "—" : unitText(m.weight, "kg")}</td>
              <td>{m.height === null ? "—" : unitText(m.height, "cm")}</td>
              {actions ? (
                <>
                  <td>{m.note || "—"}</td>
                  <td>{actions(m)}</td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return open ? (
    table
  ) : (
    <details className={s.growthDetails}>
      <summary>查看全部 {items.length} 次记录</summary>
      {table}
    </details>
  );
}

export function EntryCard({ entry, note }: { entry: Entry; note?: string }) {
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
        {note ? <span className={s.cardNote}>{note}</span> : null}
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

type View = { scale: number; x: number; y: number };
const unzoomed: View = { scale: 1, x: 0, y: 0 };

// Viewer gestures: swipe to change photos, pinch or double tap to zoom, and
// drag to look around a zoomed photo. Works for touch, pen and mouse.
function ZoomableImage({
  src,
  alt,
  onSwipe,
}: {
  src: string;
  alt: string;
  onSwipe: (step: 1 | -1) => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    x: number;
    y: number;
    view: View;
    distance: number;
    moved: boolean;
  } | null>(null);
  const lastTap = useRef(0);
  const [view, setView] = useState(unzoomed),
    [active, setActive] = useState(false);
  // Keep a zoomed photo from being dragged out of its frame.
  const bounded = (v: View): View => {
    const el = image.current;
    if (!el || v.scale <= 1) return unzoomed;
    const maxX = (el.offsetWidth * (v.scale - 1)) / 2,
      maxY = (el.offsetHeight * (v.scale - 1)) / 2;
    return {
      scale: v.scale,
      x: Math.max(-maxX, Math.min(maxX, v.x)),
      y: Math.max(-maxY, Math.min(maxY, v.y)),
    };
  };
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const begin = (x: number, y: number, moved: boolean) => {
    gesture.current = {
      x,
      y,
      view,
      distance: pointers.current.size === 2 ? spread() : 0,
      moved,
    };
  };
  return (
    <div className={s.zoomFrame}>
      <img
        ref={image}
        src={src}
        alt={alt}
        draggable={false}
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transition: active ? "none" : "transform 0.2s ease-out",
          cursor: view.scale > 1 ? "grab" : "zoom-in",
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          begin(e.clientX, e.clientY, pointers.current.size > 1);
          setActive(true);
        }}
        onPointerMove={(e) => {
          const start = gesture.current;
          if (!start || !pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2 && start.distance) {
            const scale = (start.view.scale * spread()) / start.distance;
            setView(
              bounded({
                ...start.view,
                scale: Math.min(4, Math.max(1, scale)),
              }),
            );
          } else if (pointers.current.size === 1) {
            const dx = e.clientX - start.x,
              dy = e.clientY - start.y;
            if (Math.hypot(dx, dy) > 8) start.moved = true;
            if (start.view.scale > 1)
              setView(
                bounded({
                  ...start.view,
                  x: start.view.x + dx,
                  y: start.view.y + dy,
                }),
              );
          }
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          const start = gesture.current;
          if (!start) return;
          if (pointers.current.size === 1) {
            // One finger left a pinch: keep panning from the other one.
            const [rest] = [...pointers.current.values()];
            begin(rest.x, rest.y, true);
            return;
          }
          gesture.current = null;
          setActive(false);
          const dx = e.clientX - start.x,
            dy = e.clientY - start.y;
          if (start.moved) {
            if (
              start.view.scale === 1 &&
              view.scale === 1 &&
              Math.abs(dx) > 60 &&
              Math.abs(dx) > Math.abs(dy) * 1.5
            )
              onSwipe(dx < 0 ? 1 : -1);
            return;
          }
          if (Date.now() - lastTap.current > 300) {
            lastTap.current = Date.now();
            return;
          }
          // Double tap: zoom in around the tapped point, or back out.
          lastTap.current = 0;
          if (view.scale > 1) return setView(unzoomed);
          const box = e.currentTarget.getBoundingClientRect(),
            scale = 2.5;
          setView(
            bounded({
              scale,
              x: (box.left + box.width / 2 - e.clientX) * (scale - 1),
              y: (box.top + box.height / 2 - e.clientY) * (scale - 1),
            }),
          );
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          if (!pointers.current.size) {
            gesture.current = null;
            setActive(false);
          }
        }}
      />
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
          <ZoomableImage
            key={m.id}
            src={fresh.url}
            alt={m.caption || m.name}
            onSwipe={(step) =>
              setIndex((n) => (n + step + items.length) % items.length)
            }
          />
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
