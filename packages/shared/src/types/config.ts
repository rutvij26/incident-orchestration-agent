export const CONFIG_GROUPS = [
  "bootstrap",
  "llm",
  "embedding",
  "rag",
  "autofix",
  "source",
  "github",
  "notifications",
] as const;

export type ConfigGroup = (typeof CONFIG_GROUPS)[number];

export type ConfigRecord = {
  readonly key: string;
  readonly value: string;
  readonly encrypted: boolean;
  readonly groupName: ConfigGroup;
  readonly updatedAt: Date;
};

export type WorkflowRunStatus = "running" | "completed" | "failed";

export type WorkflowRun = {
  readonly id: string;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly status: WorkflowRunStatus;
  readonly logsScanned: number;
  readonly incidentsFound: number;
  readonly issuesOpened: number;
  readonly fixesAttempted: number;
  readonly errorMessage: string | null;
};

export type ScheduleConfig = {
  readonly id: number;
  readonly enabled: boolean;
  readonly cronExpression: string;
  readonly temporalScheduleId: string | null;
  readonly updatedAt: Date;
};

export type IncidentStatus = "open" | "acknowledged" | "resolved";
