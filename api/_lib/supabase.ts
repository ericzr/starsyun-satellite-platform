export function supabaseApiHeaders(key: string, accessToken?: string) {
  const headers: Record<string, string> = { apikey: key };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else if (!key.startsWith('sb_')) {
    // Legacy anon/service_role keys are JWTs and may still be sent as Bearer.
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}
