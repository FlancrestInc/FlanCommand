# ADR-009: Redact before persistence or display

Status: Confirmed for the adapter and probe.

Redact recursively before normalized events leave the adapter. Bounded stream tails handle secrets split across frames. Raw protocol frames are never a browser or persistence contract.
