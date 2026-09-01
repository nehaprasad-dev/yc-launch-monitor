import type { AlertType, Program, SignalType, SourceName } from "@prisma/client";

export interface CompanyRecordInput {
  name: string;
  slug?: string | null;
  domain?: string | null;
  ycUrl?: string | null;
  batch?: string | null;
  program: Program;
  description?: string | null;
  officialConfirmedAt?: Date;
}

export interface FounderRecordInput {
  name: string;
  handle?: string | null;
  platform: SourceName;
  profileUrl?: string | null;
}

export interface SocialPost {
  platform: SourceName;
  externalId: string;
  authorName: string;
  authorHandle?: string | null;
  authorProfileUrl?: string | null;
  text: string;
  url: string;
  detectedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface ClassifiedSignal {
  isFounderAnnouncement: boolean;
  companyName?: string | null;
  companyDomain?: string | null;
  founderName?: string | null;
  batch?: string | null;
  program?: Program | null;
  confidence: number;
  evidence: string[];
  reasoning?: string | null;
}

export interface SourcePullResult {
  source: SourceName;
  cursor?: string | null;
  companies?: CompanyRecordInput[];
  posts?: SocialPost[];
  observedAt: Date;
  health: "healthy" | "degraded";
  errorReason?: string;
  metadata?: Record<string, unknown>;
}

export interface AlertDraft {
  alertType: AlertType;
  signalType: SignalType;
  company: CompanyRecordInput;
  founder?: FounderRecordInput;
  platform: SourceName;
  externalId: string;
  url: string;
  text: string;
  confidence: number;
  evidence: string[];
  detectedAt: Date;
  batch?: string | null;
}

export interface MonitorRunRequest {
  sources: SourceName[];
  dryRun?: boolean;
  triggeredBy: string;
}

export interface MonitorRunResult {
  startedAt: Date;
  completedAt: Date;
  newSignals: number;
  alertsSent: number;
  alertDrafts: AlertDraft[];
  errors: Array<{ source?: SourceName; message: string }>;
}

export interface SignalClassifier {
  classify(post: SocialPost): Promise<ClassifiedSignal>;
}

export interface MonitorSource {
  readonly source: SourceName;
  fetch(cursor?: string | null): Promise<SourcePullResult>;
}

export interface SourceHealthSummary {
  source: SourceName;
  status: "healthy" | "degraded" | "unknown";
  lastSuccessAt?: Date | null;
  lastErrorAt?: Date | null;
  lastErrorReason?: string | null;
}
