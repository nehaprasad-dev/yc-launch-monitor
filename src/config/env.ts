import "dotenv/config";
import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    APP_BASE_URL: z.string().url().default("http://localhost:3000"),
    POLL_INTERVAL_HOURS: z.coerce.number().positive().default(8),
    EARLY_SIGNAL_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
    RUN_ON_BOOT: booleanFromEnv.default(false),
    ENABLE_DEMO_MODE: booleanFromEnv.default(false),
    YC_DIRECTORY_URL: z.string().url(),
    YC_DIRECTORY_BATCHES: z.string().default("S26"),
    YC_SPEEDRUN_URL: z.string().url(),
    X_BEARER_TOKEN: z.string().optional(),
    X_QUERIES: z.string().default(""),
    ENABLE_X_SOURCE: booleanFromEnv.default(false),
    LINKEDIN_ENABLED: booleanFromEnv.default(false),
    LINKEDIN_ACCESS_TOKEN: z.string().optional(),
    LINKEDIN_POSTS_ENDPOINT: z.string().optional(),
    SLACK_BOT_TOKEN: z.string().optional(),
    SLACK_CHANNEL_ID: z.string().optional(),
    SLACK_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
    LLM_PROVIDER: z.enum(["auto", "heuristic", "openai", "groq"]).default("auto"),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
    GROQ_API_KEY: z.string().optional(),
    GROQ_MODEL: z.string().default("openai/gpt-oss-20b"),
    POND_BEARER_TOKEN: z.string().optional(),
  })
  .superRefine((data, context) => {
    if (data.LLM_PROVIDER === "openai" && !data.OPENAI_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY is required when LLM_PROVIDER=openai",
      });
    }

    if (data.LLM_PROVIDER === "groq" && !data.GROQ_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GROQ_API_KEY"],
        message: "GROQ_API_KEY is required when LLM_PROVIDER=groq",
      });
    }
  });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(`Invalid environment configuration: ${parsedEnv.error.message}`);
}

export const env = {
  ...parsedEnv.data,
  SLACK_WEBHOOK_URL: parsedEnv.data.SLACK_WEBHOOK_URL || undefined,
  ycDirectoryBatches: parsedEnv.data.YC_DIRECTORY_BATCHES.split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  xQueries: parsedEnv.data.X_QUERIES.split("||")
    .map((value) => value.trim())
    .filter(Boolean),
};
