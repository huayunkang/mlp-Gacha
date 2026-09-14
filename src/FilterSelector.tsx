import { useState } from "react";
import type { FilterCatalog, PonyFilter } from "../shared/filters";
export function FilterSelector({
  catalog,
  selected,
  onSelect,
}: {
  catalog: FilterCatalog;
  selected: number;
  onSelect: (id: number) => void;
}) {
  const [confirm, setConfirm] = useState<PonyFilter | null>(null);
  return (
    <div className="filter-list">
      <p>
        Derpibooru Filter 用于隐藏标签、剧透和个人偏好。Pony Roulette
        的内容等级始终优先，Filter 不能放宽它。
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
            此过滤器可能显示成人、暴力或其他敏感内容。 Pony Roulette
            当前选择的性内容和图形内容等级仍会强制生效。 你确定要继续吗？
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
