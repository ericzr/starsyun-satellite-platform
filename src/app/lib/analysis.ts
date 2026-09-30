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
export type AnalysisInputSource = 'purchased-order' | 'analysis-inquiry' | 'own-upload';

export interface AnalysisInputAsset {
  id: string;
  jobId: string;
  fileName: string;
  contentType: string;
  objectKey: string;
  bucket: string;
  sizeBytes?: number;
  expectedSizeBytes?: number;
  status: 'pending' | 'ready' | 'revoked';
  createdAt: string;
  completedAt?: string;
}

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
  inputSource?: AnalysisInputSource;
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

export async function loadAdminAnalysisJobs() {
  const response = await fetch('/api/admin/analysis-jobs', { credentials: 'include' });
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
      inputSource: input.inputSource,
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

export async function createAnalysisInputUpload(jobId: string, file: File) {
  const response = await fetch(`/api/analysis/jobs/${encodeURIComponent(jobId)}/input-upload`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, sizeBytes: file.size }),
  });
  if (!response.ok) throw await analysisApiError(response);
  const payload = (await response.json()) as { asset?: AnalysisInputAsset; upload?: { url: string; method: 'PUT'; headers?: Record<string, string> } };
  if (!payload.asset || !payload.upload?.url) throw new Error('Analysis upload initialization returned no upload URL');
  const upload = await fetch(payload.upload.url, { method: payload.upload.method, headers: payload.upload.headers, body: file });
  if (!upload.ok) throw new Error(`Analysis upload failed (${upload.status})`);
  const complete = await fetch(`/api/analysis/jobs/${encodeURIComponent(jobId)}/input-upload/${encodeURIComponent(payload.asset.id)}/complete`, { method: 'POST', credentials: 'include' });
  if (!complete.ok) throw await analysisApiError(complete);
  const completed = (await complete.json()) as { asset?: AnalysisInputAsset };
  if (!completed.asset) throw new Error('Analysis upload completion returned no asset');
  return completed.asset;
}

export async function loadAnalysisInputAssets(jobId: string) {
  const response = await fetch(`/api/analysis/jobs/${encodeURIComponent(jobId)}/input-upload`, { credentials: 'include' });
  if (!response.ok) throw await analysisApiError(response);
  const payload = (await response.json()) as { assets?: AnalysisInputAsset[] };
  return Array.isArray(payload.assets) ? payload.assets : [];
}
