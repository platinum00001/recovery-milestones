// Chooses the data backend: real Supabase when configured, otherwise a local preview (demo) backend.
import CONFIG from './config.js';

export const IS_DEMO = !CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('YOUR_') || !CONFIG.SUPABASE_ANON_KEY || CONFIG.SUPABASE_ANON_KEY.includes('YOUR_');
export const SITE_URL = (CONFIG.SITE_URL || location.origin + location.pathname.replace(/[^/]*$/, '')).replace(/\/$/, '');
export { CONFIG };

let backend;
export function api() {
  if (!backend) {
    backend = (IS_DEMO ? import('./backend-demo.js') : import('./backend-supabase.js')).then((m) => m.createBackend(CONFIG, SITE_URL));
  }
  return backend;
}
