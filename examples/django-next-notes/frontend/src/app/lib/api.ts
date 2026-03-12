export interface Note {
  id: number;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

// In vercel dev, /_/backend is proxied to the Django backend on the same port.
// For production separate deployments, set NEXT_PUBLIC_BACKEND_URL.
export const apiBase =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "/_/backend/api";
