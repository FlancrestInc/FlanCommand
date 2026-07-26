# ADR-002: Isolate Hermes behind an adapter

Status: Confirmed.

Keep Hermes protocol details in `packages/hermes-adapter`. The API and browser consume normalized event-schema types. This limits protocol drift and keeps redaction at the boundary.
