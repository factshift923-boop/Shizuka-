import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";

// __dirname is provided by the esbuild banner (the bundle lives in dist/,
// so we step one level up to reach the project root's public/ directory).
const publicDir = path.join(__dirname, "../public");

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the dashboard at the artifact's preview root (/api and /api/).
// This must sit before the API router so it only intercepts the exact root
// without shadowing any of the /api/* endpoint routes.
app.get(["/api", "/api/"], (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use("/api", router);

export default app;
