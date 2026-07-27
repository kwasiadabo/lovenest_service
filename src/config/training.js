// Mandatory one-time onboarding training (3 days, max 15 attendees per
// school) — pricing per plan §training. Snapshotted onto TrainingEnrollment
// at creation, so a later change here never retroactively alters what an
// already-provisioned school owes/paid.
const TRAINING_COSTS_PESEWAS = {
  IN_PERSON: 370000, // GH₵ 3,700.00
  ONLINE: 250000, // GH₵ 2,500.00
};

const MAX_TRAINING_ATTENDEES = 15;
const TRAINING_DURATION_DAYS = 3;

module.exports = { TRAINING_COSTS_PESEWAS, MAX_TRAINING_ATTENDEES, TRAINING_DURATION_DAYS };
