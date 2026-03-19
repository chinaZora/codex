'use server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export async function sendDebugMessage(_: any, formData: FormData) {
  const payload = {
    session_id: formData.get('session_id') || 'demo-session-001',
    agent_id: formData.get('agent_id') || 'recruiter-assistant',
    user_id: formData.get('user_id') || 'demo-user',
    message: formData.get('message') || '',
  };

  try {
    const res = await fetch(`${API_BASE}/sessions/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    return await res.json();
  } catch {
    return {
      answer: 'API 未启动，当前展示本地 fallback。',
      citations: [],
      tool_calls: [],
      memory_snapshot: [],
    };
  }
}
