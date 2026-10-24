import { supabase } from "./supabase";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!base) throw new Error("The study service is not configured. Please contact the site owner.");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please log in again to continue.");
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  const response = await fetch(`${base}${path}`, { ...options, headers, signal: AbortSignal.timeout(90000) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(typeof data.detail === "string" ? data.detail : "The study service could not complete this request. Please try again.");
  }
  return response;
}
