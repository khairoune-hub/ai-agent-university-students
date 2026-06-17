export interface OrientationData {
  stream?: string; // Bac stream, e.g. "علوم تجريبية" / "Maths"
  score?: string; // Bac score, kept as text to allow "16.2" etc.
  interests?: string; // Free-text interests
}

export interface User {
  id: number;
  telegram_id: string; // BIGINT comes back as string from pg
  username: string | null;
  first_name: string | null;
  orientation_data: OrientationData | null;
  created_at: string;
  last_active_at: string;
}

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
