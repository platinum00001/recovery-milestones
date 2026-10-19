// Labels shared with the frontend (js/milestones.js).
const FIXED: Record<string, string> = { h24: '24 Hours', d30: '30 Days', d60: '60 Days', d90: '90 Days', m6: '6 Months', m9: '9 Months' };
export function milestoneLabel(key: string): string {
  if (FIXED[key]) return FIXED[key];
  const m = /^y(\d+)$/.exec(key);
  if (m) return m[1] === '1' ? '1 Year' : `${m[1]} Years`;
  return key;
}
export function rewardSummary(o: { reward_type: string; reward_value: number | null }): string {
  if (o.reward_type === 'percent_off' && o.reward_value) return `${o.reward_value}% off`;
  if (o.reward_type === 'amount_off' && o.reward_value) return `$${o.reward_value} off`;
  if (o.reward_type === 'free_item') return 'Free item';
  return 'Special offer';
}
