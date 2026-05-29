import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Content } from "@google/generative-ai";
import OpenAI from "openai";
import type { FastifyReply } from "fastify";
import type { AppConfig } from "../../config/env.js";
import type { Message } from "../../infra/db/schema.js";
import { ConversationRepository } from "../documents/document.repository.js";
import { RetrievalService } from "../retrieval/retrieval.service.js";
import { UsageRepository } from "../usage/usage.repository.js";

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function parseGeminiRetryMs(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /Please retry in ([\d.]+)\s*s/i.exec(msg);
  if (m) return Math.ceil(Number.parseFloat(m[1]!) * 1000);
  return null;
}

function isGemini429OrQuota(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("429") ||
    msg.includes("Too Many Requests") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("Quota exceeded")
  );
}

async function withGemini429Retry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let a = 1; a <= attempts; a++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isGemini429OrQuota(e) || a === attempts) throw e;
      const base = parseGeminiRetryMs(e) ?? 20_000;
      await sleep(Math.min(base + 500, 120_000));
    }
  }
  throw last;
}

function formatGeminiUserError(e: unknown): { code: string; message: string } {
  const raw = e instanceof Error ? e.message : String(e);
  if (
    raw.includes("API_KEY_INVALID") ||
    raw.includes("API key not valid") ||
    /API Key not found/i.test(raw)
  ) {
    return {
      code: "GEMINI_API_KEY_INVALID",
      message:
        "Google rejected GEMINI_API_KEY. If your key starts with AQ., create a new key in AI Studio (Google often issues AIza… keys that work better with this app). Ensure the key is enabled for the Gemini API, has no IP/referrer restrictions blocking your server, and restart the API after updating the repo root .env. https://aistudio.google.com/apikey",
    };
  }
  if (raw.includes("limit: 0") && raw.includes("free_tier")) {
    return {
      code: "GEMINI_MODEL_QUOTA",
      message:
        "This Gemini model has no free-tier quota for your project (Google returned limit: 0). Set GEMINI_CHAT_MODEL to a current model ID (e.g. gemini-2.5-flash), update @google/generative-ai, or enable billing. See https://ai.google.dev/gemini-api/docs/models/gemini",
    };
  }
  if (isGemini429OrQuota(e)) {
    return {
      code: "GEMINI_RATE_LIMIT",
      message:
        "Gemini quota or rate limit (free tier is often tight per model). Wait and retry, set GEMINI_CHAT_MODEL to a supported model (e.g. gemini-2.5-flash), or enable billing in Google AI Studio. See https://ai.google.dev/gemini-api/docs/rate-limits",
    };
  }
  return { code: "STREAM_FAILED", message: raw.length > 2000 ? `${raw.slice(0, 2000)}…` : raw };
}

const SYSTEM_STATIC = `You are a workspace assistant for a Retrieval-Augmented Generation (RAG) product.
Rules:
- Use ONLY facts supported by CONTEXT. If CONTEXT is empty or insufficient, respond exactly with: "I could not find this in your workspace documents." Then ask one clarifying question.
- If you answer, cite filenames inline like [example.pdf] when you use information from a file.
- Never invent citations or document content.`;

/** Avoid sending the newly persisted user turn twice in the LLM payload (OpenAI loads history after insert). */
function trimTrailingUserEcho(history: Message[], pending: string): Message[] {
  const last = history[history.length - 1];
  if (last?.role === "user" && last.content === pending) return history.slice(0, -1);
  return history;
}

export type ChatActor =
  | { mode: "user"; userId: string }
  | { mode: "embed"; visitorId: string };

export type ChatStreamParams = {
  workspaceId: string;
  actor: ChatActor;
  conversationId?: string | null;
  message: string;
  reply: FastifyReply;
  reqId: string;
};

export class ChatService {
  private readonly openai: OpenAI | null;
  private readonly gemini: GoogleGenerativeAI | null;

  constructor(
    private readonly cfg: AppConfig,
    private readonly conversations: ConversationRepository,
    private readonly retrieval: RetrievalService,
    private readonly usage: UsageRepository,
  ) {
    this.openai =
      cfg.AI_PROVIDER === "openai" ? new OpenAI({ apiKey: cfg.OPENAI_API_KEY }) : null;
    this.gemini =
      cfg.AI_PROVIDER === "gemini"
        ? new GoogleGenerativeAI(cfg.GEMINI_API_KEY)
        : null;
  }

  private chatModelLabel() {
    return this.cfg.AI_PROVIDER === "gemini"
      ? this.cfg.GEMINI_CHAT_MODEL
      : this.cfg.OPENAI_CHAT_MODEL;
  }

  async streamChat(params: ChatStreamParams) {
    if (this.cfg.AI_PROVIDER === "gemini") {
      await this.streamGemini(params);
    } else {
      await this.streamOpenAI(params);
    }
  }

  private async streamOpenAI(params: ChatStreamParams) {
    const sse = (obj: unknown) => {
      params.reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`);
    };
    if (!this.openai) {
      sse({ type: "error", code: "CONFIG", message: "OpenAI not configured" });
      params.reply.raw.end();
      return;
    }

    try {
      const { conversation, hits } = await this.prepareConversation(params);
      if (!conversation) return;

      await this.conversations.addMessage({
        conversationId: conversation.id,
        role: "user",
        content: params.message,
      });

      const history = await this.conversations.recentMessages(conversation.id, 12);
      const historyForModel = trimTrailingUserEcho(history, params.message);

      const context = this.buildContext(hits);

      const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: `${SYSTEM_STATIC}\n\nCONTEXT:\n${context || "[EMPTY]"}`,
        },
        ...historyForModel
          .filter((m: Message) => m.role === "user" || m.role === "assistant")
          .map((m: Message) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        { role: "user", content: params.message },
      ];

      const stream = await this.openai.chat.completions.create({
        model: this.cfg.OPENAI_CHAT_MODEL,
        messages: msgs,
        stream: true,
        temperature: 0.2,
        stream_options: { include_usage: true },
      });

      let buffer = "";
      let promptTokens = 0;
      let completionTokens = 0;
      for await (const part of stream) {
        const delta = part.choices[0]?.delta?.content ?? "";
        if (delta) {
          buffer += delta;
          sse({ type: "token", value: delta });
        }
        const usage = part.usage;
        if (usage) {
          promptTokens = usage.prompt_tokens ?? promptTokens;
          completionTokens = usage.completion_tokens ?? completionTokens;
        }
      }

      await this.finishChatTurn({
        sse,
        conversation,
        hits,
        buffer,
        promptTokens,
        completionTokens,
        params,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "stream_failed";
      sse({ type: "error", code: "STREAM_FAILED", message });
    } finally {
      params.reply.raw.end();
    }
  }

  private async streamGemini(params: ChatStreamParams) {
    const sse = (obj: unknown) => {
      params.reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`);
    };
    if (!this.gemini) {
      sse({ type: "error", code: "CONFIG", message: "Gemini not configured" });
      params.reply.raw.end();
      return;
    }

    try {
      const { conversation, hits } = await this.prepareConversation(params);
      if (!conversation) return;

      const history = await this.conversations.recentMessages(conversation.id, 12);

      await this.conversations.addMessage({
        conversationId: conversation.id,
        role: "user",
        content: params.message,
      });

      const context = this.buildContext(hits);

      const model = this.gemini.getGenerativeModel({
        model: this.cfg.GEMINI_CHAT_MODEL,
        systemInstruction: `${SYSTEM_STATIC}\n\nCONTEXT:\n${context || "[EMPTY]"}`,
      });

      const past: Content[] = history
        .filter((m: Message) => m.role === "user" || m.role === "assistant")
        .map((m: Message) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.content }],
        }));

      const chat = model.startChat({ history: past });
      const stream = await withGemini429Retry(() => chat.sendMessageStream(params.message));

      let buffer = "";
      let promptTokens = 0;
      let completionTokens = 0;
      for await (const chunk of stream.stream) {
        const delta = chunk.text();
        if (delta) {
          buffer += delta;
          sse({ type: "token", value: delta });
        }
        const u = chunk.usageMetadata;
        if (u) {
          promptTokens = u.promptTokenCount ?? promptTokens;
          completionTokens = u.candidatesTokenCount ?? completionTokens;
        }
      }

      await this.finishChatTurn({
        sse,
        conversation,
        hits,
        buffer,
        promptTokens,
        completionTokens,
        params,
      });
    } catch (e) {
      const { code, message } = formatGeminiUserError(e);
      sse({ type: "error", code, message });
    } finally {
      params.reply.raw.end();
    }
  }

  private buildContext(
    hits: Awaited<ReturnType<RetrievalService["retrieve"]>>,
  ) {
    return hits
      .map(
        (h, i) =>
          `[[#${i + 1}]] file="${h.filename}" chunk="${h.id}"\n${h.content}`,
      )
      .join("\n\n---\n\n");
  }

  private conversationAllowed(
    conversation: NonNullable<Awaited<ReturnType<ConversationRepository["findById"]>>>,
    workspaceId: string,
    actor: ChatActor,
  ) {
    if (conversation.workspaceId !== workspaceId) return false;
    if (actor.mode === "user") {
      return conversation.userId === actor.userId;
    }
    return conversation.visitorId === actor.visitorId;
  }

  private async prepareConversation(params: ChatStreamParams) {
    const sse = (obj: unknown) => {
      params.reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`);
    };
    let conversation = params.conversationId
      ? await this.conversations.findById(params.conversationId)
      : null;
    if (conversation && !this.conversationAllowed(conversation, params.workspaceId, params.actor)) {
      sse({ type: "error", code: "FORBIDDEN" });
      return { conversation: null, hits: [] as Awaited<ReturnType<RetrievalService["retrieve"]>> };
    }
    if (!conversation) {
      conversation = await this.conversations.create({
        workspaceId: params.workspaceId,
        userId: params.actor.mode === "user" ? params.actor.userId : null,
        visitorId: params.actor.mode === "embed" ? params.actor.visitorId : null,
        title: params.message.slice(0, 120),
      });
      sse({ type: "conversation", conversationId: conversation.id });
    }

    const hits = await this.retrieval.retrieve({
      workspaceId: params.workspaceId,
      query: params.message,
      topK: 8,
    });

    return { conversation, hits };
  }

  private async finishChatTurn(input: {
    sse: (obj: unknown) => void;
    conversation: NonNullable<Awaited<ReturnType<ConversationRepository["findById"]>>>;
    hits: Awaited<ReturnType<RetrievalService["retrieve"]>>;
    buffer: string;
    promptTokens: number;
    completionTokens: number;
    params: ChatStreamParams;
  }) {
    const { sse, conversation, hits, buffer, promptTokens, completionTokens, params } =
      input;
    const citations = hits.map((h) => ({
      chunkId: h.id,
      documentId: h.documentId,
      filename: h.filename,
      page: typeof h.metadata?.page === "number" ? h.metadata.page : undefined,
      section: typeof h.metadata?.section === "string" ? h.metadata.section : undefined,
      snippet: h.content.slice(0, 400),
    }));

    const modelLabel = this.chatModelLabel();

    await this.conversations.addMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: buffer,
      metadata: { citations, model: modelLabel },
      promptTokens: promptTokens || null,
      completionTokens: completionTokens || null,
    });

    await this.conversations.touch(conversation.id);

    await this.usage.log({
      userId: params.actor.mode === "user" ? params.actor.userId : null,
      workspaceId: params.workspaceId,
      kind: params.actor.mode === "embed" ? "embed_chat_completion" : "chat_completion",
      model: modelLabel,
      promptTokens: promptTokens || null,
      completionTokens: completionTokens || null,
      metadata: {
        reqId: params.reqId,
        conversationId: conversation.id,
        visitorId: params.actor.mode === "embed" ? params.actor.visitorId : undefined,
      },
    });

    sse({ type: "done", conversationId: conversation.id });
  }
}
