import { DEFAULT_RULES, RULE_LIMITS } from './risk.js'

// Admin-tunable early-warning rules, stored as one JSON row. Anything missing or out of range falls back to the default.
export async function loadRiskRules(pool) {
  const row = (await pool.query("SELECT value FROM app_settings WHERE key = 'risk_rules'")).rows[0]
  if (!row) return DEFAULT_RULES
  try {
    const saved = JSON.parse(row.value)
    const out = { ...DEFAULT_RULES }
    for (const [k, [lo, hi]] of Object.entries(RULE_LIMITS)) if (Number.isFinite(saved[k]) && saved[k] >= lo && saved[k] <= hi) out[k] = saved[k]
    return out.medium < out.high ? out : DEFAULT_RULES
  } catch { return DEFAULT_RULES }
}

export async function saveRiskRules(pool, rules, userId) {
  const value = JSON.stringify(rules)
  if ((await pool.query("SELECT 1 FROM app_settings WHERE key = 'risk_rules'")).rows.length) await pool.query("UPDATE app_settings SET value = $1, updated_at = now(), updated_by = $2 WHERE key = 'risk_rules'", [value, userId])
  else await pool.query("INSERT INTO app_settings (key, value, updated_by) VALUES ('risk_rules', $1, $2)", [value, userId])
}
