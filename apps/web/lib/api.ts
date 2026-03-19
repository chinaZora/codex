const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

async function safeFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed');
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export async function getAgents() {
  return safeFetch('/agents', [] as any[]);
}

export async function getKnowledgeSources() {
  return safeFetch('/knowledge/sources', [] as any[]);
}

export async function getAuditEvents() {
  return safeFetch('/audit', [] as any[]);
}
