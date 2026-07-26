import type { HermesCapabilities } from "@flancommand/event-schema";
import type { HermesAdapter } from "./adapter.js";
import { HermesAdapterImplementation } from "./hermes-adapter.js";
import { createDefaultCapabilities } from "./capabilities.js";
import { MockHermesTransport } from "./mock-transport.js";
import { WebSocketHermesTransport, type HermesAuth, type SocketFactory } from "./ws-transport.js";

export type AdapterTransportKind = "mock" | "websocket";

export interface CreateAdapterOptions {
  transport: AdapterTransportKind;
  capabilities?: HermesCapabilities;
  injectedTransport?: AdapterTransport;
  endpoint?: string;
  origin?: string;
  auth?: HermesAuth;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  idleTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxFrameBytes?: number;
  socketFactory?: SocketFactory;
}

interface AdapterTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  call(operation: string, input: unknown): Promise<unknown>;
  stream(operation: string, input: unknown): AsyncIterable<unknown>;
}

export function createHermesAdapter(options: CreateAdapterOptions): HermesAdapter {
  const transport =
    options.injectedTransport ??
    (options.transport === "mock"
      ? new MockHermesTransport()
      : new WebSocketHermesTransport({
          endpoint: options.endpoint ?? "ws://127.0.0.1:9119/api/ws",
          origin: options.origin ?? "http://localhost:5173",
          ...(options.auth ? { auth: options.auth } : {}),
          ...(options.connectTimeoutMs !== undefined
            ? { connectTimeoutMs: options.connectTimeoutMs }
            : {}),
          ...(options.requestTimeoutMs !== undefined
            ? { requestTimeoutMs: options.requestTimeoutMs }
            : {}),
          ...(options.idleTimeoutMs !== undefined ? { idleTimeoutMs: options.idleTimeoutMs } : {}),
          ...(options.totalTimeoutMs !== undefined
            ? { totalTimeoutMs: options.totalTimeoutMs }
            : {}),
          ...(options.maxFrameBytes !== undefined ? { maxFrameBytes: options.maxFrameBytes } : {}),
          ...(options.socketFactory ? { socketFactory: options.socketFactory } : {}),
        }));
  const capabilities =
    options.capabilities ??
    (options.transport === "mock"
      ? {
          ...createDefaultCapabilities(),
          sessions: { status: "observed" as const, evidence: "mock fixture" },
          streaming: { status: "observed" as const, evidence: "mock fixture" },
          commands: { status: "observed" as const, evidence: "mock fixture" },
          models: { status: "observed" as const, evidence: "mock fixture" },
          modelSelection: { status: "observed" as const, evidence: "mock fixture" },
          stop: { status: "observed" as const, evidence: "mock fixture" },
          approvals: { status: "observed" as const, evidence: "mock fixture" },
          reconnect: { status: "observed" as const, evidence: "mock fixture" },
        }
      : {
          ...createDefaultCapabilities(),
          sessions: {
            status: "source-inferred" as const,
            evidence: "Hermes gateway session.list runtime probe",
          },
          streaming: {
            status: "source-inferred" as const,
            evidence: "Hermes gateway prompt.submit handler in the installed gateway",
          },
          commands: {
            status: "source-inferred" as const,
            evidence: "Hermes gateway commands.catalog handler in the installed gateway",
          },
          models: {
            status: "source-inferred" as const,
            evidence: "Hermes gateway model.options handler in the installed gateway",
          },
          modelSelection: {
            status: "source-inferred" as const,
            evidence: "Hermes gateway config.set model handler in the installed gateway",
          },
          stop: {
            status: "source-inferred" as const,
            evidence: "Hermes gateway session.interrupt handler in the installed gateway",
          },
          retry: {
            status: "source-inferred" as const,
            evidence: "Hermes gateway session.undo handler in the installed gateway",
          },
          approvals: {
            status: "source-inferred" as const,
            evidence: "Hermes gateway approval.respond handler in the installed gateway",
          },
        });
  return new HermesAdapterImplementation(transport, capabilities);
}
