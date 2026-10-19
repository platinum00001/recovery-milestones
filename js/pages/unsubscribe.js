import { chrome, $ } from '../ui.js';

const ctx = await chrome();
const token = new URLSearchParams(location.search).get('token');
const box = $('#unsub');
if (!token) box.innerHTML = '<h1>Unsubscribe</h1><p>This link is missing its token. You can turn emails off any time in <a href="settings.html">Settings</a>.</p>';
else {
  const ok = await ctx.A.unsubscribe(token).catch(() => false);
  box.innerHTML = ok ? '<h1>You are unsubscribed</h1><p>You will not get any more Recovery Milestones emails from this link. Members can turn emails back on in <a href="settings.html">Settings</a>.</p>'
    : '<h1>Link not recognized</h1><p>This unsubscribe link is not valid anymore. Email <a href="mailto:roottorisema@gmail.com">roottorisema@gmail.com</a> and we will remove you by hand.</p>';
}
