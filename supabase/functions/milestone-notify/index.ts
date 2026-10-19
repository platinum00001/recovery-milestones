// milestone-notify — runs from pg_cron (see supabase/migrations/002_schedule.sql).
//   ?task=daily      milestone emails to opted-in members, supporter shout-out emails, supporter invites
//   ?task=reminders  meeting reminder emails (hourly)
// Auth: header x-cron-secret must equal the CRON_SECRET function secret. Deploy with --no-verify-jwt.
// Secrets: RESEND_API_KEY, RESEND_FROM, CRON_SECRET, SITE_URL, optional DRY_RUN=true, DB_SCHEMA (default 'milestones').
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { esc, layout, sendEmail, sleep } from '../_shared/email.ts';
import { milestoneLabel, rewardSummary } from '../_shared/milestones.ts';

const SCHEMA = Deno.env.get('DB_SCHEMA') ?? 'milestones';
const SITE = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');
const FUNCS = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;
const SEND_GAP_MS = 600; // stay under Resend free-tier rate limits

function db() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    db: { schema: SCHEMA }, auth: { persistSession: false },
  });
}

const unsubLinks = (token: string) => ({
  unsubscribeUrl: `${SITE}/unsubscribe.html?token=${token}`,
  oneClickUrl: `${FUNCS}/milestones-unsubscribe?token=${token}`,
});

// Reserve a send in notification_log; returns false if it was already sent (idempotent re-runs).
async function reserve(sb: ReturnType<typeof db>, kind: string, ref: string): Promise<boolean> {
  const { error } = await sb.from('notification_log').insert({ kind, ref });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
}

async function daily(sb: ReturnType<typeof db>) {
  const stats = { members_emailed: 0, supporters_emailed: 0, invites: 0, skipped: 0, errors: [] as string[] };
  const { data: due, error } = await sb.rpc('due_milestones', { p_now: new Date().toISOString() });
  if (error) throw error;

  for (const row of due ?? []) {
    const label = milestoneLabel(row.milestone_key);
    const { data: offers } = await sb.rpc('offers_for_milestone', { p_key: row.milestone_key });

    // 1) Member email (opt-in only)
    if (row.email_opt_in && row.email && await reserve(sb, 'milestone', `${row.user_id}:${row.milestone_key}:${row.reached_on}`)) {
      const list = (offers ?? []).map((o: any) =>
        `<li><strong>${esc(o.title)}</strong> — ${esc(o.business_name)}${o.town ? `, ${esc(o.town)}` : ''} <em>(${esc(rewardSummary(o))})</em></li>`).join('');
      const html = layout(`Happy ${label}${row.display_name ? `, ${row.display_name}` : ''}! 🎉`, `
        <p>Today marks <strong>${esc(label)}</strong>. That is something to be proud of — one day at a time added up to this.</p>
        ${list ? `<p>Local businesses want to celebrate with you. You can claim these for the next 30 days:</p><ul>${list}</ul>` : '<p>New local rewards are added all the time — check your dashboard.</p>'}
        <p><a href="${SITE}/app.html" style="display:inline-block;background:#c8553d;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none">Claim rewards &amp; make your card</a></p>
        <p style="font-size:14px;color:#555">Your clean date is never shared unless you choose to share it.</p>`, unsubLinks(row.unsubscribe_token).unsubscribeUrl);
      const text = `Happy ${label}! Today marks ${label}. Rewards you qualify for:\n${(offers ?? []).map((o: any) => `- ${o.title} (${o.business_name})`).join('\n') || '- check your dashboard'}\n\nClaim: ${SITE}/app.html\nUnsubscribe: ${unsubLinks(row.unsubscribe_token).unsubscribeUrl}`;
      const r = await sendEmail({ to: row.email, subject: `Happy ${label}! Your Recovery Milestones rewards`, html, text, ...unsubLinks(row.unsubscribe_token) });
      r.ok ? stats.members_emailed++ : stats.errors.push(`member: ${r.error}`);
      await sleep(SEND_GAP_MS);
    } else stats.skipped++;

    // 2) Supporter shout-outs — only supporters the member enabled, never unsubscribed ones.
    const { data: sups } = await sb.from('supporters').select('id, name, email, note_token')
      .eq('user_id', row.user_id).eq('notify_on_milestones', true).eq('unsubscribed', false).eq('consent_confirmed', true);
    for (const s of sups ?? []) {
      if (!await reserve(sb, 'supporter', `${s.id}:${row.milestone_key}:${row.reached_on}`)) continue;
      const who = row.display_name || 'Someone you support';
      const noteUrl = `${SITE}/note.html?t=${s.note_token}`;
      const html = layout(`${who} reached ${label}!`, `
        <p>Hi ${esc(s.name)},</p>
        <p>${esc(who)} asked us to let you know they reached <strong>${esc(label)}</strong> in recovery today. Your support is part of that.</p>
        <p><a href="${noteUrl}" style="display:inline-block;background:#1f4d3a;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none">Leave a congratulations note</a></p>
        <p style="font-size:14px;color:#555">Notes are reviewed by ${esc(who)} before anyone else can see them. Please keep this news private unless they share it.</p>`, `${SITE}/unsubscribe.html?token=${s.note_token}`);
      const text = `Hi ${s.name}, ${who} reached ${label} in recovery today. Leave a note: ${noteUrl}\nUnsubscribe: ${SITE}/unsubscribe.html?token=${s.note_token}`;
      const r = await sendEmail({ to: s.email, subject: `${who} reached ${label} 🌱`, html, text, ...unsubLinks(s.note_token) });
      r.ok ? stats.supporters_emailed++ : stats.errors.push(`supporter: ${r.error}`);
      await sleep(SEND_GAP_MS);
    }
  }

  // 3) One-time invite/heads-up to newly added supporters (so they know and can opt out).
  const { data: newSups } = await sb.from('supporters').select('id, user_id, name, email, note_token')
    .is('invited_at', null).eq('notify_on_milestones', true).eq('unsubscribed', false).limit(200);
  for (const s of newSups ?? []) {
    if (!await reserve(sb, 'invite', s.id)) continue;
    const { data: prof } = await sb.from('profiles').select('display_name').eq('id', s.user_id).maybeSingle();
    const who = prof?.display_name || 'A friend';
    const html = layout(`${who} added you as a supporter`, `
      <p>Hi ${esc(s.name)},</p>
      <p>${esc(who)} added you as a supporter on Recovery Milestones. When they reach a recovery milestone, we'll send you a short note so you can cheer them on.</p>
      <p>That's all — no marketing, and your email is never sold or shared.</p>`, `${SITE}/unsubscribe.html?token=${s.note_token}`);
    const r = await sendEmail({ to: s.email, subject: `${who} added you as a Recovery Milestones supporter`, html,
      text: `${who} added you as a supporter on Recovery Milestones. Unsubscribe: ${SITE}/unsubscribe.html?token=${s.note_token}`, ...unsubLinks(s.note_token) });
    if (r.ok) { stats.invites++; await sb.from('supporters').update({ invited_at: new Date().toISOString() }).eq('id', s.id); }
    else stats.errors.push(`invite: ${r.error}`);
    await sleep(SEND_GAP_MS);
  }
  return stats;
}

async function reminders(sb: ReturnType<typeof db>) {
  const stats = { reminders_sent: 0, errors: [] as string[] };
  const { data: due, error } = await sb.rpc('due_reminders', { p_now: new Date().toISOString() });
  if (error) throw error;
  for (const r of due ?? []) {
    if (!await reserve(sb, 'reminder', `${r.reminder_id}:${r.local_day}`)) continue;
    const [h, m] = String(r.meet_time).split(':').map(Number);
    const t = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
    const html = layout(`Reminder: ${r.label}`, `<p>Your meeting <strong>${esc(r.label)}</strong> starts at <strong>${t}</strong> today.</p><p>Showing up is a win. 🌱</p>`, unsubLinks(r.unsubscribe_token).unsubscribeUrl);
    const res = await sendEmail({ to: r.email, subject: `Reminder: ${r.label} at ${t}`, html, text: `Reminder: ${r.label} at ${t} today.`, ...unsubLinks(r.unsubscribe_token) });
    if (res.ok) { stats.reminders_sent++; await sb.from('meeting_reminders').update({ last_sent_on: r.local_day }).eq('id', r.reminder_id); }
    else stats.errors.push(res.error ?? 'unknown');
    await sleep(SEND_GAP_MS);
  }
  return stats;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('Forbidden', { status: 403 });
  const task = new URL(req.url).searchParams.get('task') ?? 'daily';
  try {
    const sb = db();
    const result = task === 'reminders' ? await reminders(sb) : task === 'all' ? { ...(await daily(sb)), ...(await reminders(sb)) } : await daily(sb);
    console.log(JSON.stringify({ task, ...result }));
    return Response.json({ task, ...result });
  } catch (e) {
    console.error(e);
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
});
