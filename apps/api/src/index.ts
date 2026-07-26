import { createApiServer } from "./server.js";

export { createApiServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
if (process.env.FLANC_COMMAND_START === "1") {
  const server = createApiServer();
  const host = process.env.FLANC_COMMAND_HOST ?? "127.0.0.1";
  server.listen(port, host, () => {
    console.log(`flancommand api listening on http://${host}:${port}`);
  });
}
