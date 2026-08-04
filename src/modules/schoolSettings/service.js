const { School } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { encryptSecret } = require('../../utils/secretCrypto');

// The stored value never round-trips back to the browser (same convention
// as a "change password" flow) — only whether one is currently set, so the
// UI can show "configured" vs "not configured" without ever exposing it.
async function getSettings(schoolId) {
  const school = await School.findByPk(schoolId, {
    attributes: [
      'id', 'smsSenderId', 'emailUser', 'emailAppPasswordEncrypted',
      'thirdChildDiscountPercent', 'fourthChildAndAboveDiscountPercent', 'headteacherSignatureUrl',
      'paymentInstructions',
    ],
  });
  if (!school) throw new ApiError(404, 'School not found');

  return {
    smsSenderId: school.smsSenderId,
    emailUser: school.emailUser,
    emailAppPasswordSet: !!school.emailAppPasswordEncrypted,
    thirdChildDiscountPercent: Number(school.thirdChildDiscountPercent),
    fourthChildAndAboveDiscountPercent: Number(school.fourthChildAndAboveDiscountPercent),
    headteacherSignatureUrl: school.headteacherSignatureUrl,
    paymentInstructions: school.paymentInstructions,
  };
}

// smsSenderId/emailUser are set directly (undefined = leave unchanged,
// '' = clear). emailAppPassword follows the same convention, plus is
// encrypted before storage — a blank submission clears it (e.g. the school
// switched Gmail accounts and wants to remove the old one), while omitting
// the field entirely (not sent at all) leaves the existing one untouched so
// the settings form never has to re-display (or blank out) a secret it
// can't show back to the admin.
async function updateSettings(schoolId, {
  smsSenderId, emailUser, emailAppPassword, thirdChildDiscountPercent, fourthChildAndAboveDiscountPercent,
  paymentInstructions,
}) {
  const school = await School.findByPk(schoolId, {
    attributes: [
      'id', 'smsSenderId', 'emailUser', 'emailAppPasswordEncrypted',
      'thirdChildDiscountPercent', 'fourthChildAndAboveDiscountPercent', 'paymentInstructions',
    ],
  });
  if (!school) throw new ApiError(404, 'School not found');

  if (smsSenderId !== undefined) school.smsSenderId = smsSenderId.trim() || null;
  if (emailUser !== undefined) school.emailUser = emailUser.trim() || null;
  if (emailAppPassword !== undefined) {
    school.emailAppPasswordEncrypted = emailAppPassword.trim() ? encryptSecret(emailAppPassword.trim()) : null;
  }
  if (thirdChildDiscountPercent !== undefined) school.thirdChildDiscountPercent = Number(thirdChildDiscountPercent);
  if (fourthChildAndAboveDiscountPercent !== undefined) {
    school.fourthChildAndAboveDiscountPercent = Number(fourthChildAndAboveDiscountPercent);
  }
  if (paymentInstructions !== undefined) school.paymentInstructions = paymentInstructions.trim() || null;

  await school.save();

  return {
    smsSenderId: school.smsSenderId,
    emailUser: school.emailUser,
    emailAppPasswordSet: !!school.emailAppPasswordEncrypted,
    thirdChildDiscountPercent: Number(school.thirdChildDiscountPercent),
    fourthChildAndAboveDiscountPercent: Number(school.fourthChildAndAboveDiscountPercent),
    paymentInstructions: school.paymentInstructions,
  };
}

async function updateSignature(schoolId, signatureUrl) {
  const school = await School.findByPk(schoolId, { attributes: ['id', 'headteacherSignatureUrl'] });
  if (!school) throw new ApiError(404, 'School not found');

  if (signatureUrl !== undefined) {
    school.headteacherSignatureUrl = signatureUrl;
    await school.save();
  }

  return { headteacherSignatureUrl: school.headteacherSignatureUrl };
}

module.exports = {
  getSettings, updateSettings, updateSignature,
};
