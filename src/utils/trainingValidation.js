const { MAX_TRAINING_ATTENDEES } = require('../config/training');

// Shared by platform/validators.js (SuperAdmin provisioning) and
// onboarding/validators.js (public self-serve signup) — both creation paths
// require the same mandatory training fields. Returns an error message
// string, or null if valid.
function validateTrainingFields(body) {
  const { trainingMode, trainingAttendeeCount } = body || {};

  if (trainingMode !== 'IN_PERSON' && trainingMode !== 'ONLINE') {
    return 'trainingMode is required and must be "IN_PERSON" or "ONLINE"';
  }

  const count = Number(trainingAttendeeCount);
  if (!Number.isFinite(count) || count < 1 || count > MAX_TRAINING_ATTENDEES) {
    return `trainingAttendeeCount is required and must be between 1 and ${MAX_TRAINING_ATTENDEES}`;
  }

  return null;
}

module.exports = { validateTrainingFields };
