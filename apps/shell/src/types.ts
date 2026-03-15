import type { AgentTurnResponse, Artifact, ChronicleEntry, Task } from "@slopos/runtime";

export type SurfaceRegistryEntry = {
  id: string;
  title: string;
  render: (artifact: Artifact) => JSX.Element;
};

export type MockRuntimeState = {
  tasks: Task[];
  artifacts: Artifact[];
  chronicle: ChronicleEntry[];
  statusText: string;
  lastAgentTurn?: AgentTurnResponse;
};
