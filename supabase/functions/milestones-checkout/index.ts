// milestones-checkout — SCAFFOLD ONLY. Creates a Stripe Checkout Session for a featured-sponsor tier.
// Disabled unless the PAYMENTS_ENABLED secret is exactly "true". No live keys are wired.
// Secrets when enabling: PAYMENTS_ENABLED=true, STRIPE_SECRET_KEY (start with a sk_test_ key), SITE_URL,
// and STRIPE_PRICE_<TIER> (e.g. STRIPE_PRICE_SPROUT=price_123) for each tier.
// TODO before going live: add a stripe-webhook function that verifies the Stripe-Signature header and
// marks milestones.sponsorships.status='paid' + businesses.featured=true. Until then an admin flips "featured" by hand.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (Deno.env.get('PAYMENTS_ENABLED') !== 'true') {
    return Response.json({ error: 'Online payments are not enabled yet. Please email contact@recoverymilestones.example to sponsor.' }, { status: 503, headers: cors });
  }
  const auth = req.headers.get('Authorization') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    db: { schema: Deno.env.get('DB_SCHEMA') ?? 'milestones' }, global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { tier } = await req.json().catch(() => ({ tier: '' }));
  const price = Deno.env.get(`STRIPE_PRICE_${String(tier).toUpperCase()}`);
  if (!price) return Response.json({ error: 'Unknown tier' }, { status: 400, headers: cors });
  // Records the request as the signed-in business owner (RLS + RPC checks ownership).
  const { data: sponsorship, error } = await sb.rpc('request_sponsorship', { p_tier: tier });
  if (error) return Response.json({ error: error.message }, { status: 403, headers: cors });

  const site = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');
  const form = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': price, 'line_items[0][quantity]': '1',
    success_url: `${site}/business.html?sponsor=thanks`, cancel_url: `${site}/sponsor.html`,
    client_reference_id: sponsorship.id, 'metadata[sponsorship_id]': sponsorship.id, 'metadata[business_id]': sponsorship.business_id,
  });
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
  });
  const session = await res.json();
  if (!res.ok) return Response.json({ error: session?.error?.message ?? 'Stripe error' }, { status: 502, headers: cors });
  return Response.json({ url: session.url }, { headers: cors });
});
