// Recovery Milestones — site configuration.
// Fill these in after creating the Supabase project (docs/SETUP.md). The anon/publishable key is safe to
// publish: Row Level Security protects the data. NEVER put the service_role key or any secret here.
// While SUPABASE_URL still contains "YOUR_", the site runs in PREVIEW MODE with sample data kept only in this browser.
export default {
  SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY',
  DB_SCHEMA: 'milestones',
  // Public URL of the deployed site, e.g. 'https://milestones.roottorisema.org' (used for OAuth redirects & share links).
  // Leave '' to use the current origin.
  SITE_URL: '',
  SITE_NAME: 'Recovery Milestones',
  CONTACT_EMAIL: 'roottorisema@gmail.com',
  ORG_NAME: 'Inspiration Is Everywhere',
  ORG_TOWN: 'Falmouth, MA',
  // Sign-in methods shown on the login panel (Google first, then Facebook, then email magic link).
  AUTH_PROVIDERS: ['google', 'facebook'],
  // Featured sponsor payments. Keep false until Stripe is set up; the sponsor page then shows a mailto instead.
  PAYMENTS_ENABLED: false,
  PAYMENT_MODE: 'payment_links', // 'payment_links' (Stripe Payment Links below) or 'checkout' (create-checkout edge function)
  STRIPE_PAYMENT_LINKS: { sprout: '', branch: '', canopy: '' }, // e.g. 'https://buy.stripe.com/test_...'
  // Map defaults (Cape Cod) and Nominatim geocoding (OpenStreetMap). Used only when a business clicks "Find on map".
  MAP_CENTER: [41.62, -70.45],
  MAP_ZOOM: 9,
  NOMINATIM_EMAIL: 'roottorisema@gmail.com',
};
