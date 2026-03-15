import React, { type ChangeEvent } from "react";
import { RuntimeProvider, SurfaceBoundary, useRuntime, type ActionLogEntry, type ConfirmationRecord } from "./runtime";
import type { Artifact } from "@slopos/runtime";
import { Badge, Button, Card, ChronicleItem, Column, PromptBox, Row, Screen, Text, Toast } from "@slopos/ui";
import BrowserArtifact from "./browser-artifact";
import { surfaceRegistry } from "./surface-registry";
import { useNotifications, type Notification } from "./notifications";

function ShellCanvas() {
  const {
    artifacts,
    chronicle,
    statusText,
    submitIntent,
    agentTurn,
    actionLog,
    confirmationHistory,
    pendingConfirmation,
    protocolIssue,
    clearProtocolIssue,
    respondToConfirmation
  } = useRuntime();
  const [command, setCommand] = React.useState("");
  const { notifications, dismiss } = useNotifications();

  const activeArtifact = artifacts.find((artifact) => artifact.visible);

  const runIntent = React.useCallback(async () => {
    if (!command.trim()) {
      return;
    }
    await submitIntent(command.trim());
    setCommand("");
  }, [command, submitIntent]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "`") {
        event.preventDefault();
        const input = document.getElementById("slopos-command-input") as HTMLInputElement | null;
        input?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Screen>
      <Column gap={20} className="shell-root">
        <div className="chronicle-rail">
          {chronicle.map((entry) => (
            <ChronicleItem
              key={entry.id}
              title={entry.title}
              line={entry.oneLine}
              status={entry.status}
            />
          ))}
          {confirmationHistory.slice(0, 3).map((entry) => (
            <ConfirmationChronicleItem key={entry.id} entry={entry} />
          ))}
        </div>

        <div className="prompt-stage">
          <PromptBox
            id="slopos-command-input"
            value={command}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setCommand(event.target.value)}
            onSubmit={runIntent}
            statusText={statusText}
            hint="Type a command, hit Enter, or wake the shell with `"
          />
          <Row gap={10} className="prompt-actions">
            <Button onClick={() => void runIntent()}>Invoke</Button>
            <Button tone="secondary" onClick={() => void submitIntent("connect my bluetooth headset")}>Bluetooth Demo</Button>
            <Button tone="secondary" onClick={() => void submitIntent("set up my coding workspace")}>Workspace Demo</Button>
            <Button tone="secondary" onClick={() => void submitIntent("open vite docs in a browser pane")}>Browser Demo</Button>
            <Button tone="secondary" onClick={() => void submitIntent("summarize browser session")}>Browser Inspector Demo</Button>
            <Button tone="secondary" onClick={() => void submitIntent("inspect slopos session")}>Session Demo</Button>
            <Button tone="secondary" onClick={() => void submitIntent("inspect slopos runtime")}>Diagnostics Demo</Button>
            <Button tone="secondary" onClick={() => void submitIntent("open a shell terminal")}>Terminal Demo</Button>
            <Button tone="secondary" onClick={() => void submitIntent("build me a music workspace for spotify")}>Runtime TSX Demo</Button>
          </Row>
        </div>

        <div className="shell-body">
          <div className="canvas-zone">
            {activeArtifact ? <ArtifactSurface artifact={activeArtifact} /> : <IdleState agentTurnPreview={agentTurn?.statusText} />}
            {pendingConfirmation ? (
              <ConfirmationOverlay
                title={pendingConfirmation.title}
                message={pendingConfirmation.message}
                actionLabel={pendingConfirmation.actionLabel}
                cancelLabel={pendingConfirmation.cancelLabel}
                onApprove={() => respondToConfirmation(true)}
                onDeny={() => respondToConfirmation(false)}
              />
            ) : null}
            {protocolIssue ? (
              <CompatibilityOverlay
                message={protocolIssue.message}
                expectedProtocolVersion={protocolIssue.expectedProtocolVersion}
                receivedProtocolVersion={protocolIssue.receivedProtocolVersion}
                onDismiss={clearProtocolIssue}
              />
            ) : null}
          </div>
          <InspectorPanel actionLog={actionLog} />
        </div>
      </Column>
      {notifications.length > 0 ? (
        <div style={{ position: "fixed", bottom: 20, right: 20, display: "flex", flexDirection: "column", gap: 8, zIndex: 9000 }}>
          {notifications.map((n) => (
            <Toast key={n.id} tone={n.kind === "disconnected" ? "secondary" : "accent"} onDismiss={() => dismiss(n.id)}>
              {n.summary}
            </Toast>
          ))}
        </div>
      ) : null}
    </Screen>
  );
}

const dynamicSurfaceCache: Record<string, React.LazyExoticComponent<React.ComponentType<{ data?: Record<string, unknown>; taskId: string; artifactId: string }>>> = {};

function getDynamicSurface(moduleId: string) {
  if (!dynamicSurfaceCache[moduleId]) {
    dynamicSurfaceCache[moduleId] = React.lazy(
      () => import(/* @vite-ignore */ `./generated-runtime/${moduleId}.tsx`)
    );
  }
  return dynamicSurfaceCache[moduleId];
}

function ArtifactSurface(props: { artifact: Artifact }) {
  if (props.artifact.type === "browser") {
    return (
      <SurfaceBoundary artifact={props.artifact}>
        <BrowserArtifact artifact={props.artifact} />
      </SurfaceBoundary>
    );
  }

  const moduleId = String(props.artifact.payload.moduleId ?? "");
  let Component = surfaceRegistry[moduleId];

  // For generated surfaces not in the static registry, dynamically import
  if (!Component && moduleId.startsWith("gen-")) {
    Component = getDynamicSurface(moduleId);
  }

  if (!Component) {
    return (
      <Card title={props.artifact.title} subtitle="Missing surface module">
        <Text tone="muted">No surface renderer is registered for `{moduleId}`.</Text>
      </Card>
    );
  }

  return (
    <SurfaceBoundary artifact={props.artifact}>
      <React.Suspense
        fallback={
          <Card title={props.artifact.title} subtitle="Loading task surface">
            <Text tone="muted">Bringing this artifact onto the canvas.</Text>
          </Card>
        }
      >
        <Component
          artifactId={props.artifact.id}
          taskId={props.artifact.taskId}
          data={(props.artifact.payload.data ?? {}) as Record<string, unknown>}
        />
      </React.Suspense>
    </SurfaceBoundary>
  );
}

function IdleState(props: { agentTurnPreview?: string }) {
  return (
    <Card title="Calm Canvas" subtitle="Nothing active right now">
      <Column gap={12}>
        <Text>
          This shell starts from invocation, not from a grid of apps. The UI only materializes when a task needs it.
        </Text>
        <Row gap={10}>
          <Badge tone="accent">wake: `</Badge>
          <Badge tone="muted">voice: pending</Badge>
          <Badge tone="muted">agent UI: TSX-first</Badge>
        </Row>
        {props.agentTurnPreview ? <Text tone="muted">Last agent turn: {props.agentTurnPreview}</Text> : null}
      </Column>
    </Card>
  );
}

function InspectorPanel(props: { actionLog: ActionLogEntry[] }) {
  return (
    <Card title="Action Inspector" subtitle="Recent agent and tool activity">
      <Column gap={10}>
        {!props.actionLog.length ? (
          <Text tone="muted">The machine is quiet. Invoke something and the action trace will appear here.</Text>
        ) : null}
        {props.actionLog.map((entry) => (
          <div key={entry.id} className="inspector-entry">
            <Row gap={10} className="inspector-entry-head">
              <Badge tone={entry.kind === "error" ? "secondary" : entry.kind === "tool" ? "accent" : "muted"}>{entry.kind}</Badge>
              <Text tone="muted">{new Date(entry.timestamp).toLocaleTimeString()}</Text>
            </Row>
            <Text>{entry.title}</Text>
            {entry.detail ? <Text tone="muted">{entry.detail}</Text> : null}
          </div>
        ))}
      </Column>
    </Card>
  );
}

function ConfirmationChronicleItem(props: { entry: ConfirmationRecord }) {
  const status = props.entry.status === "pending"
    ? "pending"
    : props.entry.status === "approved"
      ? "approved"
      : "denied";

  return (
    <ChronicleItem
      title={`Confirmation: ${props.entry.title}`}
      line={props.entry.message}
      status={status}
    />
  );
}

function ConfirmationOverlay(props: {
  title: string;
  message: string;
  actionLabel: string;
  cancelLabel: string;
  onApprove: () => void;
  onDeny: () => void;
}) {
  return (
    <div className="confirmation-overlay">
      <Card title={props.title} subtitle="Awaiting your decision">
        <Column gap={14}>
          <Text>{props.message}</Text>
          <Row gap={10}>
            <Button onClick={props.onApprove}>{props.actionLabel}</Button>
            <Button tone="secondary" onClick={props.onDeny}>{props.cancelLabel}</Button>
          </Row>
        </Column>
      </Card>
    </div>
  );
}

function CompatibilityOverlay(props: {
  message: string;
  expectedProtocolVersion?: number;
  receivedProtocolVersion?: number;
  onDismiss: () => void;
}) {
  return (
    <div className="confirmation-overlay">
      <Card title="Compatibility Error" subtitle="Shell and bridge are out of sync">
        <Column gap={14}>
          <Text>{props.message}</Text>
          <Text tone="muted">
            Expected protocol: {props.expectedProtocolVersion ?? "?"} | Received: {props.receivedProtocolVersion ?? "?"}
          </Text>
          <Row gap={10}>
            <Button onClick={() => window.location.reload()}>Reload Shell</Button>
            <Button tone="secondary" onClick={props.onDismiss}>Dismiss</Button>
          </Row>
        </Column>
      </Card>
    </div>
  );
}

export default function App() {
  return (
    <RuntimeProvider>
      <ShellCanvas />
    </RuntimeProvider>
  );
}
