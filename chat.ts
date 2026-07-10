import { Router, type IRouter } from "express";
import { routeChatCompletion, type ChatTurn, type ChatContext } from "../lib/aiRouter";
import { shizukaGuard } from "../middlewares/shizukaGuard";
import type { ShizukaLanguage } from "../lib/persona";

const router: IRouter = Router();

router.use("/chat", shizukaGuard);

const VALID_LANGUAGES = new Set<string>(["hindi", "english", "hinglish", "auto"]);

function validateHistory(value: unknown): ChatTurn[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;

  const turns: ChatTurn[] = [];

  for (const entry of value) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      (entry as Record<string, unknown>).role === undefined ||
      (entry as Record<string, unknown>).content === undefined
    ) {
      return null;
    }

    const role = (entry as Record<string, unknown>).role;
    const content = (entry as Record<string, unknown>).content;

    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      return null;
    }

    turns.push({ role, content });
  }

  return turns;
}

/**
 * POST /api/chat
 *
 * Body:
 *   message  : string            — required, the user's spoken/typed message
 *   history  : ChatTurn[]        — optional conversation context
 *   language : string            — optional: "hindi"|"english"|"hinglish"|"auto" (default "auto")
 *   userName : string            — optional: user's name for personalization (default "Boss")
 *
 * Response: { action, target, message, reply, provider }
 */
router.post("/chat", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const { message } = body;

  if (typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "Field 'message' is required and must be a non-empty string" });
    return;
  }

  const history = validateHistory(body.history);
  if (history === null) {
    res.status(400).json({
      error: "Field 'history' must be an array of { role: 'user' | 'assistant', content: string }",
    });
    return;
  }

  // Optional personalization context
  const rawLanguage = typeof body.language === "string" ? body.language.toLowerCase().trim() : "auto";
  const language: ShizukaLanguage = VALID_LANGUAGES.has(rawLanguage)
    ? (rawLanguage as ShizukaLanguage)
    : "auto";

  const userName = typeof body.userName === "string" ? body.userName.trim().slice(0, 50) : "";

  const ctx: ChatContext = { language, userName };

  req.log.info({ historyLength: history.length, language, hasUserName: userName.length > 0 }, "Routing chat completion");

  const { intent, providerUsed } = await routeChatCompletion(message, history, ctx);

  req.log.info({ provider: providerUsed, action: intent.action }, "Chat completion resolved");

  res.json({
    action: intent.action,
    target: intent.target,
    message: intent.message,
    reply: intent.reply,
    provider: providerUsed,
  });
});

export default router;
