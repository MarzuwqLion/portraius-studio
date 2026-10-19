/// <reference types="vitest/config" />
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { connectSources } from "./src/lib/router/hosts.ts";

const src = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

// The CSP goes into the built page only: the dev server needs inline scripts
// and a websocket for hot reload.
function contentSecurityPolicy(env: Record<string, string>): Plugin {
  const connect = connectSources({
    routerBaseUrl: env.VITE_ROUTER_BASE_URL,
    workerUrl: env.VITE_WORKER_URL,
  });
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob: data:",
    `connect-src 'self' blob: data: ${connect.join(" ")}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join("; ");
  return {
    name: "portraius-csp",
    apply: "build",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" },
    ],
  };
}

// Dev server only: the M1 check panel posts its results here so they land in
// .checks/ (gitignored) instead of being copied by hand. Never part of a build.
function devCheckResults(): Plugin {
  return {
    name: "portraius-dev-check-results",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__dev/m1-checks", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        req.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size <= 2_000_000) chunks.push(chunk);
        });
        req.on("end", () => {
          const dir = fileURLToPath(new URL("./.checks/", import.meta.url));
          mkdirSync(dir, { recursive: true });
          writeFileSync(`${dir}m1-browser.json`, Buffer.concat(chunks));
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    base: env.VITE_BASE || "/portraius-studio/",
    plugins: [react(), tailwindcss(), contentSecurityPolicy(env), devCheckResults()],
    resolve: {
      alias: [
        { find: /^@\//, replacement: src("") },
        { find: /^node:crypto$/, replacement: src("shims/node-crypto.ts") },
        { find: /^node:(fs|fs\/promises|path|stream|stream\/promises)$/, replacement: src("shims/empty.ts") },
      ],
    },
    test: {
      include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}", "proxy/src/**/*.test.ts"],
      environment: "node",
      setupFiles: ["test/setup.ts"],
    },
  };
});
