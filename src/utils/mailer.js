const nodemailer = require('nodemailer');

// Credentials are per-school (see School.emailUser/emailAppPasswordEncrypted),
// so transporters are cached per credential pair rather than built fresh on
// every call — `pool: true` keeps a small set of authenticated SMTP
// connections open and reuses them, instead of paying a full TLS+auth
// handshake on every single email (the dominant cost of sendMail, and one of
// the reasons recording a payment with several parents to notify used to
// feel slow).
const transporterCache = new Map();

function getTransporter(emailUser, emailAppPassword) {
  const key = `${emailUser}:${emailAppPassword}`;
  if (!transporterCache.has(key)) {
    transporterCache.set(key, nodemailer.createTransport({
      service: 'gmail',
      auth: { user: emailUser, pass: emailAppPassword },
      pool: true,
      maxConnections: 3,
    }));
  }
  return transporterCache.get(key);
}

// Best-effort like sendSms — a failed email must not block the SMS side or
// the payment itself, so the caller decides how to surface { ok: false }.
async function sendMail({
  to, subject, html, attachments, emailUser, emailAppPassword, fromName,
}) {
  if (!emailUser || !emailAppPassword) {
    return { ok: false, error: 'Email is not configured for this school' };
  }

  try {
    const transporter = getTransporter(emailUser, emailAppPassword);
    const info = await transporter.sendMail({
      from: `"${fromName || 'School'}" <${emailUser}>`,
      to,
      subject,
      html,
      attachments,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { sendMail };
