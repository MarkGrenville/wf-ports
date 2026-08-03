import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, type Plugin } from "vite";

const DAEMON_BASE = `http://127.0.0.1:${process.env.PORTIO_DAEMON_HTTP_PORT || 3853}`;

// The dashboard is a client-rendered SPA, so curling a route returns an empty
// shell. The docs are the one thing other processes need to read directly, so
// serve them here as plain markdown: /help.md and /help.txt always, and /help
// itself for clients that do not ask for HTML (curl, wget, agents).
function helpDocsPlugin(): Plugin {
  return {
    name: "portio-help-docs",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url || "").split("?")[0].replace(/\/$/, "");
        const isExplicit = pathname === "/help.md" || pathname === "/help.txt";
        const wantsHtml = (req.headers.accept || "").includes("text/html");
        if (!isExplicit && !(pathname === "/help" && !wantsHtml)) return next();

        try {
          const upstream = await fetch(`${DAEMON_BASE}/docs`);
          const markdown = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader(
            "content-type",
            pathname === "/help.txt" ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8",
          );
          res.end(markdown);
        } catch (err) {
          res.statusCode = 503;
          res.setHeader("content-type", "text/plain; charset=utf-8");
          res.end(
            `portio-daemon unreachable at ${DAEMON_BASE}: ${(err as Error).message}\n` +
              `Start it with: pm2 restart portio-daemon\n`,
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [sveltekit(), helpDocsPlugin()],
  server: {
    port: Number(process.env.PORT || 3850),
    strictPort: false,
    host: true,
    allowedHosts: true,
  },
});
