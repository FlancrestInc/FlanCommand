# ADR-005: Browser talks only to Barnabas

Status: Confirmed.

The browser never connects directly to Hermes. Barnabas owns authentication, authorization, origin policy, redaction, rate limits, and the server-side Hermes connection.
