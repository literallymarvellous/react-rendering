import Fastify, { FastifyInstance, FastifyReply } from "fastify";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ViteDevServer, createServer as createViteServer } from "vite";
import type { Handler, IncomingMessageExtended } from "@fastify/middie";
import connect from "connect";
import * as http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isTest = process.env.VITEST;

export async function createServer(root: string, isProd: boolean) {
  const server: FastifyInstance = Fastify({ logger: false });
  await server.register(import("@fastify/middie"));

  let vite: ViteDevServer | null = null;

  vite = await createViteServer({
    root,
    logLevel: isTest ? "error" : "info",
    server: {
      middlewareMode: true,
      hmr: true,
    },
  });
  server.use(vite.middlewares);

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
