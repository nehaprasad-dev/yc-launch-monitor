import type { AlertType, Company, Company as PrismaCompany, Founder, MonitorRunStatus, Program, Signal, SourceName } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { prisma } from "../db.js";
import { companyMatches } from "../monitor/detection.js";
import type { AlertDraft, CompanyRecordInput, FounderRecordInput, SourceHealthSummary } from "../monitor/types.js";

function toNullableString(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toJsonValue(value?: Record<string, unknown> | unknown) {
  return value ? (value as Prisma.InputJsonValue) : Prisma.JsonNull;
}

function companyIdentifierWhere(company: CompanyRecordInput): Prisma.CompanyWhereInput {
  const clauses: Prisma.CompanyWhereInput[] = [{ name: company.name, program: company.program }];

  if (company.slug) {
    clauses.unshift({ slug: company.slug, program: company.program });
  }

  if (company.domain) {
    clauses.unshift({ domain: company.domain, program: company.program });
  }

  return { OR: clauses };
}

function mapCompany(record: PrismaCompany): CompanyRecordInput {
  return {
    name: record.name,
    slug: record.slug,
    domain: record.domain,
    ycUrl: record.ycUrl,
    batch: record.batch,
    program: record.program,
    description: record.description,
    officialConfirmedAt: record.officialConfirmedAt ?? undefined,
  };
}

export class MonitorRepository {
  async findSourceSnapshot(source: SourceName) {
    return prisma.sourceSnapshot.findUnique({
      where: { source },
    });
  }

  async upsertSourceSnapshot(params: {
    source: SourceName;
    cursor?: string | null;
    lastSeenAt?: Date;
    healthy: boolean;
    errorReason?: string;
    metadata?: Record<string, unknown>;
  }) {
    return prisma.sourceSnapshot.upsert({
      where: { source: params.source },
      update: {
        cursor: params.cursor ?? undefined,
        lastSeenAt: params.lastSeenAt,
        lastSuccessAt: params.healthy ? new Date() : undefined,
        lastErrorAt: params.healthy ? null : new Date(),
        lastErrorReason: params.healthy ? null : params.errorReason,
        metadata: toJsonValue(params.metadata),
      },
      create: {
        source: params.source,
        cursor: params.cursor,
        lastSeenAt: params.lastSeenAt,
        lastSuccessAt: params.healthy ? new Date() : null,
        lastErrorAt: params.healthy ? null : new Date(),
        lastErrorReason: params.healthy ? null : params.errorReason,
        metadata: toJsonValue(params.metadata),
      },
    });
  }

  async findCompanyByInput(company: CompanyRecordInput): Promise<Company | null> {
    const existing = await prisma.company.findFirst({
      where: companyIdentifierWhere(company),
      orderBy: { createdAt: "asc" },
    });

    if (!existing) {
      return null;
    }

    return existing;
  }

  async upsertCompany(company: CompanyRecordInput, official: boolean): Promise<Company> {
    const existing = await this.findCompanyByInput(company);

    if (!existing) {
      return prisma.company.create({
        data: {
          name: company.name,
          slug: toNullableString(company.slug),
          domain: toNullableString(company.domain),
          ycUrl: toNullableString(company.ycUrl),
          batch: toNullableString(company.batch),
          program: company.program,
          description: toNullableString(company.description),
          officialConfirmedAt: official ? company.officialConfirmedAt ?? new Date() : null,
        },
      });
    }

    return prisma.company.update({
      where: { id: existing.id },
      data: {
        name: company.name,
        slug: toNullableString(company.slug) ?? existing.slug,
        domain: toNullableString(company.domain) ?? existing.domain,
        ycUrl: toNullableString(company.ycUrl) ?? existing.ycUrl,
        batch: toNullableString(company.batch) ?? existing.batch,
        program: company.program,
        description: toNullableString(company.description) ?? existing.description,
        officialConfirmedAt: official ? existing.officialConfirmedAt ?? company.officialConfirmedAt ?? new Date() : existing.officialConfirmedAt,
      },
    });
  }

  async upsertFounder(founder: FounderRecordInput, companyId?: string): Promise<Founder> {
    const handle = toNullableString(founder.handle);

    if (handle) {
      const existing = await prisma.founder.findUnique({
        where: {
          platform_handle: {
            platform: founder.platform,
            handle,
          },
        },
      });

      if (existing) {
        return prisma.founder.update({
          where: { id: existing.id },
          data: {
            name: founder.name,
            profileUrl: toNullableString(founder.profileUrl) ?? existing.profileUrl,
            companyId: companyId ?? existing.companyId,
          },
        });
      }
    }

    return prisma.founder.create({
      data: {
        name: founder.name,
        handle,
        platform: founder.platform,
        profileUrl: toNullableString(founder.profileUrl),
        companyId,
      },
    });
  }

  async hasSignal(platform: SourceName, externalId: string): Promise<boolean> {
    const signal = await prisma.signal.findUnique({
      where: {
        platform_externalId: {
          platform,
          externalId,
        },
      },
    });

    return Boolean(signal);
  }

  async createSignalFromDraft(alert: AlertDraft, companyId?: string, founderId?: string): Promise<Signal> {
    return prisma.signal.create({
      data: {
        companyId,
        founderId,
        platform: alert.platform,
        externalId: alert.externalId,
        url: alert.url,
        text: alert.text,
        detectedAt: alert.detectedAt,
        signalType: alert.signalType,
        confidence: alert.confidence,
        batch: alert.batch ?? null,
        program: alert.company.program,
        evidence: alert.evidence,
        metadata: Prisma.JsonNull,
      },
    });
  }

  async createAlert(signalId: string, alertType: AlertType, slackMessageId?: string) {
    return prisma.alert.create({
      data: {
        signalId,
        alertType,
        slackMessageId: slackMessageId ?? null,
      },
    });
  }

  async hasAlertForCompany(company: CompanyRecordInput, alertType: AlertType): Promise<boolean> {
    const companyRecord = await this.findCompanyByInput(company);

    if (!companyRecord) {
      return false;
    }

    const alert = await prisma.alert.findFirst({
      where: {
        alertType,
        signal: {
          companyId: companyRecord.id,
        },
      },
    });

    return Boolean(alert);
  }

  async listSourceHealth(): Promise<SourceHealthSummary[]> {
    const snapshots = await prisma.sourceSnapshot.findMany({
      orderBy: { source: "asc" },
    });

    return snapshots.map((snapshot) => ({
      source: snapshot.source,
      status: snapshot.lastSuccessAt ? (snapshot.lastErrorAt && snapshot.lastErrorAt > snapshot.lastSuccessAt ? "degraded" : "healthy") : "unknown",
      lastSuccessAt: snapshot.lastSuccessAt,
      lastErrorAt: snapshot.lastErrorAt,
      lastErrorReason: snapshot.lastErrorReason,
    }));
  }

  async getDashboardCounts() {
    const [companyCount, signalCount, earlySignalCount, alertCount] = await Promise.all([
      prisma.company.count(),
      prisma.signal.count({
        where: {
          detectedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.signal.count({
        where: {
          signalType: "EARLY_YC",
          detectedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.alert.count(),
    ]);

    return {
      companyCount,
      signalCount,
      earlySignalCount,
      alertCount,
    };
  }

  async getOfficialCompanyCounts() {
    const grouped = await prisma.company.groupBy({
      by: ["program"],
      where: {
        officialConfirmedAt: {
          not: null,
        },
      },
      _count: {
        _all: true,
      },
    });

    return {
      ycCount: grouped.find((row) => row.program === "YC")?._count._all ?? 0,
      speedrunCount: grouped.find((row) => row.program === "SPEEDRUN")?._count._all ?? 0,
    };
  }

  async listRecentOfficialCompanies(limit = 12) {
    return prisma.company.findMany({
      where: {
        officialConfirmedAt: {
          not: null,
        },
      },
      orderBy: [{ officialConfirmedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
  }

  async listRecentSignals(limit = 20) {
    return prisma.signal.findMany({
      include: {
        company: true,
        founder: true,
      },
      orderBy: { detectedAt: "desc" },
      take: limit,
    });
  }

  async createMonitorRun(params: {
    status: MonitorRunStatus;
    triggeredBy: string;
    sources: string[];
    newSignals: number;
    alertsSent: number;
    errors: unknown;
    summary: unknown;
    startedAt: Date;
    completedAt: Date;
  }) {
    return prisma.monitorRun.create({
      data: {
        status: params.status,
        triggeredBy: params.triggeredBy,
        sources: params.sources,
        newSignals: params.newSignals,
        alertsSent: params.alertsSent,
        errors: params.errors as Prisma.InputJsonValue,
        summary: params.summary as Prisma.InputJsonValue,
        startedAt: params.startedAt,
        completedAt: params.completedAt,
      },
    });
  }

  async latestMonitorRun() {
    return prisma.monitorRun.findFirst({
      orderBy: { startedAt: "desc" },
    });
  }

  async findMatchingOfficialCompany(candidate: CompanyRecordInput): Promise<CompanyRecordInput | null> {
    const companies = await prisma.company.findMany({
      where: { program: candidate.program },
      orderBy: { createdAt: "asc" },
    });

    const match = companies.find((company) => company.officialConfirmedAt && companyMatches(mapCompany(company), candidate));
    return match ? mapCompany(match) : null;
  }

  async upsertPondRun(runId: string, taskId: string, requestBody: Record<string, unknown>) {
    return prisma.pondRun.upsert({
      where: { runId },
      update: {},
      create: {
        runId,
        taskId,
        requestBody: requestBody as Prisma.InputJsonValue,
        status: "pending",
      },
    });
  }

  async findPondRun(runId: string) {
    return prisma.pondRun.findUnique({
      where: { runId },
    });
  }

  async findPondRunByTaskId(taskId: string) {
    return prisma.pondRun.findUnique({
      where: { taskId },
    });
  }

  async completePondRun(runId: string, status: string, responseBody: unknown) {
    return prisma.pondRun.update({
      where: { runId },
      data: {
        status,
        responseBody: responseBody as Prisma.InputJsonValue,
      },
    });
  }
}
