// unsubscribe — RFC 8058 one-click unsubscribe endpoint used in the List-Unsubscribe email header.
// POST (or GET) ?token=<uuid>. Works for member tokens and supporter tokens. Deploy with --no-verify-jwt.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!UUID.test(token)) return new Response('Invalid link', { status: 400 });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    db: { schema: Deno.env.get('DB_SCHEMA') ?? 'milestones' }, auth: { persistSession: false },
  });
  const { error } = await sb.rpc('unsubscribe', { p_token: token });
  if (error) return new Response('Something went wrong', { status: 500 });
  return new Response('You have been unsubscribed from Recovery Milestones emails.', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
});
