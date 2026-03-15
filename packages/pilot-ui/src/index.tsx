import React from "react";

function cn(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

type Tone = "primary" | "secondary" | "accent" | "muted";

export function Screen(props: { children: React.ReactNode }) {
  return <div style={styles.screen}>{props.children}</div>;
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
    <div className={props.className} style={{ display: "flex", flexDirection: "row", gap: props.gap ?? 12 }}>
      {props.children}
    </div>
  );
}

export function Card(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={styles.card}>
      <div style={styles.cardHead}>
        <h2 style={styles.cardTitle}>{props.title}</h2>
        {props.subtitle ? <p style={styles.cardSubtitle}>{props.subtitle}</p> : null}
      </div>
      <div style={styles.cardBody}>{props.children}</div>
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
      style={{
        ...styles.button,
        ...(props.tone === "secondary" ? styles.buttonSecondary : styles.buttonPrimary)
      }}
      onClick={props.onClick}
      type="button"
    >
      {props.children}
    </button>
  );
}

export function Text(props: { children: React.ReactNode; tone?: Tone }) {
  return <p style={{ ...styles.text, ...(props.tone ? textToneStyles[props.tone] : {}) }}>{props.children}</p>;
}

export function Badge(props: { children: React.ReactNode; tone?: Tone }) {
  return <span style={{ ...styles.badge, ...(props.tone ? badgeToneStyles[props.tone] : badgeToneStyles.primary) }}>{props.children}</span>;
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
    <div style={styles.promptShell}>
      <div style={styles.promptHeader}>
        <Badge tone="accent">slopOS</Badge>
        <Text tone="muted">{props.hint}</Text>
      </div>
      <input
        id={props.id}
        value={props.value}
        onChange={props.onChange}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            props.onSubmit();
          }
        }}
        style={styles.promptInput}
        placeholder="connect my bluetooth headset and open spotify"
      />
      <Text tone="muted">{props.statusText}</Text>
    </div>
  );
}

export function ChronicleItem(props: { title: string; line: string; status: string }) {
  const tone = props.status === "failed" || props.status === "denied"
    ? "secondary"
    : props.status === "pending"
      ? "muted"
      : "accent";

  return (
    <div style={styles.chronicleItem}>
      <div>
        <div style={styles.chronicleTitle}>{props.title}</div>
        <div style={styles.chronicleLine}>{props.line}</div>
      </div>
      <Badge tone={tone}>{props.status}</Badge>
    </div>
  );
}

export function Meter(props: { value: number; label?: string }) {
  return (
    <div style={styles.meterWrap} aria-label={props.label}>
      <div style={{ ...styles.meterBar, width: `${Math.max(6, Math.min(100, props.value))}%` }} />
    </div>
  );
}

export function FactGrid(props: { items: Array<{ label: string; value: string }> }) {
  if (!props.items.length) {
    return null;
  }

  return (
    <div style={styles.factGrid}>
      {props.items.map((fact) => (
        <div key={fact.label} style={styles.factCard}>
          <Text tone="muted">{fact.label}</Text>
          <Text>{fact.value}</Text>
        </div>
      ))}
    </div>
  );
}

export function SectionList(props: { sections: Array<{ title: string; lines: string[] }> }) {
  if (!props.sections.length) {
    return null;
  }

  return (
    <Column gap={12}>
      {props.sections.map((section) => (
        <div key={section.title} style={styles.sectionBlock}>
          <Text tone="accent">{section.title}</Text>
          {section.lines.map((line) => (
            <Text key={line} tone="muted">- {line}</Text>
          ))}
        </div>
      ))}
    </Column>
  );
}

export function Toast(props: { children: React.ReactNode; tone?: Tone; onDismiss?: () => void }) {
  return (
    <div style={{ ...styles.toast, ...(props.tone ? toastToneStyles[props.tone] : toastToneStyles.primary) }}>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{props.children}</span>
      {props.onDismiss ? (
        <button type="button" onClick={props.onDismiss} style={styles.toastDismiss}>
          dismiss
        </button>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: {
    minHeight: "100vh"
  },
  card: {
    width: "min(100%, 760px)",
    borderRadius: 28,
    background: "rgba(255, 251, 242, 0.72)",
    border: "1px solid rgba(60, 49, 34, 0.1)",
    boxShadow: "0 24px 80px rgba(86, 67, 34, 0.12)",
    backdropFilter: "blur(16px)",
    padding: 24
  },
  cardHead: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBottom: 18
  },
  cardTitle: {
    margin: 0,
    fontSize: 28,
    lineHeight: 1.1,
    fontWeight: 700,
    letterSpacing: "-0.03em"
  },
  cardSubtitle: {
    margin: 0,
    fontSize: 14,
    color: "#5f5647"
  },
  cardBody: {
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  button: {
    appearance: "none",
    border: 0,
    borderRadius: 999,
    padding: "12px 18px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    transition: "transform 140ms ease, opacity 140ms ease"
  },
  buttonPrimary: {
    background: "#234631",
    color: "#f7f3ea"
  },
  buttonSecondary: {
    background: "rgba(35, 70, 49, 0.08)",
    color: "#234631"
  },
  text: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.55
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "7px 10px",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.02em"
  },
  promptShell: {
    width: "min(100%, 760px)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    borderRadius: 32,
    padding: 24,
    background: "rgba(255, 249, 238, 0.78)",
    border: "1px solid rgba(36, 31, 23, 0.1)",
    boxShadow: "0 30px 90px rgba(75, 58, 28, 0.12)"
  },
  promptHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap"
  },
  promptInput: {
    width: "100%",
    border: "none",
    outline: "none",
    background: "rgba(255, 255, 255, 0.72)",
    borderRadius: 22,
    padding: "18px 20px",
    fontSize: 18,
    lineHeight: 1.3,
    color: "#241f17"
  },
  chronicleItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 18,
    padding: "12px 14px",
    background: "rgba(255, 251, 242, 0.55)",
    border: "1px solid rgba(36, 31, 23, 0.07)"
  },
  chronicleTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 2
  },
  chronicleLine: {
    fontSize: 13,
    color: "#5f5647"
  },
  meterWrap: {
    width: "100%",
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    background: "rgba(35, 70, 49, 0.1)"
  },
  meterBar: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #7c9f5c 0%, #234631 100%)"
  },
  factGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10
  },
  factCard: {
    padding: 12,
    borderRadius: 16,
    background: "rgba(35, 70, 49, 0.06)"
  },
  sectionBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  toast: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 16,
    backdropFilter: "blur(12px)",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)"
  },
  toastDismiss: {
    appearance: "none" as const,
    border: 0,
    background: "rgba(255, 255, 255, 0.15)",
    color: "inherit",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer"
  }
};

const toastToneStyles: Record<Tone, React.CSSProperties> = {
  primary: { background: "rgba(36, 31, 23, 0.92)", color: "#f7f3ea" },
  secondary: { background: "rgba(101, 60, 45, 0.92)", color: "#f7f3ea" },
  accent: { background: "rgba(117, 84, 23, 0.92)", color: "#f7f3ea" },
  muted: { background: "rgba(95, 86, 71, 0.88)", color: "#f7f3ea" }
};

const textToneStyles: Record<Tone, React.CSSProperties> = {
  primary: { color: "#241f17" },
  secondary: { color: "#234631" },
  accent: { color: "#755417" },
  muted: { color: "#5f5647" }
};

const badgeToneStyles: Record<Tone, React.CSSProperties> = {
  primary: { background: "rgba(36, 31, 23, 0.08)", color: "#241f17" },
  secondary: { background: "rgba(101, 60, 45, 0.12)", color: "#6b3b27" },
  accent: { background: "rgba(117, 84, 23, 0.13)", color: "#755417" },
  muted: { background: "rgba(95, 86, 71, 0.1)", color: "#5f5647" }
};
