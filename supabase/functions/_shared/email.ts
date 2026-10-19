// Shared email helpers for Recovery Milestones edge functions.
// Sends through Resend (free tier). The API key comes ONLY from the RESEND_API_KEY secret.

export const CRISIS_FOOTER_TEXT =
  'If you are in crisis, call or text 988 (Suicide & Crisis Lifeline). SAMHSA National Helpline: 1-800-662-4357 (free, confidential, 24/7).';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function layout(title: string, bodyHtml: string, unsubscribeUrl: string): string {
  return `<!doctype html><html><body style="margin:0;background:#fbf7f0;font-family:Georgia,'Times New Roman',serif;color:#2b2b2b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #eadfcc">
<tr><td style="background:#1f4d3a;color:#fbf7f0;padding:20px 24px;border-radius:16px 16px 0 0;font-size:20px">🌱 Recovery Milestones</td></tr>
<tr><td style="padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">
<h1 style="font-family:Georgia,serif;color:#1f4d3a;font-size:24px;margin:0 0 12px">${esc(title)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b6b6b;border-top:1px solid #eadfcc">
${esc(CRISIS_FOOTER_TEXT)}<br><br>
Recovery Milestones is a Root to Rise program. Root to Rise is the recovery program of Inspiration Is Everywhere, Falmouth, MA · roottorisema@gmail.com<br>
<a href="${esc(unsubscribeUrl)}" style="color:#1f4d3a">Unsubscribe from these emails</a> (one click)
</td></tr></table></td></tr></table></body></html>`;
}

export interface SendArgs { to: string; subject: string; html: string; text: string; unsubscribeUrl: string; oneClickUrl: string }

export async function sendEmail(a: SendArgs): Promise<{ ok: boolean; id?: string; error?: string; dryRun?: boolean }> {
  const dryRun = (Deno.env.get('DRY_RUN') ?? 'false') === 'true';
  const from = Deno.env.get('RESEND_FROM') ?? 'Recovery Milestones by Root to Rise <onboarding@resend.dev>';
  if (dryRun) { console.log('[DRY_RUN] would email', a.to, '·', a.subject); return { ok: true, dryRun: true }; }
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [a.to], subject: a.subject, html: a.html, text: a.text,
      headers: { 'List-Unsubscribe': `<${a.oneClickUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `${res.status} ${JSON.stringify(body)}` };
  return { ok: true, id: body.id };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
