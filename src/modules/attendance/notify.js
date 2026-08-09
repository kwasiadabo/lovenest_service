const { StudentParent, Parent } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const { sendSms } = require('../../utils/sms');

const STATUS_LABELS = {
  PRESENT: 'present',
  LATE: 'late',
  ABSENT: 'absent',
};

function formatDateLong(date) {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Batches the parent lookup across every student in one register-save
// (rather than one query per student — same convention as
// financials/service.js#sendDebtReminders) — every SMS attempt is
// individually tracked so one parent's bad number never blocks the rest,
// and this is always called wrapped in try/catch by the caller so a
// notification failure never fails/rolls back the already-saved register,
// same shape as financials/notify.js#notifyPaymentReceipt.
async function notifyAttendance(schoolId, {
  school, className, date, entries,
}) {
  const summary = {
    attempted: 0, sent: 0, failed: 0, skippedNoContact: 0,
  };
  if (entries.length === 0) return summary;

  const links = await tenantScoped(StudentParent, schoolId).findAll({
    where: { studentId: entries.map((e) => e.studentId) },
    include: [Parent],
  });

  const parentsByStudentId = new Map();
  for (const link of links) {
    const list = parentsByStudentId.get(link.studentId) || [];
    list.push(link.Parent);
    parentsByStudentId.set(link.studentId, list);
  }

  const dateLabel = formatDateLong(date);

  for (const entry of entries) {
    const parents = parentsByStudentId.get(entry.studentId) || [];
    // Dedupe by Parent.id — a student's father/mother could resolve to the
    // same Parent record (shared phone), same reasoning as
    // financials/notify.js#getStudentParents.
    const uniqueParents = [...new Map(parents.map((p) => [p.id, p])).values()];

    if (uniqueParents.length === 0) {
      summary.skippedNoContact += 1;
      continue;
    }

    const message = `Dear Parent, ${entry.studentName} was ${STATUS_LABELS[entry.status]} `
      + `${className ? `in ${className} ` : ''}on ${dateLabel}. - ${school?.name || 'School'}`;

    for (const parent of uniqueParents) {
      if (!parent.phone) continue;
      summary.attempted += 1;
      // eslint-disable-next-line no-await-in-loop
      const result = await sendSms({ to: parent.phone, message, senderId: school?.smsSenderId, schoolId });
      if (result.ok) summary.sent += 1;
      else summary.failed += 1;
    }
  }

  return summary;
}

module.exports = { notifyAttendance };
