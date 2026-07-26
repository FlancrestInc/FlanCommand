# ADR-008: Store credential references only

Status: Confirmed.

The browser and database store references, not secrets. Credentials stay server-side. Logs, events, fixtures, and reports redact tokens, cookies, passwords, API keys, and URL credentials.
