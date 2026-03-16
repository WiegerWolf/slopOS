import React from "react";

type Tone = "primary" | "secondary" | "accent" | "muted";

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

export function Button(props: {
  children: React.ReactNode;
  onClick?: () => void | Promise<void>;
  tone?: "primary" | "secondary";
}) {
  return (
    <button
      style={props.tone === "secondary" ? s.btnSec : s.btn}
      onClick={props.onClick}
      type="button"
    >
      {props.children}
    </button>
  );
}

export function Text(props: { children: React.ReactNode; tone?: Tone }) {
  return <p style={{ ...s.text, ...(props.tone ? tones[props.tone] : {}) }}>{props.children}</p>;
}

export function Badge(props: { children: React.ReactNode; tone?: Tone }) {
  return <span style={{ ...s.badge, ...(props.tone ? badgeTones[props.tone] : badgeTones.primary) }}>{props.children}</span>;
}

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

export function Toast(props: { children: React.ReactNode; tone?: Tone; onDismiss?: () => void }) {
  return (
    <div className="toast">
      <span>{props.children}</span>
      {props.onDismiss ? <button className="toast-dismiss" onClick={props.onDismiss}>x</button> : null}
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
