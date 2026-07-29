export function activityLabel(event: unknown): string | null;
export function activityDetail(event: unknown): string;
export function activitySummaryLabel(
  summary:
    | {
        status?: string;
        toolCalls?: number;
        approvals?: number;
        durationSeconds?: number;
      }
    | null
    | undefined,
): string;
export function formatDuration(seconds: number): string;
export function runtimeMonitorLabel(
  icon: string,
  seconds: number | null,
  completed?: boolean,
): string;
export function formatApiError(error: unknown): string;
export function jobStatusLabel(status: string): string;
export function jobActions(job: {
  id?: string;
  prompt?: string;
  sessionId?: string;
  status?: string;
}): string[];
export function sortNewest<T extends { createdAt?: string; updatedAt?: string }>(items: T[]): T[];
