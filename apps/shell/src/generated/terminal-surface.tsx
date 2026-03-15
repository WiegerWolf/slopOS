import React from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { Badge, Button, Card, Column, Row, Text } from "@slopos/ui";
import { useArtifactState, useHost, type SurfaceProps } from "@slopos/host";

type PtyOpenResult = {
  ptyId: string;
  buffer: string;
  closed: boolean;
  exitCode: number | null;
};

export const surface = {
  id: "terminal-surface",
  title: "Terminal",
  version: "0.1.0",
  preferredPlacement: "center",
  defaultRetention: "pinned"
} as const;

export default function TerminalSurface(
  props: SurfaceProps<{ cwd?: string; command?: string; title?: string; ptyId?: string; restoredFromPersistence?: boolean }>
) {
  const host = useHost();
  const terminalRootRef = React.useRef<HTMLDivElement | null>(null);
  const terminalRef = React.useRef<Terminal | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);
  const ptyRef = React.useRef<string | null>(null);
  const skipCloseRef = React.useRef(false);
  const [ptyId, setPtyId] = useArtifactState<string | null>(null);
  const [buffer, setBuffer] = useArtifactState("");
  const [input, setInput] = useArtifactState("");
  const [closed, setClosed] = useArtifactState(false);

  React.useEffect(() => {
    if (!terminalRootRef.current || terminalRef.current) {
      return;
    }

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "IBM Plex Mono, monospace",
      fontSize: 13,
      lineHeight: 1.3,
      convertEol: true,
      theme: {
        background: "#181612",
        foreground: "#f5f0e6",
        cursor: "#f0c674",
        selectionBackground: "rgba(240, 198, 116, 0.24)"
      }
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRootRef.current);
    fitAddon.fit();

    terminalRef.current = term;
    fitRef.current = fitAddon;

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      term.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    ptyRef.current = ptyId;
  }, [ptyId]);

  React.useEffect(() => {
    const markUnload = () => {
      skipCloseRef.current = true;
    };

    window.addEventListener("beforeunload", markUnload);
    window.addEventListener("pagehide", markUnload);

    return () => {
      window.removeEventListener("beforeunload", markUnload);
      window.removeEventListener("pagehide", markUnload);
    };
  }, []);

  React.useEffect(() => {
    const term = terminalRef.current;
    if (!term) {
      return;
    }

    term.reset();
    term.write((buffer || "Terminal is starting...\n").replace(/\n/g, "\r\n"));
    term.scrollToBottom();
    fitRef.current?.fit();
  }, [buffer]);

  React.useEffect(() => {
    let disposed = false;

    async function boot() {
      const persistedPtyId = props.data?.ptyId;

      if (persistedPtyId) {
        try {
          const restored = await host.tool<PtyOpenResult>(
            "pty_snapshot",
            { ptyId: persistedPtyId },
            { runAs: "user", quiet: true }
          );

          if (!disposed) {
            setPtyId(restored.ptyId);
            setBuffer(restored.buffer);
            setClosed(restored.closed);
            host.updateArtifact({
              data: {
                ptyId: restored.ptyId,
                restoredFromPersistence: true
              }
            });
            host.logStatus(`Reattached PTY ${restored.ptyId.slice(0, 8)}`);
            return;
          }
        } catch {
          // Fall through to creating a fresh PTY.
        }
      }

      const result = await host.tool<PtyOpenResult>(
        "pty_open",
        {
          cwd: props.data?.cwd ?? "/home/n/slopos",
          command: props.data?.command
        },
        { runAs: "user" }
      );

      if (disposed) {
        return;
      }

      setPtyId(result.ptyId);
      setBuffer(result.buffer);
      setClosed(result.closed);
      host.updateArtifact({
        data: {
          ptyId: result.ptyId,
          cwd: props.data?.cwd ?? "/home/n/slopos",
          command: props.data?.command,
          title: props.data?.title,
          restoredFromPersistence: false
        }
      });
      host.logStatus(`Opened PTY ${result.ptyId.slice(0, 8)}`);
    }

    void boot();

    return () => {
      disposed = true;
      if (ptyRef.current && !skipCloseRef.current) {
        void host.tool("pty_close", { ptyId: ptyRef.current }, { runAs: "user", quiet: true }).catch(() => undefined);
      }
    };
  }, [host, props.data?.command, props.data?.cwd, setBuffer, setClosed, setPtyId]);

  React.useEffect(() => {
    if (!ptyId) {
      return;
    }

    const source = new EventSource(`/api/pty/stream?ptyId=${encodeURIComponent(ptyId)}`);

    const handleSnapshot = (event: MessageEvent<string>) => {
      const result = JSON.parse(event.data) as PtyOpenResult;
      setBuffer(result.buffer);
      setClosed(result.closed);
    };

    source.addEventListener("snapshot", handleSnapshot as EventListener);
    source.onerror = () => {
      source.close();
    };

    return () => {
      source.removeEventListener("snapshot", handleSnapshot as EventListener);
      source.close();
    };
  }, [host, ptyId, setBuffer, setClosed]);

  const submitInput = React.useCallback(async () => {
    if (!ptyId || !input.trim()) {
      return;
    }

    await host.tool("pty_write", { ptyId, input: `${input}\n` }, { runAs: "user" });
    setInput("");
  }, [host, input, ptyId, setInput]);

  const sendCtrlC = React.useCallback(async () => {
    if (!ptyId) {
      return;
    }

    await host.tool("pty_write", { ptyId, input: "\u0003" }, { runAs: "user" });
  }, [host, ptyId]);

  return (
    <Card title={props.data?.title ?? "Terminal"} subtitle="PTY-backed live shell session">
      <Column gap={14}>
        <Row gap={10}>
          <Badge tone="accent">live PTY</Badge>
          <Badge tone={closed ? "secondary" : "muted"}>{closed ? "closed" : "running"}</Badge>
          {props.data?.restoredFromPersistence ? <Badge tone="muted">restored</Badge> : null}
        </Row>
        <div
          ref={terminalRootRef}
          style={{
            minHeight: 260,
            maxHeight: 360,
            overflow: "hidden",
            borderRadius: 18,
            padding: 12,
            background: "#181612"
          }}
        />
        <Row gap={10}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void submitInput();
              }
            }}
            placeholder="type a shell command"
            style={{
              flex: 1,
              minWidth: 0,
              border: "1px solid rgba(36, 31, 23, 0.12)",
              borderRadius: 14,
              padding: "12px 14px",
              fontSize: 14,
              background: "rgba(255, 255, 255, 0.82)"
            }}
          />
          <Button onClick={() => void submitInput()}>Send</Button>
          <Button tone="secondary" onClick={() => void sendCtrlC()}>Ctrl+C</Button>
        </Row>
        <Text tone="muted">
          Working directory: {props.data?.cwd ?? "/home/n/slopos"}
        </Text>
      </Column>
    </Card>
  );
}
