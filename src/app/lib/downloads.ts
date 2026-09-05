export interface PublicDownload {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  provider: string;
  fileFormat: string;
  sourceUrl: string;
  requestedAt: string;
}

export interface RecordPublicDownloadInput {
  productId: string;
  productCode: string;
  productName: string;
  provider?: string;
  fileFormat?: string;
  sourceUrl: string;
}

async function apiError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return new Error(payload?.error || `Download request failed (${response.status})`);
}

export async function recordPublicDownload(input: RecordPublicDownloadInput) {
  const response = await fetch('/api/downloads', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await apiError(response);
  const payload = (await response.json()) as { download?: PublicDownload };
  if (!payload.download) throw new Error('Download API returned no record');
  return payload.download;
}

export async function loadPublicDownloads() {
  const response = await fetch('/api/downloads', { credentials: 'include' });
  if (!response.ok) return [] as PublicDownload[];
  const payload = (await response.json()) as { downloads?: PublicDownload[] };
  return Array.isArray(payload.downloads) ? payload.downloads : [];
}
