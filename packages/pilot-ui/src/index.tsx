import React from "react";

type Tone = "primary" | "secondary" | "accent" | "muted";

// ---- Layout ----

export function Screen(props: { children: React.ReactNode }) {
  return <div>{props.children}</div>;
}

export function Column(props: { children: React.ReactNode; gap?: number; className?: string }) {
  return (
    <div className={props.className} style={{ display: "flex", flexDirection: "column", gap: props.gap ?? 12 }}>
      {props.children}
    </div>
  );
}

export function Row(props: { children: React.ReactNode; gap?: number; className?: string }) {
  return (
    <div className={props.className} style={{ display: "flex", flexDirection: "row", gap: props.gap ?? 12, flexWrap: "wrap", alignItems: "center" }}>
      {props.children}
    </div>
  );
}

export function Spacer() {
  return <div style={{ flex: "1 1 0" }} />;
}

// ---- Containers ----

export function Card(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={s.card}>
      <div style={s.cardHead}>
        <h2 style={s.cardTitle}>{props.title}</h2>
        {props.subtitle ? <p style={s.cardSub}>{props.subtitle}</p> : null}
      </div>
      {props.children}
    </section>
  );
}

export function Detail(props: { summary: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details style={s.detail} open={props.open}>
      <summary style={s.detailSummary}>{props.summary}</summary>
      <div style={s.detailBody}>{props.children}</div>
    </details>
  );
}

export function Tabs(props: { tabs: Array<{ label: string; content: React.ReactNode }> }) {
  const [active, setActive] = React.useState(0);
  if (!props.tabs.length) return null;
  return (
    <div>
      <div style={s.tabBar}>
        {props.tabs.map((tab, i) => (
          <button
            key={tab.label}
            type="button"
            style={i === active ? { ...s.tab, ...s.tabActive } : s.tab}
            onClick={() => setActive(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={s.tabContent}>{props.tabs[active]?.content}</div>
    </div>
  );
}

// ---- Actions ----

export function Button(props: {
  children: React.ReactNode;
  onClick?: () => void | Promise<void>;
  tone?: "primary" | "secondary";
  disabled?: boolean;
}) {
  return (
    <button
      style={{
        ...(props.tone === "secondary" ? s.btnSec : s.btn),
        ...(props.disabled ? { opacity: 0.5, pointerEvents: "none" as const } : {})
      }}
      onClick={props.onClick}
      type="button"
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}

export function Toggle(props: { checked: boolean; onChange: (next: boolean) => void; label?: string }) {
  return (
    <label style={s.toggleWrap}>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        style={props.checked ? { ...s.toggleTrack, ...s.toggleTrackOn } : s.toggleTrack}
        onClick={() => props.onChange(!props.checked)}
      >
        <span style={props.checked ? { ...s.toggleThumb, ...s.toggleThumbOn } : s.toggleThumb} />
      </button>
      {props.label ? <span style={{ fontSize: 13, color: "var(--text)" }}>{props.label}</span> : null}
    </label>
  );
}

export function Slider(props: { value: number; min?: number; max?: number; onChange: (v: number) => void; label?: string }) {
  const min = props.min ?? 0;
  const max = props.max ?? 100;
  return (
    <label style={s.sliderWrap}>
      {props.label ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{props.label}</span> : null}
      <input
        type="range"
        min={min}
        max={max}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        style={s.slider}
      />
      <span style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 28, textAlign: "right" }}>{props.value}</span>
    </label>
  );
}

export function Input(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  label?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {props.label ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{props.label}</span> : null}
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        style={s.input}
      />
    </label>
  );
}

export function Select(props: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  label?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {props.label ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{props.label}</span> : null}
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        style={s.select}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

// ---- Typography & status ----

export function Text(props: { children: React.ReactNode; tone?: Tone }) {
  return <p style={{ ...s.text, ...(props.tone ? tones[props.tone] : {}) }}>{props.children}</p>;
}

export function Badge(props: { children: React.ReactNode; tone?: Tone }) {
  return <span style={{ ...s.badge, ...(props.tone ? badgeTones[props.tone] : badgeTones.primary) }}>{props.children}</span>;
}

export function Dot(props: { tone?: "green" | "red" | "yellow" | "muted"; label?: string }) {
  const colors = { green: "var(--status-green)", red: "var(--status-red)", yellow: "var(--status-yellow)", muted: "var(--text-dim)" };
  const color = colors[props.tone ?? "muted"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {props.label ? <span style={{ color: "var(--text)" }}>{props.label}</span> : null}
    </span>
  );
}

export function CodeBlock(props: { children: string; title?: string }) {
  return (
    <div style={s.codeWrap}>
      {props.title ? <div style={s.codeTitle}>{props.title}</div> : null}
      <pre style={s.codePre}>{props.children}</pre>
    </div>
  );
}

// ---- Data display ----

export function Meter(props: { value: number; label?: string }) {
  return (
    <div style={s.meterWrap} aria-label={props.label}>
      <div style={{ ...s.meterBar, width: `${Math.max(4, Math.min(100, props.value))}%` }} />
      {props.label ? <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>{props.label}</span> : null}
    </div>
  );
}

export function FactGrid(props: { items: Array<{ label: string; value: string }> }) {
  if (!props.items.length) return null;
  return (
    <div style={s.factGrid}>
      {props.items.map((fact) => (
        <div key={fact.label} style={s.factCard}>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{fact.label}</div>
          <div style={{ fontSize: 13 }}>{fact.value}</div>
        </div>
      ))}
    </div>
  );
}

export function Table(props: {
  columns: Array<{ key: string; label: string; align?: "left" | "right" | "center" }>;
  rows: Array<Record<string, React.ReactNode>>;
}) {
  if (!props.rows.length) return null;
  return (
    <div style={s.tableWrap}>
      <table style={s.table}>
        <thead>
          <tr>
            {props.columns.map((col) => (
              <th key={col.key} style={{ ...s.th, textAlign: col.align ?? "left" }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, i) => (
            <tr key={i}>
              {props.columns.map((col) => (
                <td key={col.key} style={{ ...s.td, textAlign: col.align ?? "left" }}>{row[col.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function List(props: {
  items: Array<{
    label: string;
    value?: string;
    secondary?: string;
    right?: React.ReactNode;
  }>;
}) {
  if (!props.items.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {props.items.map((item, i) => (
        <div key={i} style={s.listItem}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "var(--text)" }}>{item.label}</div>
            {item.secondary ? <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{item.secondary}</div> : null}
          </div>
          {item.value ? <div style={{ fontSize: 13, color: "var(--text-muted)", flexShrink: 0 }}>{item.value}</div> : null}
          {item.right ?? null}
        </div>
      ))}
    </div>
  );
}

export function SectionList(props: { sections: Array<{ title: string; lines: string[] }> }) {
  if (!props.sections.length) return null;
  return (
    <Column gap={10}>
      {props.sections.map((sec) => (
        <div key={sec.title}>
          <Text tone="accent">{sec.title}</Text>
          {sec.lines.map((line) => (
            <Text key={line} tone="muted">{line}</Text>
          ))}
        </div>
      ))}
    </Column>
  );
}

// ---- Feedback ----

export function Toast(props: { children: React.ReactNode; tone?: Tone; onDismiss?: () => void }) {
  return (
    <div className="toast">
      <span>{props.children}</span>
      {props.onDismiss ? <button className="toast-dismiss" onClick={props.onDismiss}>x</button> : null}
    </div>
  );
}

export function Spinner(props: { label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
      <span style={s.spinner} />
      {props.label ?? null}
    </div>
  );
}

// ---- Legacy / internal ----

export function PromptBox(props: {
  id?: string;
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  onSubmit: () => void;
  statusText: string;
  hint: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      <input
        id={props.id}
        value={props.value}
        onChange={props.onChange}
        onKeyDown={(e) => { if (e.key === "Enter") props.onSubmit(); }}
        style={s.input}
        placeholder={props.hint}
      />
      <Text tone="muted">{props.statusText}</Text>
    </div>
  );
}

export function ChronicleItem(props: { title: string; line: string; status: string }) {
  return (
    <div style={s.chronicleItem}>
      <span style={{ fontSize: 12, fontWeight: 600 }}>{props.title}</span>
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{props.status}</span>
    </div>
  );
}

// ---- Styles ----

const s: Record<string, React.CSSProperties> = {
  card: {
    width: "min(100%, 800px)",
    borderRadius: 16,
    background: "var(--surface-solid)",
    border: "1px solid var(--border-subtle)",
    padding: 24
  },
  cardHead: {
    marginBottom: 16
  },
  cardTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    letterSpacing: "-0.02em",
    color: "var(--text-strong)"
  },
  cardSub: {
    margin: "4px 0 0",
    fontSize: 12,
    color: "var(--text-muted)"
  },
  detail: {
    borderRadius: 10,
    background: "var(--surface)",
    border: "1px solid var(--border-subtle)",
    overflow: "hidden"
  },
  detailSummary: {
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text)",
    cursor: "pointer",
    userSelect: "none" as const,
    listStyle: "none"
  },
  detailBody: {
    padding: "0 14px 12px",
    fontSize: 13
  },
  tabBar: {
    display: "flex",
    gap: 0,
    borderBottom: "1px solid var(--border-subtle)",
    marginBottom: 12
  },
  tab: {
    appearance: "none" as const,
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-muted)",
    cursor: "pointer",
    fontFamily: "inherit"
  },
  tabActive: {
    color: "var(--text)",
    borderBottomColor: "var(--accent)"
  },
  tabContent: {
    minHeight: 40
  },
  btn: {
    appearance: "none" as const,
    border: "1px solid var(--btn-border)",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    background: "var(--btn-bg)",
    color: "var(--text-strong)",
    fontFamily: "inherit"
  },
  btnSec: {
    appearance: "none" as const,
    border: "1px solid var(--border-subtle)",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    background: "var(--surface)",
    color: "var(--text-muted)",
    fontFamily: "inherit"
  },
  toggleWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer"
  },
  toggleTrack: {
    appearance: "none" as const,
    width: 36,
    height: 20,
    borderRadius: 10,
    background: "var(--surface-hover)",
    border: "1px solid var(--border)",
    padding: 2,
    cursor: "pointer",
    position: "relative" as const,
    transition: "background 150ms"
  },
  toggleTrackOn: {
    background: "var(--accent)",
    borderColor: "var(--accent)"
  },
  toggleThumb: {
    display: "block",
    width: 14,
    height: 14,
    borderRadius: "50%",
    background: "var(--text-dim)",
    transition: "transform 150ms, background 150ms"
  },
  toggleThumbOn: {
    transform: "translateX(16px)",
    background: "var(--toggle-thumb-on)"
  },
  sliderWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%"
  },
  slider: {
    flex: 1,
    height: 4,
    appearance: "none" as const,
    background: "var(--surface-hover)",
    borderRadius: 999,
    outline: "none",
    accentColor: "var(--accent)"
  },
  select: {
    appearance: "none" as const,
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
    fontFamily: "inherit",
    cursor: "pointer"
  },
  text: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--text)"
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 6,
    padding: "3px 8px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.01em"
  },
  codeWrap: {
    borderRadius: 10,
    background: "var(--surface)",
    border: "1px solid var(--border-subtle)",
    overflow: "hidden"
  },
  codeTitle: {
    padding: "8px 12px",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border-subtle)"
  },
  codePre: {
    margin: 0,
    padding: 12,
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text)",
    overflow: "auto",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const
  },
  tableWrap: {
    overflow: "auto",
    borderRadius: 10,
    border: "1px solid var(--border-subtle)"
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13
  },
  th: {
    padding: "8px 12px",
    fontWeight: 600,
    fontSize: 11,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border-subtle)",
    background: "var(--surface)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em"
  },
  td: {
    padding: "8px 12px",
    color: "var(--text)",
    borderBottom: "1px solid var(--border-subtle)"
  },
  listItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid var(--border-subtle)"
  },
  input: {
    width: "100%",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "12px 16px",
    fontSize: 14,
    background: "var(--surface)",
    color: "var(--text)",
    outline: "none",
    fontFamily: "inherit"
  },
  chronicleItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 12px",
    borderRadius: 10,
    background: "var(--surface)",
    border: "1px solid var(--border-subtle)"
  },
  meterWrap: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    background: "var(--surface-hover)"
  },
  meterBar: {
    height: "100%",
    borderRadius: 999,
    background: "var(--accent)"
  },
  factGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 8
  },
  factCard: {
    padding: 10,
    borderRadius: 10,
    background: "var(--surface)"
  },
  spinner: {
    display: "inline-block",
    width: 14,
    height: 14,
    border: "2px solid var(--border)",
    borderTopColor: "var(--accent)",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite"
  }
};

const tones: Record<Tone, React.CSSProperties> = {
  primary: { color: "var(--text)" },
  secondary: { color: "var(--error)" },
  accent: { color: "var(--text-muted)" },
  muted: { color: "var(--text-dim)" }
};

const badgeTones: Record<Tone, React.CSSProperties> = {
  primary: { background: "var(--surface-hover)", color: "var(--text)" },
  secondary: { background: "var(--surface-hover)", color: "var(--error)" },
  accent: { background: "var(--surface)", color: "var(--text-muted)" },
  muted: { background: "var(--surface)", color: "var(--text-dim)" }
};
