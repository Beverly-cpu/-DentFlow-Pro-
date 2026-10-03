import { CentralApiError } from "./centralApiError";

const deterministicStatuses = new Set([400, 403, 404, 409]);

export function canClearPendingAfterError(error: unknown): boolean {
  return error instanceof CentralApiError && deterministicStatuses.has(error.status);
}
