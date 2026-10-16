import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function allowRequest(key: string, limit: number, windowSeconds: number) {
  const { data, error } = await getSupabaseAdmin().rpc("consume_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error("Rate limit service is unavailable.");
  return data === true;
}

export async function writeAudit(event: string, details: Record<string, unknown>) {
  try {
    await getSupabaseAdmin().from("audit_logs").insert({ event, details });
  } catch {
    // Audit logging must not hide the primary request outcome.
  }
}