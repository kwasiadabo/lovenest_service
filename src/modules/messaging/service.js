const {
  MessageBatch, MessageRecipient, School, User,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const { sendSms } = require('../../utils/sms');
const { sendMail } = require('../../utils/mailer');
const { decryptSecret } = require('../../utils/secretCrypto');
const { runWithConcurrency } = require('../../utils/concurrency');
const { resolveParentRecipients, resolveTeacherRecipients } = require('./recipients');

const CONCURRENCY = 5;
const USER_SUMMARY_ATTRIBUTES = ['id', 'fullName', 'email'];

// The shared low-level primitive — every bulk send (generic Compose or a
// financials debt reminder) funnels through here for the actual send+log
// mechanics. Each recipient's SMS/email attempt is individually try/caught
// so one bad number or a transient mail failure never blocks the others —
// same "fire-and-report" contract as financials/notify.js's
// notifyPaymentReceipt, just chunked across many recipients instead of one
// student's 1-2 parents.
async function sendBatch(schoolId, {
  sentByUserId, audience, source, smsRequested, emailRequested, subject, messageTemplate,
  recipients, buildMessage, extraRecipientFields,
}) {
  // Fetched once per batch, not per recipient — every send in this batch
  // goes out under the same school's Sender ID / Gmail identity.
  const school = await School.findByPk(schoolId);
  const emailAppPassword = decryptSecret(school?.emailAppPasswordEncrypted);

  const summary = {
    sms: { attempted: 0, sent: 0, failed: 0 },
    email: { attempted: 0, sent: 0, failed: 0 },
    skippedNoContact: 0,
  };

  const resolveMessage = buildMessage || (() => ({
    smsMessage: messageTemplate,
    emailHtml: `<p>${messageTemplate}</p>`,
  }));

  const recipientRows = await runWithConcurrency(recipients, CONCURRENCY, async (recipient) => {
    const { smsMessage, emailHtml } = resolveMessage(recipient);
    const row = {
      recipientType: recipient.type,
      // Not recipient.id — a PARENT-audience recipient is now a family
      // contact bundle (emergency-contact SMS + one or more parents' email,
      // see recipients.js), not a single Parent row, so there's no one
      // parentId to link. staffId still maps 1:1 since Staff recipients are
      // unaggregated.
      parentId: null,
      staffId: recipient.type === 'STAFF' ? recipient.id : null,
      studentId: null,
      recipientName: recipient.name,
      phoneUsed: null,
      emailUsed: null,
      smsStatus: 'NOT_APPLICABLE',
      smsError: null,
      emailStatus: 'NOT_APPLICABLE',
      emailError: null,
      ...(extraRecipientFields ? extraRecipientFields(recipient) : {}),
    };

    let hadContact = false;

    if (smsRequested && recipient.phone) {
      hadContact = true;
      row.phoneUsed = recipient.phone;
      summary.sms.attempted += 1;
      try {
        const result = await sendSms({ to: recipient.phone, message: smsMessage, senderId: school?.smsSenderId, schoolId });
        if (result.ok) {
          row.smsStatus = 'SENT';
          summary.sms.sent += 1;
        } else {
          row.smsStatus = 'FAILED';
          row.smsError = result.error || null;
          summary.sms.failed += 1;
        }
      } catch (err) {
        row.smsStatus = 'FAILED';
        row.smsError = err.message;
        summary.sms.failed += 1;
      }
    }

    if (emailRequested && recipient.email) {
      hadContact = true;
      row.emailUsed = recipient.email;
      summary.email.attempted += 1;
      try {
        const result = await sendMail({
          to: recipient.email,
          subject,
          html: emailHtml,
          emailUser: school?.emailUser,
          emailAppPassword,
          fromName: school?.name,
        });
        if (result.ok) {
          row.emailStatus = 'SENT';
          summary.email.sent += 1;
        } else {
          row.emailStatus = 'FAILED';
          row.emailError = result.error || null;
          summary.email.failed += 1;
        }
      } catch (err) {
        row.emailStatus = 'FAILED';
        row.emailError = err.message;
        summary.email.failed += 1;
      }
    }

    if (!hadContact) summary.skippedNoContact += 1;
    return row;
  });

  const batch = await tenantScoped(MessageBatch, schoolId).create({
    sentByUserId: sentByUserId || null,
    audience,
    source,
    smsRequested: !!smsRequested,
    emailRequested: !!emailRequested,
    subject: subject || null,
    messageTemplate,
    recipientCount: recipients.length,
    smsAttempted: summary.sms.attempted,
    smsSent: summary.sms.sent,
    smsFailed: summary.sms.failed,
    emailAttempted: summary.email.attempted,
    emailSent: summary.email.sent,
    emailFailed: summary.email.failed,
    skippedNoContact: summary.skippedNoContact,
  });

  if (recipientRows.length > 0) {
    await tenantScoped(MessageRecipient, schoolId).bulkCreate(
      recipientRows.map((row) => ({ ...row, batchId: batch.id })),
    );
  }

  return { batchId: batch.id, recipientCount: recipients.length, summary };
}

async function composeSend(schoolId, userId, {
  audience, levelId, classId, staffType, smsRequested, emailRequested, subject, message, selectedKeys,
}) {
  let recipients = audience === 'PARENTS'
    ? await resolveParentRecipients(schoolId, { levelId, classId })
    : await resolveTeacherRecipients(schoolId, { staffType });

  // The compose screen's recipients table lets the sender uncheck specific
  // rows before sending — selectedKeys (from recipients.js's stable `key`)
  // narrows the server-resolved list down to just those. Omitting it
  // entirely (not an empty array) keeps the old "send to everyone the
  // filter matches" behavior.
  if (Array.isArray(selectedKeys)) {
    const keySet = new Set(selectedKeys);
    recipients = recipients.filter((r) => keySet.has(r.key));
  }

  if (recipients.length === 0) throw new ApiError(400, 'No recipients match this filter');

  return sendBatch(schoolId, {
    sentByUserId: userId,
    audience,
    source: 'COMPOSE',
    smsRequested,
    emailRequested,
    subject,
    messageTemplate: message,
    recipients,
  });
}

async function previewRecipients(schoolId, audience, filters) {
  const recipients = audience === 'PARENTS'
    ? await resolveParentRecipients(schoolId, filters)
    : await resolveTeacherRecipients(schoolId, filters);
  return { count: recipients.length, recipients };
}

async function listMessageBatches(schoolId, { audience, source } = {}) {
  const where = {};
  if (audience) where.audience = audience;
  if (source) where.source = source;
  return tenantScoped(MessageBatch, schoolId).findAll({
    where,
    include: [{ model: User, as: 'sentBy', attributes: USER_SUMMARY_ATTRIBUTES }],
    order: [['createdAt', 'DESC']],
  });
}

async function getMessageBatch(schoolId, batchId) {
  const batch = await tenantScoped(MessageBatch, schoolId).findByPk(batchId, {
    include: [
      { model: User, as: 'sentBy', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: MessageRecipient, as: 'recipients' },
    ],
  });
  if (!batch) throw new ApiError(404, 'Message batch not found');
  return batch;
}

module.exports = {
  sendBatch, composeSend, previewRecipients, listMessageBatches, getMessageBatch,
};
