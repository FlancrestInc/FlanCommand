# Contributing

Use a short branch name with the work area first, such as `foundation/env-parser`
or `adapter/reconnect`. Keep commits small and describe one logical change in
the subject, such as `config: validate probe limits`.

Run `pnpm check` before opening a change. The local development command is
`pnpm dev`; it starts the placeholder API and web containers only.

Never commit `.env` files, secrets, probe output, transcripts, or local state.
Live probe output must stay local and be reviewed for secrets before sharing.
