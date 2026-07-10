import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";

/**
 * Lightweight abuse protection for the billable AI/TTS endpoints
 * (`/api/chat`, `/api/tts`). These call paid upstream providers
 * (Gemini/Groq/OpenRouter, Edge TTS), so they must not be left wide open
 * on the public internet.
 *
 * Two layers, both intentionally simple and dependency-free:
 * 1. Shared API key check — if `SHIZUKA_API_KEY` is configured, every
 *    request must present it via the `x-shizuka-api-key` header. If the
 *    env var is unset, the check is skipped (useful for local dev) but a
 *    warning is logged once so it doesn't go unnoticed.
 * 2. Fixed-window per-IP rate limiting — caps each client IP to a small
 *    number of requests per minute, since a single Shizuka companion app
 *    only ever needs to fire one chat/TTS call at a time.
 */

let hasWarnedAboutMissingApiKey = false;

function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const configuredKey = process.env.SHIZUKA_API_KEY;

  if (!configuredKey) {
    if (!hasWarnedAboutMissingApiKey) {
      hasWarnedAboutMissingApiKey = true;
      logger.warn(
        "SHIZUKA_API_KEY is not configured — /api/chat and /api/tts are unauthenticated. Set SHIZUKA_API_KEY before exposing this server publicly.",
      );
    }
    next();
    return;
  }

  const providedKey = req.header("x-shizuka-api-key");

  if (providedKey !== configuredKey) {
    req.log.warn({ ip: req.ip }, "Rejected request with missing/invalid Shizuka API key");
    res.status(401).json({ error: "Missing or invalid API key" });
    return;
  }

  next();
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

interface RateWindow {
  windowStartedAt: number;
  requestCount: number;
}

const rateWindowsByClient = new Map<string, RateWindow>();

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const clientKey = req.ip ?? "unknown";
  const now = Date.now();

  const existingWindow = rateWindowsByClient.get(clientKey);

  if (!existingWindow || now - existingWindow.windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
    rateWindowsByClient.set(clientKey, { windowStartedAt: now, requestCount: 1 });
    next();
    return;
  }

  if (existingWindow.requestCount >= RATE_LIMIT_MAX_REQUESTS) {
    req.log.warn({ ip: clientKey }, "Rate limit exceeded for Shizuka endpoint");
    res.status(429).json({ error: "Too many requests, please slow down" });
    return;
  }

  existingWindow.requestCount += 1;
  next();
}

/** Combined guard middleware: API key check, then rate limiting. */
export function shizukaGuard(req: Request, res: Response, next: NextFunction): void {
  requireApiKey(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    if (res.headersSent) {
      return;
    }
    rateLimit(req, res, next);
  });
}
