// PREVIEW MODE backend — used only while js/config.js still has placeholder Supabase values.
// Everything is fictional sample data stored in this browser's localStorage. Nothing is sent anywhere.
import * as M from './milestones.js';
import { computeStreak } from './streak.js';
import { generateCode, normalizeCode, suppress } from './format.js';

const KEY = 'rtr-milestones-demo-v1';
const today = () => M.todayISO();
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2));
const nowIso = () => new Date().toISOString();
const clone = (x) => JSON.parse(JSON.stringify(x));

function seed() {
  const t = today();
  const clean = M.addDays(t, -95); // 90 days reached 5 days ago; next: 6 months
  const days = Array.from({ length: 6 }, (_, i) => M.addDays(t, -(i + 1))); // 6-day streak through yesterday
  const users = {
    'demo-member': { id: 'demo-member', email: 'sam@example.org', role: 'member', display_name: 'Sam', clean_date: clean, timezone: 'America/New_York', show_name_public: false, wall_public: false, wall_show_date: false, wall_slug: 'sam-example', created_at: nowIso() },
    'demo-business': { id: 'demo-business', email: 'owner@example.org', role: 'business', display_name: 'Main Street Coffee owner', clean_date: null, timezone: 'America/New_York', show_name_public: false, wall_public: false, wall_show_date: false, wall_slug: 'biz-example', created_at: nowIso() },
    'demo-admin': { id: 'demo-admin', email: 'admin@example.org', role: 'admin', display_name: 'Admin', clean_date: null, timezone: 'America/New_York', show_name_public: false, wall_public: false, wall_show_date: false, wall_slug: 'admin-example', created_at: nowIso() },
  };
  const businesses = [
    { id: 'b1', owner_id: 'demo-business', name: 'Main Street Coffee (Example)', description: 'Example listing — a cozy coffee shop.', town: 'Falmouth', state: 'MA', address: 'Main St, Falmouth, MA', contact_email: 'owner@example.org', phone: '', website: '', lat: 41.5515, lng: -70.6148, status: 'approved', featured: true, sponsor_tier: 'sprout', featured_until: null },
    { id: 'b2', owner_id: 'x2', name: 'Harbor Bakery (Example)', description: 'Example listing — fresh bread and pastries.', town: 'Hyannis', state: 'MA', address: 'Main St, Hyannis, MA', lat: 41.6525, lng: -70.2881, status: 'approved', featured: false, sponsor_tier: null },
    { id: 'b3', owner_id: 'x3', name: 'Tidepool Yoga (Example)', description: 'Example listing — community yoga classes.', town: 'Woods Hole', state: 'MA', address: 'Water St, Woods Hole, MA', lat: 41.5265, lng: -70.6693, status: 'approved', featured: false, sponsor_tier: null },
    { id: 'b4', owner_id: 'x4', name: 'Bayside Books (Example, pending)', description: 'Example pending application.', town: 'Sandwich', state: 'MA', lat: 41.759, lng: -70.494, status: 'pending', featured: false, sponsor_tier: null },
  ];
  const offers = [
    { id: 'o1', business_id: 'b1', title: 'Free coffee of any size (Example)', description: 'Celebrate with a drink on us.', reward_type: 'free_item', reward_value: null, milestones: ['d30', 'd60', 'd90', 'm6', 'm9', 'y1', 'yN'], starts_on: null, expires_on: M.addDays(t, 180), redemption_rules: 'Show your code at the counter. One per visit.', per_user_limit: 1, total_limit: null, active: true, created_at: nowIso() },
    { id: 'o2', business_id: 'b2', title: '20% off a celebration cake (Example)', description: 'Any whole cake, order 2 days ahead.', reward_type: 'percent_off', reward_value: 20, milestones: ['y1', 'yN'], starts_on: null, expires_on: M.addDays(t, 365), redemption_rules: 'Mention the code when ordering.', per_user_limit: 1, total_limit: null, active: true, created_at: nowIso() },
    { id: 'o3', business_id: 'b3', title: 'Free first class (Example)', description: 'Any drop-in class.', reward_type: 'free_item', reward_value: null, milestones: ['h24', 'd30', 'd90'], starts_on: null, expires_on: M.addDays(t, 120), redemption_rules: 'Book online, show code at check-in.', per_user_limit: 1, total_limit: null, active: true, created_at: nowIso() },
  ];
  const claims = [{ id: 'c1', offer_id: 'o3', user_id: 'demo-member', milestone_key: 'd90', code: 'YGA7K2PQ', status: 'issued', expires_on: M.addDays(t, 25), created_at: nowIso(), redeemed_at: null }];
  const supporters = [{ id: 's1', user_id: 'demo-member', name: 'Pat (Example sponsor)', email: 'pat@example.org', relationship: 'sponsor', notify_on_milestones: true, consent_confirmed: true, consent_at: nowIso(), note_token: 'demo-note-token', invited_at: nowIso(), unsubscribed: false }];
  const notes = [
    { id: 'n1', wall_user_id: 'demo-member', supporter_id: 's1', author_name: 'Pat', message: '90 days! I am so proud of you. Keep coming back.', status: 'pending', created_at: nowIso() },
    { id: 'n2', wall_user_id: 'demo-member', supporter_id: null, author_name: 'Mom', message: 'Love you. Every day counts.', status: 'approved', created_at: nowIso() },
  ];
  const reminders = [{ id: 'r1', user_id: 'demo-member', label: 'Tuesday night home group (Example)', day_of_week: 2, meet_time: '19:00', active: true }];
  const coaches = [
    { id: 'k1', display_name: 'Example Coach A (Example)', bio: 'Placeholder profile. A certified recovery coach would describe their lived experience and approach here.', specialties: ['Early recovery', 'Peer support'], service_area: 'Upper & Mid Cape', languages: ['English'], availability: 'Weekday evenings', is_example: true, active: true },
    { id: 'k2', display_name: 'Example Coach B (Example)', bio: 'Placeholder profile for a family-focused recovery coach.', specialties: ['Family recovery', 'Parenting in recovery'], service_area: 'Falmouth & Woods Hole', languages: ['English', 'Portuguese'], availability: 'Weekends', is_example: true, active: true },
    { id: 'k3', display_name: 'Example Coach C (Example)', bio: 'Placeholder profile for a coach who supports people returning to work.', specialties: ['Employment', 'Housing navigation'], service_area: 'Nashua, NH', languages: ['English', 'Spanish'], availability: 'Flexible', is_example: true, active: true },
  ];
  const tiers = [
    { key: 'sprout', name: 'Sprout Sponsor', price_cents: 2500, billing_interval: 'month', perks: ['"Featured" badge on the rewards map', 'Listed first in offers'], sort: 1 },
    { key: 'branch', name: 'Branch Sponsor', price_cents: 5000, billing_interval: 'month', perks: ['Everything in Sprout', 'Logo on the funder impact page', 'Highlighted in milestone emails'], sort: 2 },
    { key: 'canopy', name: 'Canopy Sponsor', price_cents: 10000, billing_interval: 'month', perks: ['Everything in Branch', 'Homepage spotlight', 'Thank-you in Root to Rise newsletters'], sort: 3 },
  ];
  return { session: null, users, prefs: { 'demo-member': { email_milestones: true, email_reminders: false, unsubscribe_token: 'demo-unsub' } }, businesses, offers, claims, badges: [], cards: [], supporters, notes, reminders, checkins: { 'demo-member': days }, coaches, coachRequests: [], sponsorships: [], tiers };
}

function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.users) return s; } catch {} const s = seed(); save(s); return s; }
function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

export function createBackend() {
  let S = load();
  const tx = (fn) => { S = load(); const r = fn(S); save(S); return Promise.resolve(clone(r ?? null)); };
  const me = () => { const id = S.session; if (!id) throw new Error('Not signed in'); return S.users[id]; };
  const myBiz = () => S.businesses.find((b) => b.owner_id === S.session);
  const live = (o) => o.active && (!o.expires_on || o.expires_on >= today()) && (!o.starts_on || o.starts_on <= today()) && S.businesses.find((b) => b.id === o.business_id)?.status === 'approved';
  const reached = (u) => (u.clean_date ? M.reachedMilestones(u.clean_date, today()) : []);
  const fail = (msg) => Promise.reject(new Error(msg));

  return {
    demo: true,
    async session() { S = load(); return S.session ? { user: { id: S.session, email: S.users[S.session].email } } : null; },
    onAuthChange() {},
    demoSignIn: (role) => tx((s) => { s.session = `demo-${role}`; }),
    async signInWith() { await this.demoSignIn('member'); location.href = 'app.html'; },
    async signInEmail() { await this.demoSignIn('member'); },
    signOut: () => tx((s) => { s.session = null; }),
    async identities() { return ['google']; },
    async linkIdentity() { throw new Error('Linking accounts works once Supabase is connected.'); },
    resetDemo: () => { localStorage.removeItem(KEY); S = load(); return Promise.resolve(); },

    ensureProfile: () => tx(() => me()),
    updateProfile: (patch) => tx(() => {
      const u = me();
      if (patch.clean_date) { const err = M.validateCleanDate(patch.clean_date, today()); if (err) throw new Error(err); }
      for (const k of ['display_name', 'clean_date', 'timezone', 'show_name_public', 'wall_public', 'wall_show_date']) if (k in patch) u[k] = patch[k];
      return u;
    }),
    getPrefs: () => tx((s) => (s.prefs[s.session] ||= { email_milestones: false, email_reminders: false, unsubscribe_token: uuid() })),
    updatePrefs: (patch) => tx((s) => Object.assign(s.prefs[s.session] ||= {}, patch)),
    syncBadges: () => tx((s) => {
      const u = me();
      s.badges = s.badges.filter((b) => b.user_id !== u.id);
      for (const m of reached(u)) s.badges.push({ user_id: u.id, milestone_key: m.key, reached_on: m.date });
      return s.badges.filter((b) => b.user_id === u.id);
    }),
    myOffers: () => tx((s) => {
      const u = me();
      return s.offers.filter(live).map((o) => {
        const b = s.businesses.find((x) => x.id === o.business_id);
        return { ...o, business_name: b.name, town: b.town, featured: b.featured, eligible_key: u.clean_date ? M.eligibleMilestone(u.clean_date, today(), o.milestones) : null, my_claims: s.claims.filter((c) => c.offer_id === o.id && c.user_id === u.id).length, sold_out: false };
      }).sort((a, b) => b.featured - a.featured);
    }),
    claimReward: (offerId) => tx((s) => {
      const u = me();
      if (u.role !== 'member') throw new Error('Rewards are for member accounts');
      if (!u.clean_date) throw new Error('Add your clean date first');
      const o = s.offers.find((x) => x.id === offerId && live(x));
      if (!o) throw new Error('This offer is not available');
      const k = M.eligibleMilestone(u.clean_date, today(), o.milestones);
      if (!k) throw new Error('This reward is for a milestone you reached in the last 30 days');
      if (s.claims.filter((c) => c.offer_id === o.id && c.user_id === u.id).length >= o.per_user_limit) throw new Error('You already claimed this reward');
      const c = { id: uuid(), offer_id: o.id, user_id: u.id, milestone_key: k, code: generateCode(8), status: 'issued', expires_on: [o.expires_on || '9999-12-31', M.addDays(today(), 30)].sort()[0], created_at: nowIso(), redeemed_at: null };
      s.claims.push(c); return c;
    }),
    myClaims: () => tx((s) => s.claims.filter((c) => c.user_id === s.session).map((c) => { const o = s.offers.find((x) => x.id === c.offer_id) || {}; const b = s.businesses.find((x) => x.id === o.business_id) || {}; return { ...c, offer_title: o.title, redemption_rules: o.redemption_rules, business_name: b.name, town: b.town }; }).reverse()),
    createCard: (o) => tx((s) => {
      const u = me();
      if (!reached(u).some((m) => m.key === o.milestone_key)) throw new Error('You can make a card for milestones you have reached');
      const card = { id: uuid(), user_id: u.id, milestone_key: o.milestone_key, show_name: !!o.show_name, show_date: !!o.show_date, message: (o.message || '').trim() || null, created_at: nowIso() };
      s.cards.push(card); return card.id;
    }),
    getCard: (id) => tx((s) => {
      const k = s.cards.find((c) => c.id === id); if (!k) return null; const u = s.users[k.user_id];
      return { milestone_key: k.milestone_key, display_name: k.show_name ? u.display_name : null, milestone_date: k.show_date ? M.milestoneDate(u.clean_date, k.milestone_key) : null, message: k.message, created_at: k.created_at };
    }),
    checkIn: () => tx((s) => { const d = (s.checkins[s.session] ||= []); if (!d.includes(today())) d.push(today()); return computeStreak(d, today()); }),
    getStreak: () => tx((s) => computeStreak(s.checkins[s.session] || [], today())),
    listSupporters: () => tx((s) => s.supporters.filter((x) => x.user_id === s.session)),
    addSupporter: (x) => tx((s) => {
      if (!x.consent_confirmed) throw new Error('Please confirm this person agreed to be contacted');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.email)) throw new Error('Please enter a valid email');
      const row = { id: uuid(), user_id: s.session, name: x.name, email: x.email, relationship: x.relationship, notify_on_milestones: !!x.notify_on_milestones, consent_confirmed: true, consent_at: nowIso(), note_token: uuid(), invited_at: null, unsubscribed: false };
      s.supporters.push(row); return { id: row.id };
    }),
    updateSupporter: (id, patch) => tx((s) => Object.assign(s.supporters.find((x) => x.id === id && x.user_id === s.session), patch)),
    removeSupporter: (id) => tx((s) => { s.supporters = s.supporters.filter((x) => !(x.id === id && x.user_id === s.session)); }),
    myNotes: () => tx((s) => s.notes.filter((n) => n.wall_user_id === s.session)),
    moderateNote: (id, status) => tx((s) => { const n = s.notes.find((x) => x.id === id && x.wall_user_id === s.session); if (n) n.status = status; }),
    deleteNote: (id) => tx((s) => { s.notes = s.notes.filter((x) => !(x.id === id && x.wall_user_id === s.session)); }),
    publicWall: (slug) => tx((s) => {
      const u = Object.values(s.users).find((x) => x.wall_slug === slug); if (!u) return null; if (!u.wall_public) return { private: true };
      return { display_name: u.show_name_public ? u.display_name : null, clean_date: u.wall_show_date ? u.clean_date : null,
        badges: reached(u).map((m) => ({ key: m.key, reached_on: u.wall_show_date ? m.date : null })),
        notes: s.notes.filter((n) => n.wall_user_id === u.id && n.status === 'approved') };
    }),
    noteContext: (token) => tx((s) => { const x = s.supporters.find((y) => y.note_token === token && !y.unsubscribed); return x ? { supporter_name: x.name, member_name: s.users[x.user_id].display_name || 'your friend' } : null; }),
    leaveNote: (token, author, message) => tx((s) => { const x = s.supporters.find((y) => y.note_token === token && !y.unsubscribed); if (!x) throw new Error('This note link is not valid'); s.notes.push({ id: uuid(), wall_user_id: x.user_id, supporter_id: x.id, author_name: author || x.name, message, status: 'pending', created_at: nowIso() }); return true; }),
    listReminders: () => tx((s) => s.reminders.filter((r) => r.user_id === s.session)),
    addReminder: (r) => tx((s) => { s.reminders.push({ id: uuid(), user_id: s.session, label: r.label, day_of_week: +r.day_of_week, meet_time: r.meet_time, active: true }); }),
    updateReminder: (id, patch) => tx((s) => Object.assign(s.reminders.find((r) => r.id === id), patch)),
    deleteReminder: (id) => tx((s) => { s.reminders = s.reminders.filter((r) => r.id !== id); }),
    exportMyData: () => tx((s) => ({ exported_at: nowIso(), note: 'PREVIEW MODE sample export', profile: me(), notification_prefs: s.prefs[s.session], badges: s.badges.filter((b) => b.user_id === s.session), checkins: s.checkins[s.session] || [], reward_claims: s.claims.filter((c) => c.user_id === s.session), celebration_cards: s.cards.filter((c) => c.user_id === s.session), supporters: s.supporters.filter((x) => x.user_id === s.session).map(({ name, email, relationship, notify_on_milestones, consent_at }) => ({ name, email, relationship, notify_on_milestones, consent_at })), wall_notes: s.notes.filter((n) => n.wall_user_id === s.session), meeting_reminders: s.reminders.filter((r) => r.user_id === s.session), coach_requests: s.coachRequests.filter((r) => r.user_id === s.session) })),
    deleteMyData: async () => { localStorage.removeItem(KEY); },
    requestCoach: (f) => tx((s) => { me(); if (!f.consent) throw new Error('Please tick the consent box'); if (!f.email && !f.phone) throw new Error('Add an email or phone number'); const r = { id: uuid(), user_id: s.session, ...f, status: 'new', created_at: nowIso() }; s.coachRequests.push(r); return r.id; }),
    unsubscribe: (token) => tx((s) => { for (const [, p] of Object.entries(s.prefs)) if (p.unsubscribe_token === token) { p.email_milestones = false; p.email_reminders = false; return true; } const x = s.supporters.find((y) => y.note_token === token); if (x) { x.unsubscribed = true; x.notify_on_milestones = false; return true; } return false; }),

    publicBusinesses: () => tx((s) => s.businesses.filter((b) => b.status === 'approved').map((b) => ({ ...b, tier_name: b.featured ? s.tiers.find((t) => t.key === b.sponsor_tier)?.name : null, offers: s.offers.filter((o) => o.business_id === b.id && live(o)).map(({ title, reward_type, reward_value, milestones, expires_on }) => ({ title, reward_type, reward_value, milestones, expires_on })) })).sort((a, b) => b.featured - a.featured || a.name.localeCompare(b.name))),
    sponsorTiers: () => tx((s) => s.tiers),
    impact: () => tx((s) => ({ milestones_celebrated: suppress(s.badges.length + 214), rewards_redeemed: suppress(s.claims.filter((c) => c.status === 'redeemed').length + 37), active_businesses: suppress(s.businesses.filter((b) => b.status === 'approved').length), supporters_engaged: suppress(s.supporters.length + 52), members: suppress(130), updated_at: nowIso(), demo: true })),
    coaches: () => tx((s) => s.coaches.filter((c) => c.active)),

    becomeBusiness: (b) => tx((s) => { const u = me(); if (myBiz()) throw new Error('You already have a business profile'); const row = { id: uuid(), owner_id: u.id, ...b, status: 'pending', featured: false, sponsor_tier: null, lat: null, lng: null }; s.businesses.push(row); if (u.role === 'member') u.role = 'business'; return row; }),
    myBusiness: () => tx(() => myBiz() || null),
    updateBusiness: (patch) => tx(() => { const b = myBiz(); for (const k of ['name', 'description', 'contact_email', 'phone', 'website', 'address', 'town', 'state', 'lat', 'lng']) if (k in patch) b[k] = patch[k]; return b; }),
    myBusinessOffers: (bid) => tx((s) => s.offers.filter((o) => o.business_id === bid)),
    saveOffer: (o) => tx((s) => {
      const b = myBiz(); if (!b) throw new Error('Create a business profile first');
      if (!o.milestones?.length) throw new Error('Choose at least one milestone');
      const row = { title: o.title, description: o.description, reward_type: o.reward_type, reward_value: o.reward_value === '' ? null : o.reward_value, milestones: o.milestones, starts_on: o.starts_on || null, expires_on: o.expires_on || null, redemption_rules: o.redemption_rules, per_user_limit: +o.per_user_limit || 1, total_limit: o.total_limit ? +o.total_limit : null, active: o.active !== false };
      if (o.id) Object.assign(s.offers.find((x) => x.id === o.id && x.business_id === b.id), row); else s.offers.unshift({ id: uuid(), business_id: b.id, created_at: nowIso(), ...row });
    }),
    deleteOffer: (id) => tx((s) => { const b = myBiz(); s.offers = s.offers.filter((o) => !(o.id === id && o.business_id === b.id)); }),
    businessClaims: () => tx((s) => { const b = myBiz(); if (!b) return []; const ids = s.offers.filter((o) => o.business_id === b.id).map((o) => o.id); return s.claims.filter((c) => ids.includes(c.offer_id)).map((c) => ({ code: c.code, status: c.status, milestone_key: c.milestone_key, offer_title: s.offers.find((o) => o.id === c.offer_id).title, created_at: c.created_at, redeemed_at: c.redeemed_at, expires_on: c.expires_on })); }),
    redeemCode: (code) => tx((s) => {
      const b = myBiz(); if (!b) throw new Error('Only business accounts can redeem codes');
      const c = s.claims.find((x) => x.code === normalizeCode(code) && s.offers.find((o) => o.id === x.offer_id)?.business_id === b.id);
      if (!c) throw new Error('Code not found for your business');
      const t = s.offers.find((o) => o.id === c.offer_id).title;
      if (c.status === 'redeemed') return { ok: false, reason: 'already_redeemed', offer_title: t, redeemed_at: c.redeemed_at };
      if (c.expires_on && c.expires_on < today()) return { ok: false, reason: 'expired', offer_title: t, expires_on: c.expires_on };
      c.status = 'redeemed'; c.redeemed_at = nowIso(); return { ok: true, offer_title: t, milestone_key: c.milestone_key, redeemed_at: c.redeemed_at };
    }),
    requestSponsorship: (tier) => tx((s) => { const b = myBiz(); if (!b) throw new Error('Create a business profile first'); const r = { id: uuid(), business_id: b.id, tier_key: tier, status: 'requested', created_at: nowIso() }; s.sponsorships.push(r); return r; }),
    startCheckout: () => fail('Online payments are not enabled in preview mode.'),

    adminSummary: () => tx((s) => { if (me().role !== 'admin') throw new Error('Admins only'); return { members: 130, members_with_date: 118, active_members_90d: 96, checkins_30d: 1420, businesses_approved: s.businesses.filter((b) => b.status === 'approved').length, businesses_pending: s.businesses.filter((b) => b.status === 'pending').length, businesses_featured: s.businesses.filter((b) => b.featured).length, offers_active: s.offers.filter(live).length, codes_issued: 61 + s.claims.length, codes_redeemed: 37 + s.claims.filter((c) => c.status === 'redeemed').length, cards_created: 44 + s.cards.length, supporters: 52 + s.supporters.length, notes_left: 80, email_optins: 71, coach_requests_open: s.coachRequests.filter((r) => r.status !== 'closed').length, demo: true }; }),
    adminStats: () => tx(() => {
      if (me().role !== 'admin') throw new Error('Admins only');
      const rows = []; const base = new Date(); const keys = ['all', 'h24', 'd30', 'd90', 'm6', 'y1'];
      for (let i = 0; i < 4; i++) { const d = new Date(base.getFullYear(), base.getMonth() - i, 1); const month = M.todayISO(d);
        for (const k of keys) rows.push({ month, milestone_key: k, signups: k === 'all' ? 30 - i * 4 : 0, milestones_reached: k === 'all' ? 0 : 12 - i - keys.indexOf(k), codes_issued: k === 'all' ? 0 : 8 - i, codes_redeemed: k === 'all' ? 0 : 5 - i, cards_created: k === 'all' ? 0 : 3 }); }
      return rows;
    }),
    adminBusinesses: () => tx((s) => s.businesses.map((b) => ({ ...b, offers: s.offers.filter((o) => o.business_id === b.id).length, redeemed: 0, sponsorship_requests: s.sponsorships.filter((x) => x.business_id === b.id).map((x) => ({ tier: x.tier_key, status: x.status, created_at: x.created_at })) }))),
    adminSetBusiness: (id, patch) => tx((s) => { if (me().role !== 'admin') throw new Error('Admins only'); Object.assign(s.businesses.find((b) => b.id === id), { status: patch.status, featured: patch.featured, sponsor_tier: patch.sponsor_tier || null, featured_until: patch.featured_until || null }); return true; }),
    adminCoaches: () => tx((s) => s.coaches),
    adminSaveCoach: (c) => tx((s) => { if (c.id) Object.assign(s.coaches.find((x) => x.id === c.id), c); else s.coaches.push({ id: uuid(), active: true, is_example: false, languages: ['English'], specialties: [], ...c }); }),
    adminDeleteCoach: (id) => tx((s) => { s.coaches = s.coaches.filter((c) => c.id !== id); }),
    adminCoachRequests: () => tx((s) => s.coachRequests),
    adminSetCoachRequest: (id, status) => tx((s) => { s.coachRequests.find((r) => r.id === id).status = status; }),
  };
}
