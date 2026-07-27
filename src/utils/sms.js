const { School } = require('../models');

const NALO_ENDPOINT = process.env.NALO_ENDPOINT || 'https://sms.nalosolutions.com/smsbackend/Resl_Nalo/send-message/';

// Nalo expects Ghanaian numbers in 233XXXXXXXXX form — parents' numbers are
// captured locally (0XXXXXXXXX), so normalize before sending.
function normalizeGhanaMsisdn(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('233')) return digits;
  if (digits.startsWith('0')) return `233${digits.slice(1)}`;
  return digits;
}

// Never throws on a provider-level failure (bad number, insufficient
// credit, etc.) — the caller treats SMS as best-effort and must keep going
// for the student's other parents even if one send fails.
//
// The Nalo account/API key is one shared platform-wide credential (still an
// env var), but the Sender ID (the "from" name shown on the text) is
// per-school — a school hasn't configured one yet is treated the same as
// the platform key being unconfigured: skip, don't throw.
//
// schoolId is optional — when passed, a successful send counts against that
// school's per-term SMS bundle (School.smsUsedThisCycle, tracked/reported
// only, never a hard cap — see platform analytics). Kept in this one shared
// function rather than at each of its 5 call sites so usage accounting can
// never be missed for a new call site.
async function sendSms({ to, message, senderId, schoolId }) {
  if (!process.env.NALO_API_KEY) {
    return { ok: false, error: 'NALO_API_KEY not configured' };
  }
  if (!senderId) {
    return { ok: false, error: 'SMS sender ID not configured for this school' };
  }

  try {
    const response = await fetch(NALO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: process.env.NALO_API_KEY,
        msisdn: normalizeGhanaMsisdn(to),
        message,
        sender_id: senderId,
      }),
    });
    const raw = await response.text();
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}`, raw };
    if (schoolId) {
      School.increment('smsUsedThisCycle', { by: 1, where: { id: schoolId } }).catch(() => {});
    }
    return { ok: true, raw };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { sendSms, normalizeGhanaMsisdn };
