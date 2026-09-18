import { useEffect, useContext } from "react";
import {
  Routes,
  Route,
  Link,
  NavLink,
  useParams,
  useSearchParams,
  useLocation,
} from "react-router";
import {
  PawPrint,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Camera,
  BookOpen,
  Heart,
  Plus,
  Search,
  Feather,
  Cake,
  House,
} from "lucide-react";
import {
  age,
  daysSince,
  anniversaries,
  coverOf,
  albumCover,
  type Memory,
  type Growth,
  type Entry,
  type Profile,
  type Listing,
  type Album,
  type Media,
} from "./lib";
import s from "./App.module.css";
import {
  ProfileContext,
  useData,
  Status,
  Empty,
  SectionTitle,
  EntryCard,
  PageHeader,
  MediaGrid,
  MediaImage,
  StoryView,
  BoboIllustration,
  GrowthChart,
  GrowthTable,
} from "./shared";
function Layout() {
  const { data: profile, error } = useData<Profile>("/profile");
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  useEffect(() => {
    if (profile) document.title = profile.siteName;
  }, [profile]);
  return (
    <ProfileContext.Provider value={profile}>
      <div className={s.site}>
        <header className={s.header}>
          <Link to="/" className={s.brand}>
            <span className={s.brandIcon}>
              <PawPrint size={25} />
            </span>
            <span>
              {profile?.siteName || "啵啵的小日子"}
              <small>BOBO'S LITTLE DAYS</small>
            </span>
          </Link>
          <nav className={s.nav}>
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? s.active : "")}
            >
              小日子
            </NavLink>
            <NavLink
              to="/timeline"
              className={({ isActive }) => (isActive ? s.active : "")}
            >
              成长手账
            </NavLink>
            <NavLink
              to="/albums"
              className={({ isActive }) => (isActive ? s.active : "")}
            >
              记忆相册
            </NavLink>
            <NavLink
              to="/about"
              className={({ isActive }) => (isActive ? s.active : "")}
            >
              关于啵啵
            </NavLink>
          </nav>
          <Link to="/admin" className={s.headerAction}>
            <Feather size={15} /> 记录一笔
          </Link>
        </header>
        <main>
          {error ? (
            <Status error={error} />
          ) : !profile ? (
            <Status loading />
          ) : (
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/timeline" element={<Timeline />} />
              <Route path="/stories/:id" element={<Story />} />
              <Route path="/albums" element={<Albums />} />
              <Route path="/albums/:id" element={<AlbumPage />} />
              <Route path="/about" element={<About />} />
              <Route
                path="*"
                element={
                  <Empty
                    title="这一页走丢了"
                    text="回到小日子，继续翻阅啵啵的故事吧。"
                  />
                }
              />
            </Routes>
          )}
        </main>
        <footer className={s.footer}>
          <PawPrint size={18} />
          <span>小小的爪印，大大的生活。</span>
          <small>用爱记录 · {profile?.siteName || "啵啵的小日子"}</small>
          <Link to="/admin">手账管理 ↗</Link>
        </footer>
      </div>
    </ProfileContext.Provider>
  );
}

function Home() {
  const p = useContext(ProfileContext)!;
  const recent = useData<Listing>("/entries?limit=3"),
    special = useData<Listing>("/entries?milestone=true&limit=3"),
    featured = useData<Listing>("/entries?featured=true&limit=6"),
    albums = useData<Album[]>("/albums"),
    memories = useData<{ items: Memory[] }>("/on-this-day");
  const albumCovers = (albums.data || [])
    .map(albumCover)
    .filter((m): m is Media => !!m)
    .slice(0, 3);
  const upcoming = anniversaries(p);
  return (
    <>
      <section className={s.hero}>
        <div className={s.heroCopy}>
          <div className={s.heroLabel}>
            <span /> 一只雪纳瑞的生活观察簿
          </div>
          <h1>
            世界很大，
            <br />
            我的<span>小日子</span>很可爱
            <svg viewBox="0 0 210 14" aria-hidden="true">
              <path
                d="M3 9Q102 -3 207 8M13 13Q119 3 192 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              />
            </svg>
          </h1>
          <p>
            你好呀，我是{p.name}。<br />
            {p.intro}
          </p>
          <div className={s.heroButtons}>
            <Link to="/timeline" className={s.primary}>
              翻开我的成长手账 <ArrowUpRight size={18} />
            </Link>
            <Link to="/about" className={s.textLink}>
              认识我 <ArrowRight size={16} />
            </Link>
          </div>
          <div className={s.heroNotes}>
            <span>
              <PawPrint size={15} /> {p.breed}
            </span>
            {p.birthday && <span>{age(p.birthday)}啦</span>}
            {p.homeDate && daysSince(p.homeDate) >= 0 && (
              <span>到家的第 {daysSince(p.homeDate) + 1} 天</span>
            )}
            <span>认真生活，慢慢长大</span>
          </div>
        </div>
        <div className={s.heroArt}>
          <span className={s.handNote}>
            最好的时光，都在这里{" "}
            <svg width="62" height="36" viewBox="0 0 62 36">
              <path
                d="M2 3Q8 37 56 24M46 15L58 24L47 32"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </span>
          <div className={s.polaroid}>
            <span className={s.tape} />
            <div className={s.heroPicture}>
              {p.cover ? (
                <MediaImage
                  media={p.cover}
                  variant="url"
                  alt={`${p.name}的封面照片`}
                />
              ) : (
                <BoboIllustration />
              )}
            </div>
            <div className={s.polaroidCaption}>
              和{p.name}一起，把普通日子过成纪念。
              <Heart size={19} />
            </div>
          </div>
          <span className={s.helloSticker}>
            hello!
            <br />
            <b>我是{p.name}</b>
            <PawPrint size={22} />
          </span>
          <span className={s.littleStar}>✳</span>
          <span className={s.memento}>
            <Heart size={15} /> 幸福有迹可循
          </span>
        </div>
      </section>
      <div className={s.chapterStrip}>
        <span>THE LITTLE THINGS ARE THE BIG THINGS</span>
        <PawPrint size={17} />
        <span>吃饭 · 散步 · 发呆 · 被爱</span>
        <PawPrint size={17} />
        <span>每个平凡的瞬间，都闪闪发光</span>
      </div>
      {upcoming.length ? (
        <section className={s.anniversaries}>
          <div>
            <span className={s.eyebrow}>DAYS WORTH CELEBRATING</span>
            <h2>{p.name}的纪念日</h2>
          </div>
          <div className={s.anniversaryList}>
            {upcoming.map((a) => (
              <article
                key={`${a.date}-${a.title}`}
                className={
                  a.daysLeft === 0
                    ? `${s.anniversary} ${s.anniversaryToday}`
                    : s.anniversary
                }
              >
                <span className={s.anniversaryIcon}>
                  {a.kind === "birthday" ? (
                    <Cake size={19} />
                  ) : (
                    <House size={19} />
                  )}
                </span>
                <div>
                  <h3>{a.title}</h3>
                  <small>{a.date.replaceAll("-", ".")}</small>
                </div>
                <p>
                  {a.daysLeft === 0 ? (
                    <b>就是今天</b>
                  ) : (
                    <>
                      还有<b>{a.daysLeft}</b>天
                    </>
                  )}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <section className={s.section}>
        <SectionTitle
          en="PAGES OF EVERYDAY"
          title="最近的小日子"
          to="/timeline"
          label="翻翻成长手账"
        />
        {recent.error ? (
          <Status error={recent.error} />
        ) : recent.data?.items.length ? (
          <div className={s.cardGrid}>
            {recent.data.items.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </div>
        ) : recent.data ? (
          <div className={s.firstPage}>
            <div className={s.notebookDoodle}>
              <BookOpen size={64} strokeWidth={1} />
              <span>page 01</span>
            </div>
            <div>
              <span className={s.eyebrow}>EVERY STORY STARTS SOMEWHERE</span>
              <h3>故事的第一页，留给啵啵。</h3>
              <p>
                一次散步、一顿好饭，或一个忍不住拍下来的瞬间。
                <br />
                不必特别，属于啵啵就值得记录。
              </p>
            </div>
            <Link
              to="/admin"
              className={s.roundButton}
              aria-label="写下第一篇记录"
            >
              <Plus />
            </Link>
          </div>
        ) : (
          <Status loading />
        )}
      </section>
      {memories.data?.items.length ? (
        <section className={s.section}>
          <SectionTitle en="ON THIS DAY" title="那年今日" />
          <div className={s.cardGrid}>
            {memories.data.items.map((e) => (
              <EntryCard
                key={e.id}
                entry={e}
                note={
                  e.yearsAgo
                    ? `${e.yearsAgo} 年前的今天`
                    : `${e.monthsAgo} 个月前的今天`
                }
              />
            ))}
          </div>
        </section>
      ) : null}
      <section className={s.memoriesSection}>
        <SectionTitle
          en="A LITTLE FIRST, A BIG MEMORY"
          title="那些值得记住的第一次"
          to="/timeline?milestone=true"
        />
        {special.data?.items.length ? (
          <div className={s.cardGrid}>
            {special.data.items.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </div>
        ) : special.error ? (
          <Status error={special.error} />
        ) : (
          <div className={s.milestoneEmpty}>
            <span className={s.dashedStamp}>
              <PawPrint size={29} />
              <small>FIRST TIMES</small>
            </span>
            <div>
              <h3>长大的每一小步，都算数。</h3>
              <p>把故事标记为「里程碑」，就能收藏在这里。</p>
            </div>
            <span className={s.script}>to be continued…</span>
          </div>
        )}
      </section>
      {featured.data?.items.length ? (
        <section className={s.section}>
          <SectionTitle en="KEPT CLOSE TO HEART" title="偏爱的这一页" />
          <div className={s.cardGrid}>
            {featured.data.items.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </div>
        </section>
      ) : null}
      <section className={s.albumBanner}>
        <div>
          <span className={s.eyebrow}>COLLECT MOMENTS, NOT THINGS</span>
          <h2>把喜欢的瞬间，装进相册。</h2>
          <p>一张照片，一段回忆，一起收藏生活的温度。</p>
          <Link to="/albums" className={s.textLink}>
            打开记忆相册 <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className={s.albumIllustration}>
          {albumCovers.length ? (
            albumCovers.map((m) => (
              <MediaImage key={m.id} media={m} alt={m.caption || m.name} />
            ))
          ) : (
            <BoboIllustration className={s.albumDoodle} />
          )}
          <span>
            {albums.data?.length
              ? `${albums.data.length} 本记忆相册`
              : "等待收藏的回忆"}
          </span>
          <PawPrint className={s.albumPaw} size={40} />
        </div>
      </section>
    </>
  );
}

function Timeline() {
  const [q, setQ] = useSearchParams();
  const { data, error } = useData<Listing>(`/entries?${q}`);
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(q);
    v ? n.set(k, v) : n.delete(k);
    n.delete("page");
    setQ(n);
  };
  let last = "";
  return (
    <section className={s.page}>
      <PageHeader
        en="THE GROWING JOURNAL"
        title="成长手账"
        text="从小小的爪印开始，一页一页，写成我们的故事。"
      />
      <div className={s.filters}>
        <div className={s.tabs}>
          {[
            ["", "全部日子"],
            ["daily", "日常碎片"],
            ["event", "特别事件"],
          ].map(([v, t]) => (
            <button
              key={t}
              className={(q.get("kind") || "") === v ? s.selected : ""}
              onClick={() => set("kind", v)}
            >
              {t}
            </button>
          ))}
        </div>
        <select
          aria-label="按年份筛选"
          value={q.get("year") || ""}
          onChange={(e) => set("year", e.target.value)}
        >
          <option value="">所有年份</option>
          {data?.years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        <select
          aria-label="按月份筛选"
          value={q.get("month") || ""}
          onChange={(e) => set("month", e.target.value)}
        >
          <option value="">所有月份</option>
          {Array.from({ length: 12 }, (_, i) => {
            const month = String(i + 1).padStart(2, "0");
            return (
              <option key={month} value={month}>
                {i + 1} 月
              </option>
            );
          })}
        </select>
        <select
          aria-label="按标签筛选"
          value={q.get("tag") || ""}
          onChange={(e) => set("tag", e.target.value)}
        >
          <option value="">所有标签</option>
          {data?.tags.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <form
          className={s.search}
          onSubmit={(e) => {
            e.preventDefault();
            set("q", String(new FormData(e.currentTarget).get("q") || ""));
          }}
        >
          <Search size={17} />
          <input
            name="q"
            aria-label="搜索故事"
            placeholder="找找某个小日子"
            defaultValue={q.get("q") || ""}
          />
          <button>搜索</button>
        </form>
      </div>
      <label className={s.checkLine}>
        <input
          type="checkbox"
          checked={q.get("milestone") === "true"}
          onChange={(e) => set("milestone", e.target.checked ? "true" : "")}
        />{" "}
        只看值得纪念的里程碑
      </label>
      {error ? (
        <Status error={error} />
      ) : !data ? (
        <Status loading />
      ) : data.items.length ? (
        <div className={s.timeline}>
          {data.items.map((e) => {
            const month = e.occurredOn.slice(0, 7);
            const label = last !== month;
            last = month;
            return (
              <div key={e.id}>
                {label && (
                  <h2 className={s.month}>
                    <PawPrint size={20} />
                    {month.replace("-", " 年 ")} 月
                  </h2>
                )}
                <article
                  className={`${s.timelineRow} ${e.milestone ? s.important : ""}`}
                >
                  <div className={s.day}>
                    {e.occurredOn.slice(8)}
                    <small>{e.kind === "event" ? "EVENT" : "DAILY"}</small>
                  </div>
                  <Link to={`/stories/${e.id}`} className={s.timelineContent}>
                    <div>
                      <span className={s.eyebrow}>
                        {e.milestone ? "✳ 一个成长里程碑" : "生活碎片"}
                      </span>
                      <h3>{e.title}</h3>
                      {e.author ? (
                        <small className={s.entryAuthor}>
                          由 {e.author.displayName} 记录
                        </small>
                      ) : null}
                      <p>{e.body.replace(/[#>*]/g, "").slice(0, 130)}</p>
                      <div className={s.tags}>
                        {e.tags.map((t) => (
                          <span key={t}>#{t}</span>
                        ))}
                      </div>
                    </div>
                    {coverOf(e) && (
                      <MediaImage
                        media={coverOf(e)}
                        alt={e.title}
                        loading="lazy"
                      />
                    )}
                    <ArrowUpRight size={19} />
                  </Link>
                </article>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty
          title="这一页，暂时还是空白"
          text={
            q.size ? "换个条件，再找找看。" : "第一份成长记忆，从今天开始。"
          }
          action={!q.size}
        />
      )}
      {data && data.total > 12 && (
        <div className={s.pagination}>
          <button
            disabled={data.page === 1}
            onClick={() => {
              const n = new URLSearchParams(q);
              n.set("page", String(data.page - 1));
              setQ(n);
            }}
          >
            上一页
          </button>
          <span>
            {data.page} / {Math.ceil(data.total / 12)}
          </span>
          <button
            disabled={data.page * 12 >= data.total}
            onClick={() => {
              const n = new URLSearchParams(q);
              n.set("page", String(data.page + 1));
              setQ(n);
            }}
          >
            下一页
          </button>
        </div>
      )}
    </section>
  );
}

function Story() {
  const { id } = useParams();
  const { data, error } = useData<Entry>(`/entries/${id}`);
  return (
    <section className={s.page}>
      <Link className={s.textLink} to="/timeline">
        <ArrowLeft size={16} /> 回到成长手账
      </Link>
      {error ? (
        <Status error={error} />
      ) : data ? (
        <StoryView entry={data} />
      ) : (
        <Status loading />
      )}
    </section>
  );
}

function Albums() {
  const { data, error } = useData<Album[]>("/albums");
  return (
    <section className={s.page}>
      <PageHeader
        en="A HOME FOR MEMORIES"
        title="记忆相册"
        text="照片会替我们记得，那些被爱包围的小瞬间。"
      />
      {error ? (
        <Status error={error} />
      ) : !data ? (
        <Status loading />
      ) : data.length ? (
        <div className={s.cardGrid}>
          {data.map((a) => {
            const cover = albumCover(a);
            return (
              <Link to={`/albums/${a.id}`} className={s.albumCard} key={a.id}>
                <div>
                  {cover ? (
                    <MediaImage media={cover} alt={a.title} />
                  ) : (
                    <Camera size={48} />
                  )}
                </div>
                <h3>{a.title}</h3>
                <p>
                  {a.items.length} 个瞬间 ·{" "}
                  {a.description || "慢慢收藏，常常想念"}
                </p>
              </Link>
            );
          })}
        </div>
      ) : (
        <Empty
          title="还没有装订好的相册"
          text="在管理后台，把喜欢的瞬间整理成一本相册吧。"
          action
        />
      )}
    </section>
  );
}

function AlbumPage() {
  const { id } = useParams();
  const { data, error } = useData<Album>(`/albums/${id}`);
  return (
    <section className={s.page}>
      <Link to="/albums" className={s.textLink}>
        <ArrowLeft size={16} /> 全部相册
      </Link>
      {error ? (
        <Status error={error} />
      ) : !data ? (
        <Status loading />
      ) : (
        <>
          <PageHeader
            en="COLLECTED WITH LOVE"
            title={data.title}
            text={data.description || `${data.items.length} 个被收藏的瞬间`}
          />
          {data.items.length ? (
            <MediaGrid items={data.items} />
          ) : (
            <Empty text="这里还没有公开的照片和视频。" />
          )}
        </>
      )}
    </section>
  );
}

function About() {
  const p = useContext(ProfileContext)!;
  const growth = useData<Growth>("/growth");
  return (
    <section className={s.page}>
      <PageHeader
        en="MEET THE LITTLE ONE"
        title={`你好，我是${p.name}`}
        text="这个小小世界的主角，很高兴认识你。"
      />
      <div className={s.about}>
        <div className={s.aboutPortrait}>
          {p.aboutCover ? (
            <MediaImage media={p.aboutCover} variant="url" alt={p.name} />
          ) : (
            <BoboIllustration />
          )}
        </div>
        <div>
          <span className={s.eyebrow}>A VERY GOOD DOG</span>
          <h2>{p.name}的自我介绍</h2>
          <p className={s.intro}>{p.intro}</p>
          <dl>
            <dt>我的品种</dt>
            <dd>{p.breed}</dd>
            {p.birthday && (
              <>
                <dt>我的生日</dt>
                <dd>
                  {p.birthday} · {age(p.birthday)}
                </dd>
              </>
            )}
            {p.homeDate && (
              <>
                <dt>来到家里</dt>
                <dd>{p.homeDate}</dd>
              </>
            )}
            {p.personality && (
              <>
                <dt>我的性格</dt>
                <dd>{p.personality}</dd>
              </>
            )}
            {p.hobbies && (
              <>
                <dt>喜欢的事情</dt>
                <dd>{p.hobbies}</dd>
              </>
            )}
          </dl>
          <div className={s.aboutNote}>
            <Heart size={22} />
            <p>
              平凡的每一天，
              <br />
              因为有你，都变得特别。
            </p>
          </div>
        </div>
      </div>
      {growth.data?.items.length ? (
        <div className={s.growthSection}>
          <SectionTitle en="GROWING UP" title={`${p.name}的成长曲线`} />
          <div className={s.growthCharts}>
            <GrowthChart
              items={growth.data.items}
              metric="weight"
              title="体重"
              unit="kg"
            />
            <GrowthChart
              items={growth.data.items}
              metric="height"
              title="肩高"
              unit="cm"
            />
          </div>
          <GrowthTable items={growth.data.items} />
        </div>
      ) : null}
    </section>
  );
}
export default Layout;
