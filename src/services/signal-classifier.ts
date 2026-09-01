import OpenAI from "openai";
import { z } from "zod";

import { env } from "../config/env.js";
import type { ClassifiedSignal, SignalClassifier, SocialPost } from "../monitor/types.js";

const classifierResponseSchema = z.object({
  isFounderAnnouncement: z.boolean(),
  companyName: z.string().nullable().optional(),
  companyDomain: z.string().nullable().optional(),
  founderName: z.string().nullable().optional(),
  batch: z.string().nullable().optional(),
  program: z.enum(["YC", "SPEEDRUN"]).nullable().optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).default([]),
  reasoning: z.string().nullable().optional(),
});

const companyNameStopWords = new Set(["I", "We", "YC", "Y Combinator", "Speedrun"]);

function cleanCompanyName(value?: string | null): string | null {
  const cleaned = value?.replace(/[.!?,:;]+$/g, "").trim();

  if (!cleaned || companyNameStopWords.has(cleaned)) {
    return null;
  }

  return cleaned;
}

function extractHeuristicCompanyName(post: SocialPost): string | null {
  const patterns = [
    /\b([A-Z][A-Za-z0-9&-]*(?:\s+[A-Z][A-Za-z0-9&-]*){0,3})\s+(?:is|are)\s+(?:joining|accepted|backed|launching)\b/,
    /\b(?:at|for|building)\s+([A-Z][A-Za-z0-9&-]*(?:\s+[A-Z][A-Za-z0-9&-]*){0,3})\b/,
    /\b([A-Z][A-Za-z0-9&-]*(?:\s+[A-Z][A-Za-z0-9&-]*){0,3})\s+(?:got into|was accepted into)\s+(?:YC|Y Combinator|Speedrun)\b/,
  ];

  for (const pattern of patterns) {
    const match = post.text.match(pattern);
    const companyName = cleanCompanyName(match?.[1]);

    if (companyName) {
      return companyName;
    }
  }

  return null;
}

export class HeuristicSignalClassifier implements SignalClassifier {
  async classify(post: SocialPost): Promise<ClassifiedSignal> {
    const text = post.text.toLowerCase();
    const ycMatch = text.match(/\b(yc|y combinator|speedrun)\b/);
    const batchMatch = post.text.match(/\b([SW]\d{2})\b/i);
    const acceptanceLanguage = /(got into|joining|accepted into|we got into|backed by y combinator|we're joining)/i.test(post.text);
    const founderLanguage = /\b(we|our company|i built|my cofounder|our startup)\b/i.test(post.text);
    const companyName = extractHeuristicCompanyName(post);

    const evidence: string[] = [];

    if (ycMatch) {
      evidence.push(`Program language detected: ${ycMatch[0]}`);
    }
    if (batchMatch) {
      evidence.push(`Batch detected: ${batchMatch[1].toUpperCase()}`);
    }
    if (acceptanceLanguage) {
      evidence.push("Acceptance-style announcement phrasing detected");
    }
    if (founderLanguage) {
      evidence.push("First-person founder-style language detected");
    }

    const confidence = [ycMatch, batchMatch, acceptanceLanguage, founderLanguage].filter(Boolean).length / 4;
    const isFounderAnnouncement = Boolean(ycMatch && acceptanceLanguage && founderLanguage);
    const program = /speedrun/i.test(post.text) ? "SPEEDRUN" : "YC";

    return {
      isFounderAnnouncement,
      companyName,
      founderName: post.authorName,
      batch: batchMatch?.[1]?.toUpperCase() ?? null,
      program,
      confidence,
      evidence,
      reasoning: "Heuristic fallback classifier",
    };
  }
}

interface OpenAiCompatibleClassifierOptions {
  apiKey: string;
  model: string;
  providerName: "OpenAI" | "Groq";
  baseURL?: string;
}

export class OpenAiCompatibleSignalClassifier implements SignalClassifier {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly providerName: "OpenAI" | "Groq";
  private readonly fallback = new HeuristicSignalClassifier();

  constructor(options: OpenAiCompatibleClassifierOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
    this.model = options.model;
    this.providerName = options.providerName;
  }

  async classify(post: SocialPost): Promise<ClassifiedSignal> {
    const fallback = await this.fallback.classify(post);
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Classify social posts for YC Launch Monitor.",
              "Return only valid JSON.",
              "Decide whether the post is a founder-led acceptance or launch announcement for YC or Speedrun.",
              "Extract companyName, companyDomain, founderName, batch, program, confidence, evidence, and reasoning.",
              "If the post is not a founder announcement, set isFounderAnnouncement to false.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify(
              {
                authorName: post.authorName,
                authorHandle: post.authorHandle,
                text: post.text,
                url: post.url,
                fallback,
              },
              null,
              2,
            ),
          },
        ],
      });

      const outputText = completion.choices[0]?.message?.content?.trim();

      if (!outputText) {
        return {
          ...fallback,
          reasoning: `${this.providerName} returned an empty response. Using heuristic fallback.`,
        };
      }

      return classifierResponseSchema.parse(JSON.parse(outputText));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown classifier error";
      return {
        ...fallback,
        reasoning: `${this.providerName} classification failed: ${message}. Using heuristic fallback.`,
      };
    }
  }
}

export function createSignalClassifier(): SignalClassifier {
  if (env.LLM_PROVIDER === "heuristic") {
    return new HeuristicSignalClassifier();
  }

  if (env.LLM_PROVIDER === "groq") {
    return new OpenAiCompatibleSignalClassifier({
      apiKey: env.GROQ_API_KEY!,
      model: env.GROQ_MODEL,
      baseURL: "https://api.groq.com/openai/v1",
      providerName: "Groq",
    });
  }

  if (env.LLM_PROVIDER === "openai") {
    return new OpenAiCompatibleSignalClassifier({
      apiKey: env.OPENAI_API_KEY!,
      model: env.OPENAI_MODEL,
      providerName: "OpenAI",
    });
  }

  if (env.GROQ_API_KEY) {
    return new OpenAiCompatibleSignalClassifier({
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_MODEL,
      baseURL: "https://api.groq.com/openai/v1",
      providerName: "Groq",
    });
  }

  if (env.OPENAI_API_KEY) {
    return new OpenAiCompatibleSignalClassifier({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      providerName: "OpenAI",
    });
  }

  return new HeuristicSignalClassifier();
}
