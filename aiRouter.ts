import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import { logger } from "./logger";
import {
  buildSystemPrompt,
  buildOutageFallbackIntent,
  parseShizukaIntent,
  type ShizukaIntent,
  type ShizukaLanguage,
} from "./persona";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface RouteResult {
  intent: ShizukaIntent;
  providerUsed: "gemini" | "groq" | "openrouter" | "fallback";
}

export interface ChatContext {
  language?: ShizukaLanguage;
  userName?: string;
}

async function callGemini(
  userMessage: string,
  history: ChatTurn[],
  ctx: ChatContext,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.MODEL_NAME;

  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  if (!model) throw new Error("MODEL_NAME is not configured");

  const systemPrompt = buildSystemPrompt(ctx.language ?? "auto", ctx.userName ?? "");
  const ai = new GoogleGenAI({ apiKey });

  const contents = [
    ...history.map((turn) => ({
      role: turn.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: turn.content }],
    })),
    { role: "user" as const, parts: [{ text: userMessage }] },
  ];

  const response = await ai.models.generateContent({
    model,
    contents,
    config: { systemInstruction: systemPrompt, temperature: 0.9 },
  });

  const text = response.text;
  if (!text || text.trim().length === 0) throw new Error("Gemini returned an empty response");
  return text;
}

async function callGroq(
  userMessage: string,
  history: ChatTurn[],
  ctx: ChatContext,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.MODEL_NAME;

  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  if (!model) throw new Error("MODEL_NAME is not configured");

  const systemPrompt = buildSystemPrompt(ctx.language ?? "auto", ctx.userName ?? "");
  const groq = new Groq({ apiKey });

  const completion = await groq.chat.completions.create({
    model,
    temperature: 0.9,
    messages: [
      { role: "system", content: systemPrompt },
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user" as const, content: userMessage },
    ],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text || text.trim().length === 0) throw new Error("Groq returned an empty response");
  return text;
}

async function callOpenRouter(
  userMessage: string,
  history: ChatTurn[],
  ctx: ChatContext,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;

  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  if (!model) throw new Error("OPENROUTER_MODEL is not configured");

  const systemPrompt = buildSystemPrompt(ctx.language ?? "auto", ctx.userName ?? "");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((turn) => ({ role: turn.role, content: turn.content })),
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "<unreadable body>");
    throw new Error(`OpenRouter request failed with status ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text = data.choices?.[0]?.message?.content;
  if (!text || text.trim().length === 0) throw new Error("OpenRouter returned an empty response");
  return text;
}

function resolvePrimaryProvider(): "gemini" | "groq" {
  const raw = (process.env.AI_PROVIDER ?? "GEMINI").trim().toUpperCase();

  if (raw === "GROQ") return "groq";

  if (raw !== "GEMINI") {
    logger.warn({ AI_PROVIDER: raw }, "Unrecognized AI_PROVIDER value, defaulting to Gemini");
  }

  return "gemini";
}

export async function routeChatCompletion(
  userMessage: string,
  history: ChatTurn[] = [],
  ctx: ChatContext = {},
): Promise<RouteResult> {
  const primary = resolvePrimaryProvider();

  try {
    const raw =
      primary === "groq"
        ? await callGroq(userMessage, history, ctx)
        : await callGemini(userMessage, history, ctx);

    return { intent: parseShizukaIntent(raw), providerUsed: primary };
  } catch (primaryError) {
    logger.error({ err: primaryError, provider: primary }, "Primary AI provider failed, failing over to OpenRouter");

    try {
      const raw = await callOpenRouter(userMessage, history, ctx);
      return { intent: parseShizukaIntent(raw), providerUsed: "openrouter" };
    } catch (fallbackError) {
      logger.error({ err: fallbackError }, "OpenRouter failsafe also failed, returning outage fallback intent");
      return { intent: buildOutageFallbackIntent(userMessage), providerUsed: "fallback" };
    }
  }
}
