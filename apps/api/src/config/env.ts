import { z } from "zod";

/** Normalize AI_PROVIDER and infer Gemini when the OpenAI key is still a placeholder. */
export function normalizeAiEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const e = { ...env };
  const raw = e.AI_PROVIDER != null ? String(e.AI_PROVIDER).trim().toLowerCase() : "";
  const gem = e.GEMINI_API_KEY != null ? String(e.GEMINI_API_KEY).trim() : "";
  const oai = e.OPENAI_API_KEY != null ? String(e.OPENAI_API_KEY).trim() : "";
  const openAiKeyLooksUnset =
    !oai ||
    oai === "sk-..." ||
    oai.includes("...") ||
    /^sk-(your-|xxx|changeme)/i.test(oai);

  if (raw === "gemini" || raw === "openai") {
    e.AI_PROVIDER = raw;
  } else if (!raw) {
    if (gem && openAiKeyLooksUnset) e.AI_PROVIDER = "gemini";
    else delete e.AI_PROVIDER;
  }

  if (e.GEMINI_CHAT_MODEL != null && String(e.GEMINI_CHAT_MODEL).trim() !== "") {
    const rawModel = String(e.GEMINI_CHAT_MODEL).trim();
    const id = rawModel.replace(/^models\//i, "");
    const lower = id.toLowerCase();
    const legacyChatModels: Record<string, string> = {
      "gemini-1.5-flash": "gemini-2.5-flash",
      "gemini-1.5-flash-latest": "gemini-2.5-flash",
      "gemini-1.5-flash-001": "gemini-2.5-flash",
      "gemini-1.5-pro": "gemini-2.5-flash",
      "gemini-1.5-pro-latest": "gemini-2.5-flash",
      "gemini-1.5-pro-001": "gemini-2.5-flash",
      "gemini-pro": "gemini-2.5-flash",
    };
    e.GEMINI_CHAT_MODEL = legacyChatModels[lower] ?? id;
  }

  return e;
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().default("0.0.0.0"),
    API_PORT: z.coerce.number().default(4000),
    LOG_LEVEL: z.string().default("info"),
    CORS_ORIGIN: z
      .string()
      .default("http://localhost:3000,http://127.0.0.1:3000"),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_MINUTES: z.coerce.number().default(15),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().default(7),
    BCRYPT_ROUNDS: z.coerce.number().min(10).max(14).default(12),
    AI_PROVIDER: z.enum(["openai", "gemini"]).default("openai"),
    OPENAI_API_KEY: z.string().optional().default(""),
    OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
    OPENAI_CHAT_MODEL: z.string().default("gpt-4o-mini"),
    GEMINI_API_KEY: z.string().optional().default(""),
    GEMINI_CHAT_MODEL: z.string().default("gemini-2.5-flash"),
    GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
    CHUNK_SIZE: z.coerce.number().min(200).max(8000).default(1200),
    CHUNK_OVERLAP: z.coerce.number().min(0).max(2000).default(200),
    EMBEDDING_BATCH_SIZE: z.coerce.number().min(1).max(128).default(64),
    EMBEDDING_DIMENSIONS: z.coerce.number().default(1536),
    UPLOAD_DIR: z.string().default("./uploads"),
    MAX_UPLOAD_MB: z.coerce.number().default(50),
    RATE_LIMIT_MAX: z.coerce.number().default(200),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
    /** Origin of the Next.js app hosting /embed (iframe target). */
    EMBED_WIDGET_ORIGIN: z.string().default("http://localhost:3000"),
    /** Public API base URL used in generated embed snippets. */
    PUBLIC_API_URL: z.string().default("http://localhost:4000"),
  })
  .superRefine((data, ctx) => {
    if (data.AI_PROVIDER === "openai" && !data.OPENAI_API_KEY?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OPENAI_API_KEY is required when AI_PROVIDER=openai",
        path: ["OPENAI_API_KEY"],
      });
    }
    if (data.AI_PROVIDER === "gemini" && !data.GEMINI_API_KEY?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GEMINI_API_KEY is required when AI_PROVIDER=gemini",
        path: ["GEMINI_API_KEY"],
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(normalizeAiEnv(env));
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    const custom = parsed.error.flatten().formErrors;
    throw new Error(`Invalid environment: ${JSON.stringify({ ...msg, form: custom })}`);
  }
  return parsed.data;
}
