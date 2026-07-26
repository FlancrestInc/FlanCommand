# ADR-001: Use the Hermes TUI gateway

Status: Confirmed for Phase 1.

Use Hermes `serve` JSON-RPC over WebSocket as the primary integration. The native gateway exposes sessions, streamed events, tools, approvals, and status. The exact protocol remains release-sensitive, so raw frames stay inside the adapter.
