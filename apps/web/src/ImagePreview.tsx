import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Image } from "antd";
import { api, type Media } from "./lib";
import s from "./App.module.css";

export default function ImagePreview({
  items,
  start,
  onClose,
}: {
  items: Media[];
  start: number;
  onClose: () => void;
}) {
  const images = items.filter((item) => item.kind === "image");
  const initial = Math.max(
    0,
    images.findIndex((item) => item.id === items[start].id),
  );
  const [current, setCurrent] = useState(initial);
  const [fresh, setFresh] = useState(images);
  useEffect(() => {
    let alive = true;
    setFresh(images);
    Promise.all(
      images.map((item) =>
        api<Media>(`/media/${item.id}/access`).catch(() => item),
      ),
    ).then((next) => {
      if (alive) setFresh(next);
    });
    return () => {
      alive = false;
    };
  }, [items]);
  return (
    <Image.PreviewGroup
      items={fresh.map((item) => ({
        src: item.url,
        alt: item.caption || item.name,
      }))}
      classNames={{ popup: { root: s.imagePreview } }}
      preview={{
        open: true,
        current,
        minScale: 0.2,
        maxScale: 20,
        scaleStep: 0.25,
        movable: true,
        mask: { blur: false, closable: true },
        onChange: setCurrent,
        onOpenChange: (open) => {
          if (!open) onClose();
        },
        countRender: (shown, total) => {
          const item = images[shown - 1];
          return (
            <span className={s.imagePreviewCaption}>
              {item?.caption || item?.name}
              <small>
                {shown} / {total}
              </small>
            </span>
          );
        },
        actionsRender: (toolbar, info) => {
          const item = images[info.current];
          return (
            <div className={s.imagePreviewActions}>
              {toolbar}
              <button type="button" onClick={info.actions.onReset}>
                复位
              </button>
              {item?.entryId && (
                <Link to={`/stories/${item.entryId}`} onClick={onClose}>
                  回到原故事 ↗
                </Link>
              )}
            </div>
          );
        },
      }}
    />
  );
}
