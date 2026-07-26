export function activityLabel(event: unknown): string | null;
export function activityDetail(event: unknown): string;
export function formatApiError(error: unknown): string;
export function jobStatusLabel(status: string): string;
export function jobActions(job: {
  id?: string;
  prompt?: string;
  sessionId?: string;
  status?: string;
}): string[];
export function sortNewest<T extends { createdAt?: string; updatedAt?: string }>(items: T[]): T[];
