import { chrome, $, h, showError } from '../ui.js';

const ctx = await chrome();
const token = new URLSearchParams(location.search).get('t') || '';
const box = $('#note-box');
const c = token ? await ctx.A.noteContext(token).catch(() => null) : null;
if (!c) {
  box.innerHTML = `<h1>This link isn't active</h1><p class="muted">The note link may have expired or been turned off.</p>`;
} else {
  $('#who').textContent = c.member_name;
  $('#author').value = c.supporter_name || '';
  $('#note-form').onsubmit = async (e) => {
    e.preventDefault();
    const msg = $('#message').value.trim();
    if (!msg) return;
    try { await ctx.A.leaveNote(token, $('#author').value.trim(), msg); box.innerHTML = `<h1>Thank you 💚</h1><p>Your note was sent to ${h(c.member_name)}. They'll see it first and choose whether to show it on their wall.</p>`; }
    catch (err) { showError(err); }
  };
}
