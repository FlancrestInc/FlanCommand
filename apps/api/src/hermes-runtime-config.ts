export interface HermesRuntimeConfig {
  transport: "mock" | "websocket";
  endpoint: string;
  origin: string;
  maxFrameBytes: number;
  auth?: { token: string };
  dashboardAuth?: { username: string; password: string };
}

const defaultEndpoint = "ws://127.0.0.1:9119/api/ws";
const defaultOrigin = "http://127.0.0.1:3000";
const defaultMaxFrameBytes = 8 * 1024 * 1024;
const maxAllowedFrameBytes = 32 * 1024 * 1024;

function readMaxFrameBytes(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1024 * 1024 && parsed <= maxAllowedFrameBytes
    ? parsed
    : defaultMaxFrameBytes;
}

export function readHermesRuntimeConfig(
  environment: Record<string, string | undefined> = process.env,
): HermesRuntimeConfig {
  const endpoint = environment.HERMES_ENDPOINT || environment.HERMES_WS_ENDPOINT || defaultEndpoint;
  const origin = environment.HERMES_ORIGIN || environment.HERMES_WEB_ORIGIN || defaultOrigin;
  const token = environment.HERMES_AUTH_TOKEN?.trim();
  const username = environment.HERMES_DASHBOARD_USERNAME?.trim();
  const password = environment.HERMES_DASHBOARD_PASSWORD;
  const maxFrameBytes = readMaxFrameBytes(environment.HERMES_MAX_FRAME_BYTES);

  return {
    transport: environment.HERMES_TRANSPORT === "websocket" ? "websocket" : "mock",
    endpoint,
    origin,
    maxFrameBytes,
    ...(token ? { auth: { token } } : {}),
    ...(username && password ? { dashboardAuth: { username, password } } : {}),
  };
}
