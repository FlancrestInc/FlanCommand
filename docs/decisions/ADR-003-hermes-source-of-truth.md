# ADR-003: Keep Hermes as session source of truth

Status: Provisional until live Telegram checks.

Hermes owns sessions, runs, model state, and memory state. Barnabas may store product metadata and indexes, but must not silently fork Hermes conversation state.
