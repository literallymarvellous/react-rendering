import Fastify, { FastifyInstance, FastifyReply } from "fastify";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ViteDevServer, createServer as createViteServer } from "vite";
import type { Handler, IncomingMessageExtended } from "@fastify/middie";
import connect from "connect";
import * as http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.log("dirname: ", __dirname);

const isTest = process.env.VITEST;

process.env.MY_CUSTOM_SECRET = "API_KEY_qwertyuiop";

export async function createServer(
  root: string,
  isProd: boolean,
  hmrPort?: number
) {
  const resolve = (p: string) => path.resolve(__dirname, p);

  const indexProd = isProd
    ? fs.readFileSync(resolve("dist/client/index.html"), "utf8")
    : "";

  const server: FastifyInstance = Fastify({ logger: true });
  await server.register(import("@fastify/middie"));

  let vite: ViteDevServer | null = null;
  if (!isProd) {
    vite = await createViteServer({
      root,
      logLevel: isTest ? "error" : "info",
      server: {
        middlewareMode: true,
        watch: {
          // During tests we edit the files too fast and sometimes chokidar
          // misses change events, so enforce polling for consistency
          usePolling: true,
          interval: 100,
        },
        hmr: {
          port: hmrPort,
        },
      },
      appType: "custom",
    });
    server.use(vite.middlewares);
  } else {
    await server.register(import("@fastify/compress"));
    await server.register(import("@fastify/static"), {
      root: resolve("dist/client"),
      index: false,
      // prefix: "/client/",
    });
  }

  const handler: Handler = async (
    req: connect.IncomingMessage & IncomingMessageExtended,
    res: http.ServerResponse
  ) => {
    try {
      const url = req.originalUrl!;
      console.log("url: ", url);

      let template: string;
      let render: (...args: any[]) => string;

      if (!isProd) {
        template = fs.readFileSync(resolve("index.html"), "utf-8");
        template = await vite!.transformIndexHtml(url, template);
        render = (await vite!.ssrLoadModule("./src/entry-server.tsx")).render;
      } else {
        template = indexProd;
        // @ts-ignore
        render = (await import("./dist/server/entry-server.js")).render;
      }

      const appHtml = render(url);

      const html = template.replace(`<!--app-html-->`, appHtml);

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html");
      res.end(html);
      // .status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      !isProd && vite!.ssrFixStacktrace(e);
      console.log(e.stack);
      res.statusCode = 500;
      res.end(e.stack);
    }
  };

  server.use("(.*)", handler);

  return { server, vite };
}

if (!isTest) {
  let root = process.cwd();
  let isProd = process.env.NODE_ENV === "production";
  createServer(root, isProd).then(({ server }) => {
    server.listen({ port: 3000 }, (err, address) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      console.log(`Server listening at ${address}`);
    });
  });
}
