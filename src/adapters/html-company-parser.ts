import { load } from "cheerio";

import type { CompanyRecordInput } from "../monitor/types.js";

function normalizeText(value?: string | null): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text : null;
}

function extractDomain(url?: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function inferBatch(text?: string | null): string | null {
  if (!text) {
    return null;
  }

  const match = text.match(/\b([SW]\d{2})\b/i);
  return match ? match[1].toUpperCase() : null;
}

export function parseCompanyCards(
  html: string,
  program: "YC" | "SPEEDRUN",
  fallbackUrl: string,
  fallbackBatch?: string | null,
): CompanyRecordInput[] {
  const $ = load(html);
  const seen = new Set<string>();
  const companies: CompanyRecordInput[] = [];

  $("a[href*=\"/companies/\"]").each((_, element) => {
    const href = $(element).attr("href");
    const name = normalizeText($(element).find("span, h2, h3, h4, div").first().text()) ?? normalizeText($(element).text());

    if (!href || !name) {
      return;
    }

    const ycUrl = href.startsWith("http") ? href : new URL(href, fallbackUrl).toString();
    const slug = ycUrl.split("/companies/")[1]?.split(/[?#]/)[0]?.replace(/\/$/, "") ?? null;
    const cardText = normalizeText($(element).text()) ?? "";
    const websiteHref =
      $(element).find("a[href^=\"http\"]").last().attr("href") ??
      $(element).closest("div, li, article").find("a[href^=\"http\"]").last().attr("href") ??
      null;
    const domain = extractDomain(websiteHref);
    const description =
      normalizeText($(element).closest("div, li, article").find("p").first().text()) ??
      normalizeText($(element).siblings("p").first().text());
    const batch = fallbackBatch ?? inferBatch(cardText);
    const key = `${program}:${slug ?? domain ?? name.toLowerCase()}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    companies.push({
      name,
      slug,
      domain,
      ycUrl,
      batch,
      program,
      description,
    });
  });

  return companies;
}
