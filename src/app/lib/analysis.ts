export type AnalysisServiceType =
  | 'change-detection'
  | 'land-cover'
  | 'feature-extraction'
  | 'time-series'
  | 'custom-analysis';

export type AnalysisJobStatus =
  | 'queued'
  | 'validating'
  | 'processing'
  | 'qa'
  | 'delivered'
  | 'cancelled'
  | 'failed';

export type AnalysisDeliverable = 'analysis-report' | 'geospatial-data' | 'report-and-data';

export interface AnalysisJob {
  id: string;
  inquiryId?: string;
  orderId?: string;
  serviceType: AnalysisServiceType;
  status: AnalysisJobStatus;
  inputSpec: Record<string, unknown>;
  outputSpec: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CreateAnalysisJobInput {
  inquiryId?: string;
  orderId?: string;
  serviceType: AnalysisServiceType;
  objective: string;
  requestedDeliverable: AnalysisDeliverable;
  analysisFocus?: string;
  targetClasses?: string[];
  timeRange?: { start?: string; end?: string };
}

async function analysisApiError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return new Error(payload?.error || `Analysis request failed (${response.status})`);
}

export async function loadAnalysisJobs() {
  const response = await fetch('/api/analysis/jobs', { credentials: 'include' });
  if (!response.ok) throw await analysisApiError(response);
  const payload = (await response.json()) as { jobs?: AnalysisJob[] };
  return Array.isArray(payload.jobs) ? payload.jobs : [];
}

export async function createAnalysisJob(input: CreateAnalysisJobInput) {
  const response = await fetch('/api/analysis/jobs', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inquiryId: input.inquiryId,
      orderId: input.orderId,
      serviceType: input.serviceType,
      inputSpec: {
        objective: input.objective,
        requestedDeliverable: input.requestedDeliverable,
        analysisFocus: input.analysisFocus,
        targetClasses: input.targetClasses,
        timeRange: input.timeRange,
      },
    }),
  });
  if (!response.ok) throw await analysisApiError(response);
  const payload = (await response.json()) as { job?: AnalysisJob };
  if (!payload.job) throw new Error('Analysis API returned no job');
  return payload.job;
}
