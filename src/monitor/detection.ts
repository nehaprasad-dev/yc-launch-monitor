import type { Program, SignalType, SourceName } from "@prisma/client";

import type { AlertDraft, ClassifiedSignal, CompanyRecordInput, FounderRecordInput, SocialPost } from "./types.js";

export interface DetectionContext {
  threshold: number;
  alreadyConfirmedCompany?: CompanyRecordInput | null;
  programOverride?: Program;
}

function normalizeKey(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function companyMatches(left?: CompanyRecordInput | null, right?: Partial<CompanyRecordInput> | null): boolean {
  if (!left || !right) {
    return false;
  }

  const leftSlug = normalizeKey(left.slug);
  const rightSlug = normalizeKey(right.slug);

  if (leftSlug && rightSlug && leftSlug === rightSlug) {
    return true;
  }

  const leftDomain = normalizeKey(left.domain);
  const rightDomain = normalizeKey(right.domain);

  if (leftDomain && rightDomain && leftDomain === rightDomain) {
    return true;
  }

  const leftName = normalizeKey(left.name);
  const rightName = normalizeKey(right.name);

  return Boolean(leftName && rightName && leftName === rightName);
}

export function buildFounderInput(post: SocialPost, classification: ClassifiedSignal): FounderRecordInput {
  return {
    name: classification.founderName?.trim() || post.authorName,
    handle: post.authorHandle,
    platform: post.platform,
    profileUrl: post.authorProfileUrl,
  };
}

export function buildCompanyInput(classification: ClassifiedSignal, programOverride?: Program): CompanyRecordInput | null {
  if (!classification.companyName?.trim()) {
    return null;
  }

  return {
    name: classification.companyName.trim(),
    domain: classification.companyDomain ?? null,
    batch: classification.batch ?? null,
    program: programOverride ?? classification.program ?? "YC",
  };
}

export function detectSocialAlert(
  post: SocialPost,
  classification: ClassifiedSignal,
  context: DetectionContext,
): AlertDraft | null {
  if (!classification.isFounderAnnouncement) {
    return null;
  }

  if (classification.confidence < context.threshold) {
    return null;
  }

  const company = buildCompanyInput(classification, context.programOverride);

  if (!company) {
    return null;
  }

  const founder = buildFounderInput(post, classification);
  const program = context.programOverride ?? classification.program ?? "YC";
  const confirmed = companyMatches(context.alreadyConfirmedCompany, company);

  let signalType: SignalType;
  let alertType: AlertDraft["alertType"];

  if (program === "SPEEDRUN") {
    signalType = "SPEEDRUN";
    alertType = "NEW_SPEEDRUN_COMPANY";
  } else if (confirmed) {
    signalType = "OFFICIAL_YC";
    alertType = "YC_CONFIRMED";
  } else {
    signalType = "EARLY_YC";
    alertType = "EARLY_YC_SIGNAL";
  }

  return {
    alertType,
    signalType,
    company,
    founder,
    platform: post.platform,
    externalId: post.externalId,
    url: post.url,
    text: post.text,
    confidence: classification.confidence,
    evidence: classification.evidence,
    detectedAt: post.detectedAt,
    batch: classification.batch ?? null,
  };
}

export function buildOfficialCompanyAlert(company: CompanyRecordInput, source: SourceName, detectedAt: Date): AlertDraft {
  return {
    alertType: company.program === "SPEEDRUN" ? "NEW_SPEEDRUN_COMPANY" : "NEW_YC_COMPANY",
    signalType: company.program === "SPEEDRUN" ? "SPEEDRUN" : "OFFICIAL_YC",
    company,
    founder: company.founderName
      ? {
          name: company.founderName,
          platform: source,
        }
      : undefined,
    platform: source,
    externalId: company.slug ?? company.domain ?? company.name,
    url: company.ycUrl ?? "",
    text: company.description ?? company.name,
    confidence: 1,
    evidence: [
      company.program === "SPEEDRUN" ? "Company listed in YC Speedrun source" : "Company listed in YC directory",
      company.batch ? `Batch detected: ${company.batch}` : "Batch unavailable",
    ],
    detectedAt,
    batch: company.batch ?? null,
  };
}

export function buildConfirmationAlert(company: CompanyRecordInput, source: SourceName, detectedAt: Date): AlertDraft {
  return {
    alertType: "YC_CONFIRMED",
    signalType: "OFFICIAL_YC",
    company,
    founder: company.founderName
      ? {
          name: company.founderName,
          platform: source,
        }
      : undefined,
    platform: source,
    externalId: `${company.slug ?? company.domain ?? company.name}:confirmed`,
    url: company.ycUrl ?? "",
    text: `${company.name} is now officially listed in ${company.batch ?? "YC"}.`,
    confidence: 1,
    evidence: [
      "Company is now officially present in the YC directory",
      company.batch ? `Batch detected: ${company.batch}` : "Batch unavailable",
    ],
    detectedAt,
    batch: company.batch ?? null,
  };
}
