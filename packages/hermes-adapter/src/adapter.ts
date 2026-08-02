import type {
  AgentEvent,
  HermesCapabilities,
  HermesSession,
  ModelInfo,
  SlashCommand,
} from "@flancommand/event-schema";

export interface ListSessionsInput {
  limit?: number;
  cursor?: string;
}

export interface CreateSessionInput {
  title?: string;
  modelId?: string;
}

export interface SendMessageInput {
  text: string;
  modelId?: string;
}

export interface FileAttachmentInput {
  name: string;
  mimeType: string;
  contentBase64: string;
}

export interface AttachmentResult {
  attached: boolean;
  name?: string;
  refText?: string;
}

export interface HermesAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getCapabilities(): Promise<HermesCapabilities>;
  listSessions(input?: ListSessionsInput): Promise<HermesSession[]>;
  getSession(sessionId: string): Promise<HermesSession>;
  createSession(input?: CreateSessionInput): Promise<HermesSession>;
  resumeSession(sessionId: string): Promise<HermesSession>;
  renameSession(sessionId: string, title: string): Promise<void>;
  sendMessage(sessionId: string, input: SendMessageInput): AsyncIterable<AgentEvent>;
  steer(sessionId: string, text: string): Promise<void>;
  stopRun(runId: string, sessionId?: string): Promise<void>;
  retryTurn(sessionId: string, turnId: string): Promise<void>;
  dispatchCommand(sessionId: string, command: string): AsyncIterable<AgentEvent>;
  listCommands(sessionId?: string): Promise<SlashCommand[]>;
  listModels(): Promise<ModelInfo[]>;
  setSessionModel(sessionId: string, modelId: string): Promise<void>;
  approveAction(actionId: string, sessionId?: string): Promise<void>;
  denyAction(actionId: string, reason?: string, sessionId?: string): Promise<void>;
  provideCredential(sessionId: string, requestId: string, value: string): Promise<void>;
  attachFile(sessionId: string, input: FileAttachmentInput): Promise<AttachmentResult>;
  attachImage(sessionId: string, input: FileAttachmentInput): Promise<AttachmentResult>;
}
