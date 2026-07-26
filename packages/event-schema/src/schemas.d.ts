import { z } from "zod";
export declare const redactSafeText: (value: string) => string;
export declare function redactSafeValue(value: unknown, key?: string): unknown;
export declare const capabilityStatusSchema: z.ZodEnum<
  ["observed", "source-inferred", "unsupported", "not observed", "not tested", "blocked"]
>;
export declare const capabilityObservationSchema: z.ZodObject<
  {
    status: z.ZodEnum<
      ["observed", "source-inferred", "unsupported", "not observed", "not tested", "blocked"]
    >;
    evidence: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    reason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    recovery: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
  },
  "strict",
  z.ZodTypeAny,
  {
    status:
      "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
    evidence?: string | undefined;
    reason?: string | undefined;
    recovery?: string | undefined;
  },
  {
    status:
      "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
    evidence?: string | undefined;
    reason?: string | undefined;
    recovery?: string | undefined;
  }
>;
export declare const hermesCapabilitiesSchema: z.ZodObject<
  {
    sessions: z.ZodObject<
      {
        status: z.ZodEnum<
          ["observed", "source-inferred", "unsupported", "not observed", "not tested", "blocked"]
        >;
        evidence: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        reason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        recovery: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
      },
      "strict",
      z.ZodTypeAny,
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      },
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      }
    >;
    streaming: z.ZodObject<
      {
        status: z.ZodEnum<
          ["observed", "source-inferred", "unsupported", "not observed", "not tested", "blocked"]
        >;
        evidence: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        reason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        recovery: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
      },
      "strict",
      z.ZodTypeAny,
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      },
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      }
    >;
    commands: z.ZodObject<
      {
        status: z.ZodEnum<
          ["observed", "source-inferred", "unsupported", "not observed", "not tested", "blocked"]
        >;
        evidence: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        reason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        recovery: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
      },
      "strict",
      z.ZodTypeAny,
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      },
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      }
    >;
    models: z.ZodObject<
      {
        status: z.ZodEnum<
          ["observed", "source-inferred", "unsupported", "not observed", "not tested", "blocked"]
        >;
        evidence: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        reason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        recovery: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
      },
      "strict",
      z.ZodTypeAny,
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      },
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      }
    >;
    approvals: z.ZodObject<
      {
        status: z.ZodEnum<
          ["observed", "source-inferred", "unsupported", "not observed", "not tested", "blocked"]
        >;
        evidence: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        reason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        recovery: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
      },
      "strict",
      z.ZodTypeAny,
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      },
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      }
    >;
    clarifications: z.ZodObject<
      {
        status: z.ZodEnum<
          ["observed", "source-inferred", "unsupported", "not observed", "not tested", "blocked"]
        >;
        evidence: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        reason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        recovery: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
      },
      "strict",
      z.ZodTypeAny,
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      },
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      }
    >;
    reconnect: z.ZodObject<
      {
        status: z.ZodEnum<
          ["observed", "source-inferred", "unsupported", "not observed", "not tested", "blocked"]
        >;
        evidence: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        reason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        recovery: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
      },
      "strict",
      z.ZodTypeAny,
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      },
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      }
    >;
    artifacts: z.ZodObject<
      {
        status: z.ZodEnum<
          ["observed", "source-inferred", "unsupported", "not observed", "not tested", "blocked"]
        >;
        evidence: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        reason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        recovery: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
      },
      "strict",
      z.ZodTypeAny,
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      },
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      }
    >;
    memory: z.ZodObject<
      {
        status: z.ZodEnum<
          ["observed", "source-inferred", "unsupported", "not observed", "not tested", "blocked"]
        >;
        evidence: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        reason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        recovery: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
      },
      "strict",
      z.ZodTypeAny,
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      },
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      }
    >;
    usage: z.ZodObject<
      {
        status: z.ZodEnum<
          ["observed", "source-inferred", "unsupported", "not observed", "not tested", "blocked"]
        >;
        evidence: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        reason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        recovery: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
      },
      "strict",
      z.ZodTypeAny,
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      },
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      }
    >;
    context: z.ZodObject<
      {
        status: z.ZodEnum<
          ["observed", "source-inferred", "unsupported", "not observed", "not tested", "blocked"]
        >;
        evidence: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        reason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        recovery: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
      },
      "strict",
      z.ZodTypeAny,
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      },
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      }
    >;
    stop: z.ZodObject<
      {
        status: z.ZodEnum<
          ["observed", "source-inferred", "unsupported", "not observed", "not tested", "blocked"]
        >;
        evidence: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        reason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        recovery: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
      },
      "strict",
      z.ZodTypeAny,
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      },
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      }
    >;
    retry: z.ZodObject<
      {
        status: z.ZodEnum<
          ["observed", "source-inferred", "unsupported", "not observed", "not tested", "blocked"]
        >;
        evidence: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        reason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        recovery: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
      },
      "strict",
      z.ZodTypeAny,
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      },
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      }
    >;
    rename: z.ZodObject<
      {
        status: z.ZodEnum<
          ["observed", "source-inferred", "unsupported", "not observed", "not tested", "blocked"]
        >;
        evidence: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        reason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        recovery: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
      },
      "strict",
      z.ZodTypeAny,
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      },
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      }
    >;
    modelSelection: z.ZodObject<
      {
        status: z.ZodEnum<
          ["observed", "source-inferred", "unsupported", "not observed", "not tested", "blocked"]
        >;
        evidence: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        reason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        recovery: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
      },
      "strict",
      z.ZodTypeAny,
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      },
      {
        status:
          | "observed"
          | "source-inferred"
          | "unsupported"
          | "not observed"
          | "not tested"
          | "blocked";
        evidence?: string | undefined;
        reason?: string | undefined;
        recovery?: string | undefined;
      }
    >;
  },
  "strict",
  z.ZodTypeAny,
  {
    sessions: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    streaming: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    commands: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    models: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    approvals: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    clarifications: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    reconnect: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    artifacts: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    memory: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    usage: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    context: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    stop: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    retry: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    rename: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    modelSelection: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
  },
  {
    sessions: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    streaming: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    commands: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    models: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    approvals: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    clarifications: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    reconnect: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    artifacts: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    memory: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    usage: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    context: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    stop: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    retry: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    rename: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
    modelSelection: {
      status:
        "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";
      evidence?: string | undefined;
      reason?: string | undefined;
      recovery?: string | undefined;
    };
  }
>;
export declare const hermesSessionSchema: z.ZodObject<
  {
    id: z.ZodEffects<z.ZodString, string, string>;
    title: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    modelId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    createdAt: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    updatedAt: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    source: z.ZodOptional<z.ZodEnum<["hermes", "telegram", "unknown"]>>;
    status: z.ZodOptional<z.ZodEnum<["idle", "running", "paused", "failed", "unknown"]>>;
  },
  "strict",
  z.ZodTypeAny,
  {
    id: string;
    status?: "unknown" | "idle" | "running" | "paused" | "failed" | undefined;
    title?: string | undefined;
    modelId?: string | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    source?: "hermes" | "telegram" | "unknown" | undefined;
  },
  {
    id: string;
    status?: "unknown" | "idle" | "running" | "paused" | "failed" | undefined;
    title?: string | undefined;
    modelId?: string | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    source?: "hermes" | "telegram" | "unknown" | undefined;
  }
>;
export declare const modelInfoSchema: z.ZodObject<
  {
    id: z.ZodEffects<z.ZodString, string, string>;
    name: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    provider: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    reasoning: z.ZodOptional<z.ZodBoolean>;
    contextWindow: z.ZodOptional<z.ZodNumber>;
  },
  "strict",
  z.ZodTypeAny,
  {
    id: string;
    contextWindow?: number | undefined;
    name?: string | undefined;
    provider?: string | undefined;
    reasoning?: boolean | undefined;
  },
  {
    id: string;
    contextWindow?: number | undefined;
    name?: string | undefined;
    provider?: string | undefined;
    reasoning?: boolean | undefined;
  }
>;
export declare const slashCommandSchema: z.ZodObject<
  {
    name: z.ZodEffects<z.ZodString, string, string>;
    description: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    argumentHint: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
  },
  "strict",
  z.ZodTypeAny,
  {
    name: string;
    description?: string | undefined;
    argumentHint?: string | undefined;
  },
  {
    name: string;
    description?: string | undefined;
    argumentHint?: string | undefined;
  }
>;
export declare const safeErrorSchema: z.ZodObject<
  {
    code: z.ZodEffects<z.ZodString, string, string>;
    message: z.ZodEffects<z.ZodString, string, string>;
    component: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    operation: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    likelyCause: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    nextAction: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    retryable: z.ZodOptional<z.ZodBoolean>;
  },
  "strict",
  z.ZodTypeAny,
  {
    code: string;
    message: string;
    component?: string | undefined;
    operation?: string | undefined;
    likelyCause?: string | undefined;
    nextAction?: string | undefined;
    retryable?: boolean | undefined;
  },
  {
    code: string;
    message: string;
    component?: string | undefined;
    operation?: string | undefined;
    likelyCause?: string | undefined;
    nextAction?: string | undefined;
    retryable?: boolean | undefined;
  }
>;
export declare const usageSchema: z.ZodObject<
  {
    inputTokens: z.ZodOptional<z.ZodNumber>;
    outputTokens: z.ZodOptional<z.ZodNumber>;
    totalTokens: z.ZodOptional<z.ZodNumber>;
    reasoningTokens: z.ZodOptional<z.ZodNumber>;
    cachedInputTokens: z.ZodOptional<z.ZodNumber>;
  },
  "strict",
  z.ZodTypeAny,
  {
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
    totalTokens?: number | undefined;
    reasoningTokens?: number | undefined;
    cachedInputTokens?: number | undefined;
  },
  {
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
    totalTokens?: number | undefined;
    reasoningTokens?: number | undefined;
    cachedInputTokens?: number | undefined;
  }
>;
export declare const contextUsageSchema: z.ZodObject<
  {
    inputTokens: z.ZodOptional<z.ZodNumber>;
    outputTokens: z.ZodOptional<z.ZodNumber>;
    totalTokens: z.ZodOptional<z.ZodNumber>;
    reasoningTokens: z.ZodOptional<z.ZodNumber>;
    cachedInputTokens: z.ZodOptional<z.ZodNumber>;
  } & {
    contextWindow: z.ZodOptional<z.ZodNumber>;
  },
  "strict",
  z.ZodTypeAny,
  {
    contextWindow?: number | undefined;
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
    totalTokens?: number | undefined;
    reasoningTokens?: number | undefined;
    cachedInputTokens?: number | undefined;
  },
  {
    contextWindow?: number | undefined;
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
    totalTokens?: number | undefined;
    reasoningTokens?: number | undefined;
    cachedInputTokens?: number | undefined;
  }
>;
export declare const toolCallSchema: z.ZodObject<
  {
    id: z.ZodEffects<z.ZodString, string, string>;
    name: z.ZodEffects<z.ZodString, string, string>;
    input: z.ZodOptional<z.ZodEffects<z.ZodUnknown, unknown, unknown>>;
  },
  "strict",
  z.ZodTypeAny,
  {
    id: string;
    name: string;
    input?: unknown;
  },
  {
    id: string;
    name: string;
    input?: unknown;
  }
>;
export declare const approvalRequestSchema: z.ZodObject<
  {
    id: z.ZodEffects<z.ZodString, string, string>;
    action: z.ZodEffects<z.ZodString, string, string>;
    description: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    risk: z.ZodOptional<z.ZodEnum<["low", "medium", "high", "unknown"]>>;
  },
  "strict",
  z.ZodTypeAny,
  {
    id: string;
    action: string;
    description?: string | undefined;
    risk?: "unknown" | "low" | "medium" | "high" | undefined;
  },
  {
    id: string;
    action: string;
    description?: string | undefined;
    risk?: "unknown" | "low" | "medium" | "high" | undefined;
  }
>;
export declare const artifactReferenceSchema: z.ZodObject<
  {
    id: z.ZodEffects<z.ZodString, string, string>;
    name: z.ZodEffects<z.ZodString, string, string>;
    kind: z.ZodOptional<z.ZodEnum<["file", "image", "document", "link", "unknown"]>>;
    mimeType: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    uri: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    sizeBytes: z.ZodOptional<z.ZodNumber>;
  },
  "strict",
  z.ZodTypeAny,
  {
    id: string;
    name: string;
    kind?: "unknown" | "file" | "image" | "document" | "link" | undefined;
    mimeType?: string | undefined;
    uri?: string | undefined;
    sizeBytes?: number | undefined;
  },
  {
    id: string;
    name: string;
    kind?: "unknown" | "file" | "image" | "document" | "link" | undefined;
    mimeType?: string | undefined;
    uri?: string | undefined;
    sizeBytes?: number | undefined;
  }
>;
export declare const memoryReferenceSchema: z.ZodObject<
  {
    id: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    label: z.ZodEffects<z.ZodString, string, string>;
    source: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
  },
  "strict",
  z.ZodTypeAny,
  {
    label: string;
    id?: string | undefined;
    source?: string | undefined;
  },
  {
    label: string;
    id?: string | undefined;
    source?: string | undefined;
  }
>;
export declare const runSummarySchema: z.ZodObject<
  {
    text: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    usage: z.ZodOptional<
      z.ZodObject<
        {
          inputTokens: z.ZodOptional<z.ZodNumber>;
          outputTokens: z.ZodOptional<z.ZodNumber>;
          totalTokens: z.ZodOptional<z.ZodNumber>;
          reasoningTokens: z.ZodOptional<z.ZodNumber>;
          cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        },
        "strict",
        z.ZodTypeAny,
        {
          inputTokens?: number | undefined;
          outputTokens?: number | undefined;
          totalTokens?: number | undefined;
          reasoningTokens?: number | undefined;
          cachedInputTokens?: number | undefined;
        },
        {
          inputTokens?: number | undefined;
          outputTokens?: number | undefined;
          totalTokens?: number | undefined;
          reasoningTokens?: number | undefined;
          cachedInputTokens?: number | undefined;
        }
      >
    >;
  },
  "strict",
  z.ZodTypeAny,
  {
    usage?:
      | {
          inputTokens?: number | undefined;
          outputTokens?: number | undefined;
          totalTokens?: number | undefined;
          reasoningTokens?: number | undefined;
          cachedInputTokens?: number | undefined;
        }
      | undefined;
    text?: string | undefined;
  },
  {
    usage?:
      | {
          inputTokens?: number | undefined;
          outputTokens?: number | undefined;
          totalTokens?: number | undefined;
          reasoningTokens?: number | undefined;
          cachedInputTokens?: number | undefined;
        }
      | undefined;
    text?: string | undefined;
  }
>;
export declare const agentEventSchema: z.ZodDiscriminatedUnion<
  "type",
  [
    z.ZodObject<
      {
        type: z.ZodLiteral<"run.started">;
        runId: z.ZodEffects<z.ZodString, string, string>;
        sessionId: z.ZodEffects<z.ZodString, string, string>;
        at: z.ZodEffects<z.ZodString, string, string>;
      },
      "strict",
      z.ZodTypeAny,
      {
        type: "run.started";
        at: string;
        runId: string;
        sessionId: string;
      },
      {
        type: "run.started";
        at: string;
        runId: string;
        sessionId: string;
      }
    >,
    z.ZodObject<
      {
        stage: z.ZodEffects<z.ZodString, string, string>;
        detail: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        runId: z.ZodEffects<z.ZodString, string, string>;
        sessionId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        type: z.ZodLiteral<"run.status">;
      },
      "strict",
      z.ZodTypeAny,
      {
        type: "run.status";
        runId: string;
        stage: string;
        sessionId?: string | undefined;
        detail?: string | undefined;
      },
      {
        type: "run.status";
        runId: string;
        stage: string;
        sessionId?: string | undefined;
        detail?: string | undefined;
      }
    >,
    z.ZodObject<
      {
        text: z.ZodEffects<z.ZodString, string, string>;
        runId: z.ZodEffects<z.ZodString, string, string>;
        sessionId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        type: z.ZodLiteral<"message.delta">;
      },
      "strict",
      z.ZodTypeAny,
      {
        type: "message.delta";
        text: string;
        runId: string;
        sessionId?: string | undefined;
      },
      {
        type: "message.delta";
        text: string;
        runId: string;
        sessionId?: string | undefined;
      }
    >,
    z.ZodObject<
      {
        messageId: z.ZodEffects<z.ZodString, string, string>;
        runId: z.ZodEffects<z.ZodString, string, string>;
        sessionId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        type: z.ZodLiteral<"message.completed">;
      },
      "strict",
      z.ZodTypeAny,
      {
        type: "message.completed";
        runId: string;
        messageId: string;
        sessionId?: string | undefined;
      },
      {
        type: "message.completed";
        runId: string;
        messageId: string;
        sessionId?: string | undefined;
      }
    >,
    z.ZodObject<
      {
        toolCall: z.ZodObject<
          {
            id: z.ZodEffects<z.ZodString, string, string>;
            name: z.ZodEffects<z.ZodString, string, string>;
            input: z.ZodOptional<z.ZodEffects<z.ZodUnknown, unknown, unknown>>;
          },
          "strict",
          z.ZodTypeAny,
          {
            id: string;
            name: string;
            input?: unknown;
          },
          {
            id: string;
            name: string;
            input?: unknown;
          }
        >;
        runId: z.ZodEffects<z.ZodString, string, string>;
        sessionId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        type: z.ZodLiteral<"tool.started">;
      },
      "strict",
      z.ZodTypeAny,
      {
        type: "tool.started";
        runId: string;
        toolCall: {
          id: string;
          name: string;
          input?: unknown;
        };
        sessionId?: string | undefined;
      },
      {
        type: "tool.started";
        runId: string;
        toolCall: {
          id: string;
          name: string;
          input?: unknown;
        };
        sessionId?: string | undefined;
      }
    >,
    z.ZodObject<
      {
        toolCallId: z.ZodEffects<z.ZodString, string, string>;
        chunk: z.ZodEffects<z.ZodString, string, string>;
        runId: z.ZodEffects<z.ZodString, string, string>;
        sessionId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        type: z.ZodLiteral<"tool.output">;
      },
      "strict",
      z.ZodTypeAny,
      {
        type: "tool.output";
        runId: string;
        toolCallId: string;
        chunk: string;
        sessionId?: string | undefined;
      },
      {
        type: "tool.output";
        runId: string;
        toolCallId: string;
        chunk: string;
        sessionId?: string | undefined;
      }
    >,
    z.ZodObject<
      {
        toolCallId: z.ZodEffects<z.ZodString, string, string>;
        result: z.ZodEffects<z.ZodUnknown, unknown, unknown>;
        runId: z.ZodEffects<z.ZodString, string, string>;
        sessionId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        type: z.ZodLiteral<"tool.completed">;
      },
      "strict",
      z.ZodTypeAny,
      {
        type: "tool.completed";
        runId: string;
        toolCallId: string;
        sessionId?: string | undefined;
        result?: unknown;
      },
      {
        type: "tool.completed";
        runId: string;
        toolCallId: string;
        sessionId?: string | undefined;
        result?: unknown;
      }
    >,
    z.ZodObject<
      {
        toolCallId: z.ZodEffects<z.ZodString, string, string>;
        error: z.ZodObject<
          {
            code: z.ZodEffects<z.ZodString, string, string>;
            message: z.ZodEffects<z.ZodString, string, string>;
            component: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            operation: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            likelyCause: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            nextAction: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            retryable: z.ZodOptional<z.ZodBoolean>;
          },
          "strict",
          z.ZodTypeAny,
          {
            code: string;
            message: string;
            component?: string | undefined;
            operation?: string | undefined;
            likelyCause?: string | undefined;
            nextAction?: string | undefined;
            retryable?: boolean | undefined;
          },
          {
            code: string;
            message: string;
            component?: string | undefined;
            operation?: string | undefined;
            likelyCause?: string | undefined;
            nextAction?: string | undefined;
            retryable?: boolean | undefined;
          }
        >;
        runId: z.ZodEffects<z.ZodString, string, string>;
        sessionId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        type: z.ZodLiteral<"tool.failed">;
      },
      "strict",
      z.ZodTypeAny,
      {
        type: "tool.failed";
        runId: string;
        toolCallId: string;
        error: {
          code: string;
          message: string;
          component?: string | undefined;
          operation?: string | undefined;
          likelyCause?: string | undefined;
          nextAction?: string | undefined;
          retryable?: boolean | undefined;
        };
        sessionId?: string | undefined;
      },
      {
        type: "tool.failed";
        runId: string;
        toolCallId: string;
        error: {
          code: string;
          message: string;
          component?: string | undefined;
          operation?: string | undefined;
          likelyCause?: string | undefined;
          nextAction?: string | undefined;
          retryable?: boolean | undefined;
        };
        sessionId?: string | undefined;
      }
    >,
    z.ZodObject<
      {
        approval: z.ZodObject<
          {
            id: z.ZodEffects<z.ZodString, string, string>;
            action: z.ZodEffects<z.ZodString, string, string>;
            description: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            risk: z.ZodOptional<z.ZodEnum<["low", "medium", "high", "unknown"]>>;
          },
          "strict",
          z.ZodTypeAny,
          {
            id: string;
            action: string;
            description?: string | undefined;
            risk?: "unknown" | "low" | "medium" | "high" | undefined;
          },
          {
            id: string;
            action: string;
            description?: string | undefined;
            risk?: "unknown" | "low" | "medium" | "high" | undefined;
          }
        >;
        runId: z.ZodEffects<z.ZodString, string, string>;
        sessionId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        type: z.ZodLiteral<"approval.requested">;
      },
      "strict",
      z.ZodTypeAny,
      {
        type: "approval.requested";
        runId: string;
        approval: {
          id: string;
          action: string;
          description?: string | undefined;
          risk?: "unknown" | "low" | "medium" | "high" | undefined;
        };
        sessionId?: string | undefined;
      },
      {
        type: "approval.requested";
        runId: string;
        approval: {
          id: string;
          action: string;
          description?: string | undefined;
          risk?: "unknown" | "low" | "medium" | "high" | undefined;
        };
        sessionId?: string | undefined;
      }
    >,
    z.ZodObject<
      {
        question: z.ZodEffects<z.ZodString, string, string>;
        runId: z.ZodEffects<z.ZodString, string, string>;
        sessionId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        type: z.ZodLiteral<"clarification.requested">;
      },
      "strict",
      z.ZodTypeAny,
      {
        type: "clarification.requested";
        runId: string;
        question: string;
        sessionId?: string | undefined;
      },
      {
        type: "clarification.requested";
        runId: string;
        question: string;
        sessionId?: string | undefined;
      }
    >,
    z.ZodObject<
      {
        memory: z.ZodObject<
          {
            id: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            label: z.ZodEffects<z.ZodString, string, string>;
            source: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
          },
          "strict",
          z.ZodTypeAny,
          {
            label: string;
            id?: string | undefined;
            source?: string | undefined;
          },
          {
            label: string;
            id?: string | undefined;
            source?: string | undefined;
          }
        >;
        runId: z.ZodEffects<z.ZodString, string, string>;
        sessionId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        type: z.ZodLiteral<"memory.used">;
      },
      "strict",
      z.ZodTypeAny,
      {
        type: "memory.used";
        memory: {
          label: string;
          id?: string | undefined;
          source?: string | undefined;
        };
        runId: string;
        sessionId?: string | undefined;
      },
      {
        type: "memory.used";
        memory: {
          label: string;
          id?: string | undefined;
          source?: string | undefined;
        };
        runId: string;
        sessionId?: string | undefined;
      }
    >,
    z.ZodObject<
      {
        artifact: z.ZodObject<
          {
            id: z.ZodEffects<z.ZodString, string, string>;
            name: z.ZodEffects<z.ZodString, string, string>;
            kind: z.ZodOptional<z.ZodEnum<["file", "image", "document", "link", "unknown"]>>;
            mimeType: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            uri: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            sizeBytes: z.ZodOptional<z.ZodNumber>;
          },
          "strict",
          z.ZodTypeAny,
          {
            id: string;
            name: string;
            kind?: "unknown" | "file" | "image" | "document" | "link" | undefined;
            mimeType?: string | undefined;
            uri?: string | undefined;
            sizeBytes?: number | undefined;
          },
          {
            id: string;
            name: string;
            kind?: "unknown" | "file" | "image" | "document" | "link" | undefined;
            mimeType?: string | undefined;
            uri?: string | undefined;
            sizeBytes?: number | undefined;
          }
        >;
        runId: z.ZodEffects<z.ZodString, string, string>;
        sessionId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        type: z.ZodLiteral<"artifact.created">;
      },
      "strict",
      z.ZodTypeAny,
      {
        type: "artifact.created";
        runId: string;
        artifact: {
          id: string;
          name: string;
          kind?: "unknown" | "file" | "image" | "document" | "link" | undefined;
          mimeType?: string | undefined;
          uri?: string | undefined;
          sizeBytes?: number | undefined;
        };
        sessionId?: string | undefined;
      },
      {
        type: "artifact.created";
        runId: string;
        artifact: {
          id: string;
          name: string;
          kind?: "unknown" | "file" | "image" | "document" | "link" | undefined;
          mimeType?: string | undefined;
          uri?: string | undefined;
          sizeBytes?: number | undefined;
        };
        sessionId?: string | undefined;
      }
    >,
    z.ZodObject<
      {
        type: z.ZodLiteral<"context.updated">;
        sessionId: z.ZodEffects<z.ZodString, string, string>;
        usage: z.ZodObject<
          {
            inputTokens: z.ZodOptional<z.ZodNumber>;
            outputTokens: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            reasoningTokens: z.ZodOptional<z.ZodNumber>;
            cachedInputTokens: z.ZodOptional<z.ZodNumber>;
          } & {
            contextWindow: z.ZodOptional<z.ZodNumber>;
          },
          "strict",
          z.ZodTypeAny,
          {
            contextWindow?: number | undefined;
            inputTokens?: number | undefined;
            outputTokens?: number | undefined;
            totalTokens?: number | undefined;
            reasoningTokens?: number | undefined;
            cachedInputTokens?: number | undefined;
          },
          {
            contextWindow?: number | undefined;
            inputTokens?: number | undefined;
            outputTokens?: number | undefined;
            totalTokens?: number | undefined;
            reasoningTokens?: number | undefined;
            cachedInputTokens?: number | undefined;
          }
        >;
      },
      "strict",
      z.ZodTypeAny,
      {
        type: "context.updated";
        usage: {
          contextWindow?: number | undefined;
          inputTokens?: number | undefined;
          outputTokens?: number | undefined;
          totalTokens?: number | undefined;
          reasoningTokens?: number | undefined;
          cachedInputTokens?: number | undefined;
        };
        sessionId: string;
      },
      {
        type: "context.updated";
        usage: {
          contextWindow?: number | undefined;
          inputTokens?: number | undefined;
          outputTokens?: number | undefined;
          totalTokens?: number | undefined;
          reasoningTokens?: number | undefined;
          cachedInputTokens?: number | undefined;
        };
        sessionId: string;
      }
    >,
    z.ZodObject<
      {
        summary: z.ZodOptional<
          z.ZodObject<
            {
              text: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
              usage: z.ZodOptional<
                z.ZodObject<
                  {
                    inputTokens: z.ZodOptional<z.ZodNumber>;
                    outputTokens: z.ZodOptional<z.ZodNumber>;
                    totalTokens: z.ZodOptional<z.ZodNumber>;
                    reasoningTokens: z.ZodOptional<z.ZodNumber>;
                    cachedInputTokens: z.ZodOptional<z.ZodNumber>;
                  },
                  "strict",
                  z.ZodTypeAny,
                  {
                    inputTokens?: number | undefined;
                    outputTokens?: number | undefined;
                    totalTokens?: number | undefined;
                    reasoningTokens?: number | undefined;
                    cachedInputTokens?: number | undefined;
                  },
                  {
                    inputTokens?: number | undefined;
                    outputTokens?: number | undefined;
                    totalTokens?: number | undefined;
                    reasoningTokens?: number | undefined;
                    cachedInputTokens?: number | undefined;
                  }
                >
              >;
            },
            "strict",
            z.ZodTypeAny,
            {
              usage?:
                | {
                    inputTokens?: number | undefined;
                    outputTokens?: number | undefined;
                    totalTokens?: number | undefined;
                    reasoningTokens?: number | undefined;
                    cachedInputTokens?: number | undefined;
                  }
                | undefined;
              text?: string | undefined;
            },
            {
              usage?:
                | {
                    inputTokens?: number | undefined;
                    outputTokens?: number | undefined;
                    totalTokens?: number | undefined;
                    reasoningTokens?: number | undefined;
                    cachedInputTokens?: number | undefined;
                  }
                | undefined;
              text?: string | undefined;
            }
          >
        >;
        runId: z.ZodEffects<z.ZodString, string, string>;
        sessionId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        type: z.ZodLiteral<"run.completed">;
      },
      "strict",
      z.ZodTypeAny,
      {
        type: "run.completed";
        runId: string;
        sessionId?: string | undefined;
        summary?:
          | {
              usage?:
                | {
                    inputTokens?: number | undefined;
                    outputTokens?: number | undefined;
                    totalTokens?: number | undefined;
                    reasoningTokens?: number | undefined;
                    cachedInputTokens?: number | undefined;
                  }
                | undefined;
              text?: string | undefined;
            }
          | undefined;
      },
      {
        type: "run.completed";
        runId: string;
        sessionId?: string | undefined;
        summary?:
          | {
              usage?:
                | {
                    inputTokens?: number | undefined;
                    outputTokens?: number | undefined;
                    totalTokens?: number | undefined;
                    reasoningTokens?: number | undefined;
                    cachedInputTokens?: number | undefined;
                  }
                | undefined;
              text?: string | undefined;
            }
          | undefined;
      }
    >,
    z.ZodObject<
      {
        error: z.ZodObject<
          {
            code: z.ZodEffects<z.ZodString, string, string>;
            message: z.ZodEffects<z.ZodString, string, string>;
            component: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            operation: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            likelyCause: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            nextAction: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            retryable: z.ZodOptional<z.ZodBoolean>;
          },
          "strict",
          z.ZodTypeAny,
          {
            code: string;
            message: string;
            component?: string | undefined;
            operation?: string | undefined;
            likelyCause?: string | undefined;
            nextAction?: string | undefined;
            retryable?: boolean | undefined;
          },
          {
            code: string;
            message: string;
            component?: string | undefined;
            operation?: string | undefined;
            likelyCause?: string | undefined;
            nextAction?: string | undefined;
            retryable?: boolean | undefined;
          }
        >;
        runId: z.ZodEffects<z.ZodString, string, string>;
        sessionId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        type: z.ZodLiteral<"run.failed">;
      },
      "strict",
      z.ZodTypeAny,
      {
        type: "run.failed";
        runId: string;
        error: {
          code: string;
          message: string;
          component?: string | undefined;
          operation?: string | undefined;
          likelyCause?: string | undefined;
          nextAction?: string | undefined;
          retryable?: boolean | undefined;
        };
        sessionId?: string | undefined;
      },
      {
        type: "run.failed";
        runId: string;
        error: {
          code: string;
          message: string;
          component?: string | undefined;
          operation?: string | undefined;
          likelyCause?: string | undefined;
          nextAction?: string | undefined;
          retryable?: boolean | undefined;
        };
        sessionId?: string | undefined;
      }
    >,
    z.ZodObject<
      {
        runId: z.ZodEffects<z.ZodString, string, string>;
        sessionId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        type: z.ZodLiteral<"run.stopped">;
      },
      "strict",
      z.ZodTypeAny,
      {
        type: "run.stopped";
        runId: string;
        sessionId?: string | undefined;
      },
      {
        type: "run.stopped";
        runId: string;
        sessionId?: string | undefined;
      }
    >,
    z.ZodObject<
      {
        type: z.ZodLiteral<"reconnect.gap">;
        sessionId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        runId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        reason: z.ZodEffects<z.ZodString, string, string>;
      },
      "strict",
      z.ZodTypeAny,
      {
        reason: string;
        type: "reconnect.gap";
        runId?: string | undefined;
        sessionId?: string | undefined;
      },
      {
        reason: string;
        type: "reconnect.gap";
        runId?: string | undefined;
        sessionId?: string | undefined;
      }
    >,
    z.ZodObject<
      {
        type: z.ZodLiteral<"diagnostic.unknown">;
        sessionId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        raw: z.ZodEffects<
          z.ZodRecord<z.ZodString, z.ZodUnknown>,
          Record<string, unknown>,
          Record<string, unknown>
        >;
      },
      "strict",
      z.ZodTypeAny,
      {
        type: "diagnostic.unknown";
        raw: Record<string, unknown>;
        sessionId?: string | undefined;
      },
      {
        type: "diagnostic.unknown";
        raw: Record<string, unknown>;
        sessionId?: string | undefined;
      }
    >,
  ]
>;
