const { StudentParent, Parent } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const { sendSms } = require('../../utils/sms');
const { sendMail } = require('../../utils/mailer');
const { decryptSecret } = require('../../utils/secretCrypto');

// Sends each enrolled student's parent(s) a text with their child's pickup
// point and time for the day — same best-effort, never-throws shape as
// attendance/notify.js#notifyAttendance, reusing the same generic sendSms.
// `entries` is [{ studentId, studentName, pickupPointName, scheduledTime }],
// pre-filtered by the caller to only students with a pickup point set.
async function notifyPickup(schoolId, {
  school, vehicleName, entries,
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

  for (const entry of entries) {
    const parents = parentsByStudentId.get(entry.studentId) || [];
    // Dedupe by Parent.id — a student's father/mother could resolve to the
    // same Parent record (shared phone), same reasoning as
    // attendance/notify.js.
    const uniqueParents = [...new Map(parents.map((p) => [p.id, p])).values()];

    if (uniqueParents.length === 0) {
      summary.skippedNoContact += 1;
      continue;
    }

    const message = `Dear Parent, ${entry.studentName}'s pickup today is at ${entry.pickupPointName} `
      + `around ${entry.scheduledTime}${vehicleName ? ` (${vehicleName})` : ''}. Please be ready a few minutes early. `
      + `- ${school?.name || 'School'}`;

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

function buildMapUrl(latitude, longitude) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

function dropoffEmailHtml({
  school, studentName, vehicleName, droppedOffAt, mapUrl,
}) {
  return `
    <div style="font-family: Arial, sans-serif; color: #1e293b;">
      <h2 style="margin-bottom:4px;">${school?.name || 'School'}</h2>
      <p>Dear Parent/Guardian,</p>
      <p>
        <strong>${studentName}</strong> was dropped off by the school bus${vehicleName ? ` (${vehicleName})` : ''}
        at ${droppedOffAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${droppedOffAt.toLocaleDateString()}.
      </p>
      ${mapUrl ? `<p><a href="${mapUrl}">View drop-off location on map</a></p>` : ''}
      <p>Thank you.</p>
    </div>
  `;
}

// Fires right after one student's drop-off is recorded — best-effort SMS
// *and* email (unlike notifyPickup's SMS-only pre-pickup reminder above,
// this is a real-time "it just happened" confirmation, not a heads-up), same
// individually-try/caught, never-throws shape as
// financials/notify.js#notifyPaymentReceipt.
async function notifyDropoff(schoolId, {
  school, studentId, studentName, vehicleName, droppedOffAt, latitude, longitude,
}) {
  const summary = {
    sms: { attempted: 0, sent: 0, failed: 0 },
    email: { attempted: 0, sent: 0, failed: 0 },
    skippedNoContact: false,
  };

  const links = await tenantScoped(StudentParent, schoolId).findAll({
    where: { studentId },
    include: [Parent],
  });
  // Dedupe by Parent.id — same reasoning as notifyPickup above.
  const uniqueParents = [...new Map(links.map((l) => [l.Parent.id, l.Parent])).values()];
  if (uniqueParents.length === 0) {
    summary.skippedNoContact = true;
    return summary;
  }

  const mapUrl = buildMapUrl(latitude, longitude);
  const timeLabel = droppedOffAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const smsMessage = `Dear Parent, ${studentName} was dropped off by the school bus`
    + `${vehicleName ? ` (${vehicleName})` : ''} at ${timeLabel} on ${droppedOffAt.toLocaleDateString()}.`
    + `${mapUrl ? ` Location: ${mapUrl}` : ''} - ${school?.name || 'School'}`;

  const emailAppPassword = decryptSecret(school?.emailAppPasswordEncrypted);

  // Each parent's SMS and email are independent network calls — sent
  // concurrently (both across parents and, within a parent, SMS alongside
  // email), same reasoning as financials/notify.js#notifyPaymentReceipt.
  await Promise.all(uniqueParents.map(async (parent) => {
    const tasks = [];

    if (parent.phone) {
      summary.sms.attempted += 1;
      tasks.push(
        sendSms({ to: parent.phone, message: smsMessage, senderId: school?.smsSenderId, schoolId })
          .then((r) => { if (r.ok) summary.sms.sent += 1; else summary.sms.failed += 1; }),
      );
    }

    if (parent.email) {
      summary.email.attempted += 1;
      tasks.push(
        sendMail({
          to: parent.email,
          subject: `${studentName} — dropped off at ${timeLabel}`,
          html: dropoffEmailHtml({
            school, studentName, vehicleName, droppedOffAt, mapUrl,
          }),
          emailUser: school?.emailUser,
          emailAppPassword,
          fromName: school?.name,
        }).then((r) => { if (r.ok) summary.email.sent += 1; else summary.email.failed += 1; }),
      );
    }

    await Promise.all(tasks);
  }));

  return summary;
}

// Fires once, right after a trip starts (transport/service.js#startTrip) —
// one SMS/email per unique parent across every ENROLLED student on the
// vehicle (not per-student), same dedupe-by-Parent.id + best-effort/
// never-throws shape as notifyDropoff above.
async function notifyTripStarted(schoolId, {
  school, vehicle, driverName, tripType, studentIds,
}) {
  const summary = {
    sms: { attempted: 0, sent: 0, failed: 0 },
    email: { attempted: 0, sent: 0, failed: 0 },
    skippedNoContact: false,
  };
  if (studentIds.length === 0) {
    summary.skippedNoContact = true;
    return summary;
  }

  const links = await tenantScoped(StudentParent, schoolId).findAll({
    where: { studentId: studentIds },
    include: [Parent],
  });
  const uniqueParents = [...new Map(links.map((l) => [l.Parent.id, l.Parent])).values()];
  if (uniqueParents.length === 0) {
    summary.skippedNoContact = true;
    return summary;
  }

  // PICKUP: bus is heading out to collect students. DROPOFF: bus is heading
  // out to take them home — same broadcast mechanism, different wording so a
  // parent isn't left guessing which direction "has set off" means.
  const isPickup = tripType !== 'DROPOFF';
  const actionPhrase = isPickup ? 'is on its way to pick up students' : 'has set off to drop students home';
  const subjectPhrase = isPickup ? 'is on its way' : 'has set off';

  const smsMessage = `Dear Parent, the school bus${vehicle.name ? ` (${vehicle.name})` : ''}`
    + `${driverName ? ` driven by ${driverName}` : ''} ${actionPhrase}. `
    + `Track it live in the parent portal under your child's Transport page. - ${school?.name || 'School'}`;

  const emailAppPassword = decryptSecret(school?.emailAppPasswordEncrypted);
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; color: #1e293b;">
      <h2 style="margin-bottom:4px;">${school?.name || 'School'}</h2>
      <p>Dear Parent/Guardian,</p>
      <p>
        The school bus${vehicle.name ? ` <strong>${vehicle.name}</strong>` : ''}
        ${driverName ? ` (driver: ${driverName})` : ''} ${actionPhrase}.
      </p>
      <p>You can track its live location in the parent portal, under your child's Transport page.</p>
      <p>Thank you.</p>
    </div>
  `;

  await Promise.all(uniqueParents.map(async (parent) => {
    const tasks = [];

    if (parent.phone) {
      summary.sms.attempted += 1;
      tasks.push(
        sendSms({ to: parent.phone, message: smsMessage, senderId: school?.smsSenderId, schoolId })
          .then((r) => { if (r.ok) summary.sms.sent += 1; else summary.sms.failed += 1; }),
      );
    }

    if (parent.email) {
      summary.email.attempted += 1;
      tasks.push(
        sendMail({
          to: parent.email,
          subject: `${vehicle.name || 'The school bus'} ${subjectPhrase}`,
          html: emailHtml,
          emailUser: school?.emailUser,
          emailAppPassword,
          fromName: school?.name,
        }).then((r) => { if (r.ok) summary.email.sent += 1; else summary.email.failed += 1; }),
      );
    }

    await Promise.all(tasks);
  }));

  return summary;
}

module.exports = {
  notifyPickup, notifyDropoff, notifyTripStarted,
};
