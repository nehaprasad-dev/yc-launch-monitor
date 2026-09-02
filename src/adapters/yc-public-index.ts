import type { Program } from "@prisma/client";

import type { CompanyRecordInput } from "../monitor/types.js";

const ALGOLIA_APP_ID = "45BWZJ1SGC";
const ALGOLIA_API_KEY =
  "NzllNTY5MzJiZGM2OTY2ZTQwMDEzOTNhYWZiZGRjODlhYzVkNjBmOGRjNzJiMWM4ZTU0ZDlhYTZjOTJiMjlhMWFuYWx5dGljc1RhZ3M9eWNkYyZyZXN0cmljdEluZGljZXM9WUNDb21wYW55X3Byb2R1Y3Rpb24lMkNZQ0NvbXBhbnlfQnlfTGF1bmNoX0RhdGVfcHJvZHVjdGlvbiZ0YWdGaWx0ZXJzPSU1QiUyMnljZGNfcHVibGljJTIyJTVE";
const ALGOLIA_INDEX = "YCCompany_By_Launch_Date_production";
const HITS_PER_PAGE = 250;

interface AlgoliaCompanyHit {
  name: string;
  slug?: string | null;
  website?: string | null;
  long_description?: string | null;
  one_liner?: string | null;
  batch?: string | null;
}

function toBatchLabel(batch?: string | null): string | null {
  if (!batch) {
    return null;
  }

  const trimmed = batch.trim();
  const shortMatch = trimmed.match(/^([SWF])(\d{2})$/i);
  if (shortMatch) {
    const [, seasonCode, year] = shortMatch;
    const season =
      seasonCode.toUpperCase() === "S" ? "Summer" : seasonCode.toUpperCase() === "W" ? "Winter" : "Fall";
    return `${season} 20${year}`;
  }

  return trimmed;
}

function normalizeBatch(batch?: string | null): string | null {
  if (!batch) {
    return null;
  }

  const trimmed = batch.trim();
  const match = trimmed.match(/^(Summer|Winter|Fall)\s+(\d{4})$/i);
  if (!match) {
    return trimmed;
  }

  const [, season, year] = match;
  const suffix = year.slice(-2);
  const prefix = season.toLowerCase() === "summer" ? "S" : season.toLowerCase() === "winter" ? "W" : "F";
  return `${prefix}${suffix}`;
}

function extractDomain(url?: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function buildFilters(filters: Array<string | null | undefined>): string {
  return filters.filter(Boolean).join(" AND ");
}

async function fetchPage(page: number, filters: string): Promise<{ hits: AlgoliaCompanyHit[]; nbPages: number }> {
  const response = await fetch(`https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-algolia-application-id": ALGOLIA_APP_ID,
      "x-algolia-api-key": ALGOLIA_API_KEY,
    },
    body: JSON.stringify({
      params: new URLSearchParams({
        query: "",
        hitsPerPage: String(HITS_PER_PAGE),
        page: String(page),
        filters,
      }).toString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`YC public index request failed with status ${response.status}`);
  }

  const json = (await response.json()) as { hits?: AlgoliaCompanyHit[]; nbPages?: number };
  return {
    hits: json.hits ?? [],
    nbPages: json.nbPages ?? 0,
  };
}

export async function fetchPublicCompanies(params: {
  program: Program;
  batch?: string | null;
  tag?: string | null;
}): Promise<CompanyRecordInput[]> {
  const filters = buildFilters([
    params.batch ? `batch:"${toBatchLabel(params.batch)}"` : null,
    params.tag ? `tags:"${params.tag}"` : null,
  ]);

  const seen = new Set<string>();
  const companies: CompanyRecordInput[] = [];
  const firstPage = await fetchPage(0, filters);
  const pages = Math.min(firstPage.nbPages || 1, 5);

  const appendHits = (hits: AlgoliaCompanyHit[]) => {
    for (const hit of hits) {
      const key = `${params.program}:${hit.slug ?? hit.name.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      companies.push({
        name: hit.name,
        slug: hit.slug ?? null,
        domain: extractDomain(hit.website),
        ycUrl: hit.slug ? `https://www.ycombinator.com/companies/${hit.slug}` : null,
        batch: normalizeBatch(hit.batch),
        program: params.program,
        description: hit.one_liner ?? hit.long_description ?? null,
      });
    }
  };

  appendHits(firstPage.hits);

  for (let page = 1; page < pages; page += 1) {
    const nextPage = await fetchPage(page, filters);
    appendHits(nextPage.hits);
  }

  return companies;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&#x2F;", "/")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export async function fetchPrimaryFounderName(ycUrl?: string | null): Promise<string | null> {
  if (!ycUrl) {
    return null;
  }

  const response = await fetch(ycUrl, {
    headers: {
      "user-agent": "yc-launch-monitor/0.1",
    },
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const foundersStart = html.indexOf("&quot;founders&quot;:[");

  if (foundersStart === -1) {
    return null;
  }

  const foundersSlice = html.slice(foundersStart, foundersStart + 5000);
  const nameMatch = foundersSlice.match(/&quot;full_name&quot;:&quot;([^&]+?)&quot;/);
  return nameMatch ? decodeHtmlEntities(nameMatch[1]).trim() : null;
}
