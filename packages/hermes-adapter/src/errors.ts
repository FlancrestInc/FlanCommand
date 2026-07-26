import { safeErrorSchema, type SafeError } from "@flancommand/event-schema";

export class HermesAdapterError extends Error {
  readonly code: string;
  readonly component: string;
  readonly operation: string;
  readonly likelyCause: string;
  readonly nextAction: string;
  readonly retryable: boolean;

  constructor(error: SafeError) {
    const safeError = safeErrorSchema.parse(error);
    super(safeError.message);
    this.name = "HermesAdapterError";
    this.code = safeError.code;
    this.component = safeError.component ?? "hermes-adapter";
    this.operation = safeError.operation ?? "unknown operation";
    this.likelyCause =
      safeError.likelyCause ?? "The Hermes gateway did not complete the operation.";
    this.nextAction = safeError.nextAction ?? "Check adapter capabilities and gateway status.";
    this.retryable = safeError.retryable ?? false;
  }

  toSafeError(): SafeError {
    return safeErrorSchema.parse({
      code: this.code,
      message: this.message,
      component: this.component,
      operation: this.operation,
      likelyCause: this.likelyCause,
      nextAction: this.nextAction,
      retryable: this.retryable,
    });
  }
}

export class UnsupportedOperationError extends HermesAdapterError {
  constructor(operation: string) {
    super({
      code: "UNSUPPORTED_OPERATION",
      message: `Hermes does not currently support ${operation}.`,
      operation,
      likelyCause: "The transport has no verified implementation for this operation.",
      nextAction: "Run the capability probe or choose a transport that implements the operation.",
      retryable: false,
    });
    this.name = "UnsupportedOperationError";
  }
}

export class InvalidAdapterStateError extends HermesAdapterError {
  constructor(operation: string) {
    super({
      code: "INVALID_ADAPTER_STATE",
      message: `${operation} requires a connected Hermes adapter.`,
      operation,
      likelyCause: "The adapter is disconnected.",
      nextAction: "Call connect() before using the operation.",
      retryable: true,
    });
    this.name = "InvalidAdapterStateError";
  }
}
