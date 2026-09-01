import { describe, expect, it } from "vitest";

import { buildConfirmationAlert, companyMatches, detectSocialAlert } from "../src/monitor/detection.js";
import { HeuristicSignalClassifier } from "../src/services/signal-classifier.js";
import type { ClassifiedSignal, CompanyRecordInput, SocialPost } from "../src/monitor/types.js";

function post(overrides: Partial<SocialPost> = {}): SocialPost {
  return {
    platform: "X",
    externalId: "tweet-1",
    authorName: "Jane Doe",
    authorHandle: "@janedoe",
    authorProfileUrl: "https://x.com/janedoe",
    text: "We got into YC S26. Acme AI is joining YC.",
    url: "https://x.com/janedoe/status/1",
    detectedAt: new Date("2026-08-31T08:00:00.000Z"),
    ...overrides,
  };
}

function classification(overrides: Partial<ClassifiedSignal> = {}): ClassifiedSignal {
  return {
    isFounderAnnouncement: true,
    companyName: "Acme AI",
    founderName: "Jane Doe",
    companyDomain: "acme.ai",
    batch: "S26",
    program: "YC",
    confidence: 0.94,
    evidence: ["Founder account", "Explicit YC S26 phrase", "Company mentioned"],
    reasoning: null,
    ...overrides,
  };
}

const officialCompany: CompanyRecordInput = {
  name: "Acme AI",
  slug: "acme-ai",
  domain: "acme.ai",
  batch: "S26",
  program: "YC",
};

describe("detectSocialAlert", () => {
  it("creates an early signal when founder post is not officially listed", () => {
    const result = detectSocialAlert(post(), classification(), {
      threshold: 0.85,
      alreadyConfirmedCompany: null,
    });

    expect(result?.signalType).toBe("EARLY_YC");
    expect(result?.alertType).toBe("EARLY_YC_SIGNAL");
  });

  it("creates a confirmation signal when YC already lists the company", () => {
    const result = detectSocialAlert(post(), classification(), {
      threshold: 0.85,
      alreadyConfirmedCompany: officialCompany,
    });

    expect(result?.signalType).toBe("OFFICIAL_YC");
    expect(result?.alertType).toBe("YC_CONFIRMED");
  });

  it("rejects non-founder chatter", () => {
    const result = detectSocialAlert(
      post({
        authorName: "Random Person",
        text: "YC S26 looks great this year.",
      }),
      classification({
        isFounderAnnouncement: false,
        confidence: 0.91,
      }),
      {
        threshold: 0.85,
        alreadyConfirmedCompany: null,
      },
    );

    expect(result).toBeNull();
  });

  it("rejects ambiguous low-confidence posts", () => {
    const result = detectSocialAlert(
      post({
        text: "Thinking about applying to YC soon.",
      }),
      classification({
        confidence: 0.4,
      }),
      {
        threshold: 0.85,
        alreadyConfirmedCompany: null,
      },
    );

    expect(result).toBeNull();
  });
});

describe("companyMatches", () => {
  it("matches companies by domain when names drift", () => {
    expect(
      companyMatches(officialCompany, {
        name: "Acme",
        domain: "acme.ai",
      }),
    ).toBe(true);
  });
});

describe("buildConfirmationAlert", () => {
  it("creates a non-duplicate confirmation-style alert payload", () => {
    const result = buildConfirmationAlert(officialCompany, "YC_DIRECTORY", new Date("2026-08-31T10:00:00.000Z"));

    expect(result.alertType).toBe("YC_CONFIRMED");
    expect(result.externalId).toContain("confirmed");
  });
});

describe("HeuristicSignalClassifier", () => {
  it("extracts the announced company instead of first-person announcement words", async () => {
    const classifier = new HeuristicSignalClassifier();
    const result = await classifier.classify(post());

    expect(result.companyName).toBe("Acme AI");
    expect(result.companyName).not.toBe("We");
  });
});
