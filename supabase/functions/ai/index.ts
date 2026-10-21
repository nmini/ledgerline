// Ledgerline AI proxy. Verifies the user, enforces a daily limit, forwards to Anthropic. Never logs or stores content.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: u, error: ue } = await admin.auth.getUser(token);
  if (ue || !u?.user) return json({ error: "auth" }, 401);
  const raw = await req.text();
  if (raw.length > 12_000_000) return json({ error: "too_large" }, 413);
  let b: any;
  try { b = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400); }
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > 40) return json({ error: "bad_request" }, 400);
  const lim = Number(Deno.env.get("DAILY_AI_LIMIT") ?? "200");
  const { data: ok, error: re } = await admin.rpc("ai_take", { uid: u.user.id, lim });
  if (re) return json({ error: "limit_check" }, 500);
  if (!ok) return json({ error: "rate_limited" }, 429);
  const body: Record<string, unknown> = {
    model: Deno.env.get("AI_MODEL") ?? "claude-sonnet-4-5",
    max_tokens: Math.min(Number(b.max_tokens) || 4096, 8192),
    messages: b.messages,
  };
  if (typeof b.system === "string") body.system = b.system.slice(0, 8000);
  if (Array.isArray(b.tools) && b.tools.length <= 8) body.tools = b.tools;
  const up = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  return new Response(await up.text(), { status: up.ok ? 200 : 502, headers: { ...cors, "Content-Type": "application/json" } });
});
