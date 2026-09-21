import { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
import { X, Send, Plus, Trash2, History, ArrowLeft } from "lucide-react";
import {
  api,
  json,
  type AiStatus,
  type AiChatMessage,
  type AiConversation,
  type AiSource,
} from "./lib";
import s from "./App.module.css";
import { BoboIllustration } from "./shared";

// The open conversation survives navigation between pages, and a reload in the
// same tab, without ever leaving this browser.
const KEY = "bobo:chat";
const remember = (id: string) => {
  try {
    sessionStorage.setItem(KEY, id);
  } catch {
    // Private windows and blocked site data simply lose the thread.
  }
};
const remembered = () => {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
};

function Source({ item }: { item: AiSource }) {
  return (
    <Link
      className={s.chatSource}
      to={item.public ? `/stories/${item.id}` : `/admin/entries/${item.id}`}
    >
      <span>{item.title || "没有名字的一天"}</span>
      <small>
        {item.occurredOn}
        {item.public ? "" : " · 不公开"}
      </small>
    </Link>
  );
}

export default function Chat({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [list, setList] = useState<AiConversation[]>([]);
  const [id, setId] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showList, setShowList] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [state, conversations] = await Promise.all([
          api<AiStatus>("/admin/ai/status"),
          api<AiConversation[]>("/admin/ai/conversations"),
        ]);
        setStatus(state);
        setList(conversations);
        const saved = remembered();
        const open = conversations.find((c) => c.id === saved);
        if (open) await load(open.id);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  async function load(next: string) {
    setError("");
    try {
      const data = await api<{ messages: AiChatMessage[] }>(
        `/admin/ai/conversations/${next}`,
      );
      setId(next);
      remember(next);
      setMessages(data.messages);
      setShowList(false);
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function start() {
    setError("");
    try {
      const created = await api<AiConversation>(
        "/admin/ai/conversations",
        json("POST"),
      );
      setList((l) => [created, ...l]);
      setId(created.id);
      remember(created.id);
      setMessages([]);
      setShowList(false);
      input.current?.focus();
      return created.id;
    } catch (e: any) {
      setError(e.message);
      return "";
    }
  }
  async function send() {
    const question = text.trim();
    if (!question || busy) return;
    const target = id || (await start());
    if (!target) return;
    setBusy(true);
    setError("");
    setText("");
    const asked: AiChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: question,
      sources: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, asked]);
    try {
      const reply = await api<AiChatMessage>(
        `/admin/ai/conversations/${target}/messages`,
        json("POST", { text: question }),
      );
      setMessages((m) => [...m, reply]);
      setStatus((v) =>
        v ? { ...v, chatRemaining: Math.max(0, v.chatRemaining - 1) } : v,
      );
      setList((l) =>
        l.map((c) =>
          c.id === target && c.title === "新的聊天"
            ? { ...c, title: question.slice(0, 20) }
            : c,
        ),
      );
    } catch (e: any) {
      // Keep the question so it can be sent again without retyping.
      setMessages((m) => m.filter((x) => x.id !== asked.id));
      setText(question);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function consent() {
    try {
      setStatus(await api<AiStatus>("/admin/ai/consent", json("PUT")));
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function remove(target: string) {
    try {
      await api(`/admin/ai/conversations/${target}`, json("DELETE"));
      setList((l) => l.filter((c) => c.id !== target));
      if (target === id) {
        setId("");
        setMessages([]);
      }
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function clearAll() {
    try {
      await api("/admin/ai/conversations", json("DELETE"));
      setList([]);
      setId("");
      setMessages([]);
      setShowList(false);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <section className={s.chatPanel} aria-label="和啵啵聊天">
      <header className={s.chatHead}>
        {showList ? (
          <button
            className={s.chatIcon}
            onClick={() => setShowList(false)}
            aria-label="返回聊天"
          >
            <ArrowLeft size={18} />
          </button>
        ) : (
          <span className={s.chatAvatar}>
            <BoboIllustration />
          </span>
        )}
        <div className={s.chatTitle}>
          <strong>{showList ? "聊过的话题" : "啵啵"}</strong>
          <small>
            {status && !status.enabled
              ? "还没有配置 AI 服务"
              : busy
                ? "正在翻记忆…"
                : status
                  ? `今天还能聊 ${status.chatRemaining} 句`
                  : "正在醒来…"}
          </small>
        </div>
        {!showList && (
          <>
            <button
              className={s.chatIcon}
              onClick={() => setShowList(true)}
              aria-label="聊天记录"
            >
              <History size={18} />
            </button>
            <button
              className={s.chatIcon}
              onClick={start}
              aria-label="新的聊天"
            >
              <Plus size={18} />
            </button>
          </>
        )}
        <button className={s.chatIcon} onClick={onClose} aria-label="收起聊天">
          <X size={18} />
        </button>
      </header>
      {showList ? (
        <div className={s.chatBody}>
          {list.length ? (
            <>
              {list.map((c) => (
                <div className={s.chatItem} key={c.id}>
                  <button onClick={() => load(c.id)}>
                    <span>{c.title}</span>
                    <small>{c.updatedAt.slice(0, 10)}</small>
                  </button>
                  <button
                    className={s.chatIcon}
                    onClick={() => remove(c.id)}
                    aria-label={`删除 ${c.title}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <button className={s.chatClear} onClick={clearAll}>
                清空全部聊天记录
              </button>
            </>
          ) : (
            <p className={s.chatEmpty}>还没有聊过天呢。</p>
          )}
        </div>
      ) : (
        <div className={s.chatBody}>
          {status && !status.enabled ? (
            <p className={s.chatEmpty}>
              还没有配置 AI 服务，请家庭管理员在服务器的 .env 里填写
              DEEPSEEK_API_KEY。
            </p>
          ) : status && !status.consented ? (
            <div className={s.chatNotice}>
              <p>
                和我聊天时，我会去翻家里的手账：相关故事的片段、成长和健康记录会发送给
                DeepSeek 来组织回答，不会发送账号、密码和整个数据库。
              </p>
              <button className={s.chatPrimary} onClick={consent}>
                我知道了，开始聊天
              </button>
            </div>
          ) : (
            <>
              {!messages.length && (
                <p className={s.chatEmpty}>
                  汪！问我点什么吧，比如「我上次剪毛是什么时候」「我最近胖了吗」。
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={m.role === "user" ? s.chatMine : s.chatTheirs}
                >
                  <p>{m.content}</p>
                  {m.sources?.length ? (
                    <div className={s.chatSources}>
                      <small>翻过这些记录：</small>
                      {m.sources.map((x) => (
                        <Source key={x.id} item={x} />
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {busy && (
                <div className={s.chatTheirs}>
                  <p className={s.chatTyping}>啵啵正在翻记忆…</p>
                </div>
              )}
            </>
          )}
          {error ? <p className={s.chatError}>{error}</p> : null}
          <div ref={bottom} />
        </div>
      )}
      {!showList && status?.enabled && status.consented ? (
        <form
          className={s.chatInput}
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            ref={input}
            value={text}
            rows={1}
            maxLength={1000}
            placeholder="问问啵啵…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button disabled={busy || !text.trim()} aria-label="发送">
            <Send size={17} />
          </button>
        </form>
      ) : null}
    </section>
  );
}
