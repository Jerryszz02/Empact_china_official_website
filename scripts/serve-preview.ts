import { resolve } from "node:path";
import { createPublicServer } from "./public-server.js";

const port = Number(process.env.PREVIEW_PORT ?? 4321);

// Local visual acceptance uses the real public server and its production CSP.
createPublicServer({
  root: resolve("apps/site/dist"),
  origin: `http://127.0.0.1:${port}`,
}).listen(port, "127.0.0.1", () =>
  console.log(`Local static preview: http://127.0.0.1:${port}`),
);
