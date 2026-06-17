import { clearSession, getToken } from './auth';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean; // attach the admin token (default true)
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Session expired / invalid → bounce to login
  if (res.status === 401 && auth) {
    clearSession();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiError('Unauthorized', 401);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

// ── Types mirrored from the backend ─────────────────────────
export interface Article {
  id: number;
  title: string;
  category: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Announcement {
  id: number;
  title: string;
  message: string;
  sent_at: string | null;
  sent_count: number;
  created_at: string;
}

export interface AiSettings {
  id: number;
  system_prompt: string;
  model: string;
  temperature: number;
  updated_at: string;
}

export interface User {
  id: number;
  telegram_id: string;
  username: string | null;
  first_name: string | null;
  orientation_data: { stream?: string; score?: string; interests?: string } | null;
  created_at: string;
  last_active_at: string;
}

export interface DashboardData {
  stats: {
    users: number;
    articles: number;
    announcements: number;
    announcementsSent: number;
  };
  recentUsers: User[];
  recentAnnouncements: Announcement[];
}

// ── API surface ─────────────────────────────────────────────
export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; username: string }>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      auth: false,
    }),

  dashboard: () => request<DashboardData>('/api/dashboard'),

  // Articles
  listArticles: () => request<Article[]>('/api/articles'),
  createArticle: (data: Pick<Article, 'title' | 'category' | 'content'>) =>
    request<Article>('/api/articles', { method: 'POST', body: data }),
  updateArticle: (id: number, data: Pick<Article, 'title' | 'category' | 'content'>) =>
    request<Article>(`/api/articles/${id}`, { method: 'PUT', body: data }),
  deleteArticle: (id: number) =>
    request<void>(`/api/articles/${id}`, { method: 'DELETE' }),

  // Announcements
  listAnnouncements: () => request<Announcement[]>('/api/announcements'),
  createAnnouncement: (data: Pick<Announcement, 'title' | 'message'>) =>
    request<Announcement>('/api/announcements', { method: 'POST', body: data }),
  sendAnnouncement: (id: number) =>
    request<{ delivered: number; total: number; announcement: Announcement }>(
      `/api/announcements/${id}/send`,
      { method: 'POST' }
    ),
  deleteAnnouncement: (id: number) =>
    request<void>(`/api/announcements/${id}`, { method: 'DELETE' }),

  // AI settings
  getSettings: () => request<AiSettings>('/api/ai-settings'),
  updateSettings: (data: Pick<AiSettings, 'system_prompt' | 'model' | 'temperature'>) =>
    request<AiSettings>('/api/ai-settings', { method: 'PUT', body: data }),

  // Users
  listUsers: () => request<{ users: User[]; total: number }>('/api/users'),
};
