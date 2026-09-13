import { useState } from "react";
import type { FilterCatalog, PonyFilter } from "../shared/filters";
export function FilterSelector({
  catalog,
  selected,
  strictSafe,
  onSelect,
}: {
  catalog: FilterCatalog;
  selected: number;
  strictSafe: boolean;
  onSelect: (id: number) => void;
}) {
  const [confirm, setConfirm] = useState<PonyFilter | null>(null);
  return (
    <div className="filter-list">
      <p>
        {strictSafe
          ? "真实 Derpibooru 规则 + 严格 Safe 内容保护。"
          : "当前仅按真实 Derpibooru Filter 规则展示。"}
        隐藏规则由上游搜索执行；Spoiler 内容需要点击显示。
      </p>
      <small>
        每 6 小时更新 ·{" "}
        {catalog.source === "stale"
          ? "正在使用最近缓存"
          : catalog.source === "fallback"
            ? "安全回退模式"
            : "已同步系统过滤器"}
      </small>
      {catalog.filters.map((f) => (
        <article
          className={`filter-option ${f.id === selected ? "selected" : ""}`}
          key={f.id}
        >
          <button
            className="filter-choice"
            onClick={() =>
              f.id !== selected &&
              (f.id !== catalog.defaultId && f.id !== 0
                ? setConfirm(f)
                : onSelect(f.id))
            }
          >
            <strong>
              {f.id === selected ? "●" : "○"} {f.name}
            </strong>
            <span>{f.description}</span>
            <small>
              Hidden {f.hidden_tag_ids.length} tags · Spoilered{" "}
              {f.spoilered_tag_ids.length} tags
            </small>
          </button>
          {(f.hidden_complex || f.spoilered_complex) && (
            <details onClick={(e) => e.stopPropagation()}>
              <summary>复杂规则</summary>
              <pre>
                {f.hidden_complex && `Hidden\n${f.hidden_complex}\n`}
                {f.spoilered_complex && `Spoiler\n${f.spoilered_complex}`}
              </pre>
            </details>
          )}
        </article>
      ))}
      {confirm && (
        <div
          role="alertdialog"
          aria-label="确认过滤器"
          className="filter-confirm"
        >
          <h3>切换到 {confirm.name}？</h3>
          <p>
            此过滤器可能显示成人、暴力或其他敏感内容。
            {strictSafe
              ? "严格 Safe 内容保护仍会额外生效。"
              : "当前严格 Safe 内容保护已关闭。"}
            你确定要继续吗？
          </p>
          <button onClick={() => setConfirm(null)}>返回</button>
          <button
            className="roll"
            onClick={() => {
              onSelect(confirm.id);
              setConfirm(null);
            }}
          >
            我了解，继续
          </button>
        </div>
      )}
    </div>
  );
}
