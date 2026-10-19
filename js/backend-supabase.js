// Supabase backend: thin wrappers over supabase-js v2 (loaded from the jsDelivr CDN, pinned version).
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';

export async function createBackend(CONFIG, SITE_URL) {
  const { createClient } = await import(SUPABASE_JS);
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    db: { schema: CONFIG.DB_SCHEMA || 'milestones' },
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  const unwrap = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
  const rpc = (fn, args) => unwrap(sb.rpc(fn, args));
  const uid = async () => (await sb.auth.getSession()).data.session?.user?.id;

  return {
    demo: false,
    // ---------- auth ----------
    async session() { const { data } = await sb.auth.getSession(); return data.session ? { user: { id: data.session.user.id, email: data.session.user.email } } : null; },
    onAuthChange(cb) { sb.auth.onAuthStateChange((_e, s) => cb(s ? { user: { id: s.user.id, email: s.user.email } } : null)); },
    async signInWith(provider) {
      const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: `${SITE_URL}/app.html`, scopes: provider === 'facebook' ? 'email public_profile' : undefined } });
      if (error) throw new Error(error.message);
    },
    async signInEmail(email) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${SITE_URL}/app.html` } });
      if (error) throw new Error(error.message);
    },
    async signOut() { await sb.auth.signOut(); },
    async identities() { const { data } = await sb.auth.getUserIdentities(); return (data?.identities || []).map((i) => i.provider); },
    async linkIdentity(provider) { const { error } = await sb.auth.linkIdentity({ provider, options: { redirectTo: `${SITE_URL}/settings.html` } }); if (error) throw new Error(error.message); },

    // ---------- member ----------
    ensureProfile: () => rpc('ensure_profile'),
    updateProfile: async (patch) => unwrap(sb.from('profiles').update(patch).eq('id', await uid()).select().single()),
    getPrefs: async () => unwrap(sb.from('notification_prefs').select('*').eq('user_id', await uid()).single()),
    updatePrefs: async (patch) => unwrap(sb.from('notification_prefs').update(patch).eq('user_id', await uid()).select().single()),
    syncBadges: () => rpc('sync_my_badges'),
    myOffers: () => rpc('my_offers'),
    claimReward: (offerId) => rpc('claim_reward', { p_offer: offerId }),
    myClaims: () => rpc('my_claims'),
    createCard: (o) => rpc('create_card', { p_key: o.milestone_key, p_show_name: !!o.show_name, p_show_date: !!o.show_date, p_message: o.message || '' }),
    getCard: (id) => rpc('get_card', { p_id: id }),
    checkIn: () => rpc('check_in'),
    getStreak: () => rpc('my_streak'),
    listSupporters: () => unwrap(sb.from('supporters').select('id,name,email,relationship,notify_on_milestones,consent_at,invited_at,unsubscribed').order('created_at')),
    addSupporter: (s) => unwrap(sb.from('supporters').insert({ name: s.name, email: s.email, relationship: s.relationship, notify_on_milestones: !!s.notify_on_milestones, consent_confirmed: !!s.consent_confirmed }).select('id').single()),
    updateSupporter: (id, patch) => unwrap(sb.from('supporters').update(patch).eq('id', id)),
    removeSupporter: (id) => unwrap(sb.from('supporters').delete().eq('id', id)),
    myNotes: () => unwrap(sb.from('wall_notes').select('*').order('created_at', { ascending: false })),
    moderateNote: (id, status) => unwrap(sb.from('wall_notes').update({ status }).eq('id', id)),
    deleteNote: (id) => unwrap(sb.from('wall_notes').delete().eq('id', id)),
    publicWall: (slug) => rpc('public_wall', { p_slug: slug }),
    noteContext: (token) => rpc('note_context', { p_token: token }),
    leaveNote: (token, author, message) => rpc('leave_note', { p_token: token, p_author: author, p_message: message }),
    listReminders: () => unwrap(sb.from('meeting_reminders').select('*').order('day_of_week').order('meet_time')),
    addReminder: (r) => unwrap(sb.from('meeting_reminders').insert({ label: r.label, day_of_week: +r.day_of_week, meet_time: r.meet_time, active: true })),
    updateReminder: (id, patch) => unwrap(sb.from('meeting_reminders').update(patch).eq('id', id)),
    deleteReminder: (id) => unwrap(sb.from('meeting_reminders').delete().eq('id', id)),
    exportMyData: () => rpc('export_my_data'),
    deleteMyData: async () => { await rpc('delete_my_data'); await sb.auth.signOut(); },
    requestCoach: (f) => rpc('request_coach', { p_coach: f.coach_id || null, p_name: f.name, p_email: f.email || '', p_phone: f.phone || '', p_pref: f.preferred_contact, p_message: f.message || '', p_consent: !!f.consent, p_consent_text: f.consent_text }),
    unsubscribe: (token) => rpc('unsubscribe', { p_token: token }),

    // ---------- public ----------
    publicBusinesses: () => rpc('public_businesses'),
    sponsorTiers: () => unwrap(sb.from('sponsor_tiers').select('*').order('sort')),
    impact: () => rpc('public_impact'),
    coaches: () => unwrap(sb.from('coaches').select('*').eq('active', true).order('display_name')),

    // ---------- business ----------
    becomeBusiness: (b) => rpc('become_business', { p_name: b.name, p_contact_email: b.contact_email || null, p_town: b.town || null, p_state: b.state || null, p_address: b.address || null, p_website: b.website || null, p_phone: b.phone || null, p_description: b.description || null }),
    myBusiness: async () => unwrap(sb.from('businesses').select('*').eq('owner_id', await uid()).maybeSingle()),
    updateBusiness: async (patch) => unwrap(sb.from('businesses').update(patch).eq('owner_id', await uid()).select().single()),
    myBusinessOffers: async (bid) => unwrap(sb.from('offers').select('*').eq('business_id', bid).order('created_at', { ascending: false })),
    saveOffer: (o) => {
      const row = { title: o.title, description: o.description || null, reward_type: o.reward_type, reward_value: o.reward_value === '' || o.reward_value == null ? null : +o.reward_value, milestones: o.milestones, starts_on: o.starts_on || null, expires_on: o.expires_on || null, redemption_rules: o.redemption_rules || null, per_user_limit: +o.per_user_limit || 1, total_limit: o.total_limit ? +o.total_limit : null, active: o.active !== false };
      return o.id ? unwrap(sb.from('offers').update(row).eq('id', o.id)) : unwrap(sb.from('offers').insert({ ...row, business_id: o.business_id }));
    },
    deleteOffer: (id) => unwrap(sb.from('offers').delete().eq('id', id)),
    businessClaims: () => rpc('business_claims'),
    redeemCode: (code) => rpc('redeem_code', { p_code: code }),
    requestSponsorship: (tier) => rpc('request_sponsorship', { p_tier: tier }),
    async startCheckout(tier) {
      const { data, error } = await sb.functions.invoke('create-checkout', { body: { tier } });
      if (error) throw new Error(error.message); return data.url;
    },

    // ---------- admin ----------
    adminSummary: () => rpc('admin_summary'),
    adminStats: () => rpc('admin_stats_report'),
    adminBusinesses: () => rpc('admin_businesses'),
    adminSetBusiness: (id, b) => rpc('admin_set_business', { p_id: id, p_status: b.status, p_featured: b.featured, p_tier: b.sponsor_tier || null, p_featured_until: b.featured_until || null }),
    adminCoaches: () => unwrap(sb.from('coaches').select('*').order('display_name')),
    adminSaveCoach: (c) => c.id ? unwrap(sb.from('coaches').update(c).eq('id', c.id)) : unwrap(sb.from('coaches').insert(c)),
    adminDeleteCoach: (id) => unwrap(sb.from('coaches').delete().eq('id', id)),
    adminCoachRequests: () => unwrap(sb.from('coach_requests').select('*').order('created_at', { ascending: false })),
    adminSetCoachRequest: (id, status) => unwrap(sb.from('coach_requests').update({ status }).eq('id', id)),
  };
}
