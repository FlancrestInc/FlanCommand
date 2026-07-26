import { redactSafeValue } from "@flancommand/event-schema";

export interface NativeHermesFrame {
  jsonrpc: "2.0";
  method?: string;
  id?: string | number | null;
  params?: Record<string, unknown> | unknown[];
  result?: unknown;
  error?: unknown;
}

export class NativeFrameError extends Error {
  readonly code = "INVALID_NATIVE_FRAME";

  constructor() {
    super("Invalid Hermes frame.");
    this.name = "NativeFrameError";
  }
}

export function parseNativeFrame(input: unknown): NativeHermesFrame {
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      throw new NativeFrameError();
    }
  }
  if (!isRecord(value) || value.jsonrpc !== "2.0") throw new NativeFrameError();
  if (value.params !== undefined && !isRecord(value.params) && !Array.isArray(value.params))
    throw new NativeFrameError();

  const hasMethod = typeof value.method === "string";
  const hasResult = value.result !== undefined;
  const hasError = value.error !== undefined;
  const hasId = value.id !== undefined;
  const validId =
    value.id === null ||
    typeof value.id === "string" ||
    (typeof value.id === "number" && Number.isFinite(value.id));
  if (value.method !== undefined && !hasMethod) throw new NativeFrameError();
  if (hasId && !validId) throw new NativeFrameError();

  if (
    hasError &&
    (!isRecord(value.error) ||
      typeof value.error.code !== "number" ||
      typeof value.error.message !== "string" ||
      (value.error.data !== undefined && !isJsonValue(value.error.data)))
  )
    throw new NativeFrameError();

  if (hasMethod) {
    if (hasResult || hasError) throw new NativeFrameError();
    if (value.method === "event") {
      if (hasId) throw new NativeFrameError();
      if (!isRecord(value.params)) throw new NativeFrameError();
      if (typeof value.params.type !== "string" || !value.params.type) throw new NativeFrameError();
      if (value.params.payload !== undefined && !isRecord(value.params.payload))
        throw new NativeFrameError();
    }
  } else {
    if (!hasId || !validId || hasResult === hasError || value.params !== undefined)
      throw new NativeFrameError();
  }
  const safeValue = redactSafeValue(value) as Record<string, unknown>;
  const params = isRecord(safeValue.params) ? safeValue.params : undefined;
  const originalParams = isRecord(value) && isRecord(value.params) ? value.params : undefined;
  const originalPayload = isRecord(originalParams?.payload) ? originalParams.payload : undefined;
  const safePayload = isRecord(params?.payload) ? params.payload : undefined;
  if (typeof originalPayload?.args_text === "string" && safePayload) {
    try {
      safePayload.args_text = redactSafeValue(JSON.parse(originalPayload.args_text) as unknown);
    } catch {
      // Keep the redacted string when Hermes sends non-JSON tool arguments.
    }
  }
  return safeValue as unknown as NativeHermesFrame;
}

export function isNativeHermesFrame(value: unknown): boolean {
  return isRecord(value) && (value.jsonrpc === "2.0" || value.method === "event");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}
