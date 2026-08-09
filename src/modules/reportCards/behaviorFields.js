// Single source of truth for the report card's fixed-schema sections —
// imported by reportCards/service.js (JSON parse/stringify against the
// ReportCard model's TEXT columns) and reportCards/validators.js, and
// mirrored on the frontend (RemarksFormPage.jsx, ReportCardDocument.jsx) so
// the schema can never drift between what's saved, what's validated, and
// what's rendered.

const BEHAVIOR_PROGRESS_FIELDS = [
  { key: 'abilityToCompleteTasks', label: 'Ability to Complete Tasks' },
  { key: 'completesSubmitsHomework', label: 'Completes and Submits Homework' },
  { key: 'endorsementOfSignedPapers', label: 'Endorsement of Signed Papers' },
  { key: 'sharingIdeasContributions', label: 'Sharing Ideas / Contributions' },
  { key: 'respectForOthers', label: 'Respect for Others' },
  { key: 'collaborationInGroups', label: 'Collaboration in Groups' },
  { key: 'organisationAndReliability', label: 'Organisation and Reliability' },
  { key: 'attitudeTowardsLearning', label: 'Attitude towards Learning' },
  { key: 'concentrationInClass', label: 'Concentration in Class' },
  { key: 'courtesyAndEmpathy', label: 'Courtesy and Empathy' },
  { key: 'dependabilityAndResponsibility', label: 'Dependability and Responsibility' },
  { key: 'leadershipAbility', label: 'Leadership Ability' },
];

const GENERAL_COMMENTS_FIELDS = [
  { key: 'generalPersonality', label: 'General Personality' },
  { key: 'behaviour', label: 'Behaviour' },
  { key: 'friendships', label: 'Friendships' },
  { key: 'workingWithOthers', label: 'Working with Others' },
  { key: 'sharingIdeasAndContributions', label: 'Sharing Ideas and Contributions' },
];

const LEARNING_BEHAVIOUR_FIELDS = [
  { key: 'beingReflective', label: 'Being Reflective' },
  { key: 'havingGoodRelationships', label: 'Having Good Relationships' },
  { key: 'beingResilient', label: 'Being Resilient' },
  { key: 'beingResourceful', label: 'Being Resourceful' },
  { key: 'takingRisks', label: 'Taking Risks' },
];

const GROWTH_MINDSET_FIELDS = [
  { key: 'embracingChallenges', label: 'Embracing Challenges' },
  { key: 'persistingInFaceOfDifficulty', label: 'Persisting in the Face of Difficulty' },
  { key: 'seeingEffortAsPathToMastery', label: 'Seeing Effort as a Path to Mastery' },
  { key: 'learningFromCriticism', label: 'Learning from Criticism' },
  { key: 'findingLessonsAndInspiration', label: 'Finding Lessons and Inspiration' },
];

// Static legend printed on every report card (not a school setting) —
// EFFORT_GRADES is what ExamScore.effort / the Effort <select> validate
// against.
const EFFORT_SCHEME = [
  { grade: 'A', label: 'Outstanding effort has been made' },
  { grade: 'B', label: 'Has worked very hard' },
  { grade: 'C', label: 'Making a reasonable effort' },
  { grade: 'D', label: 'More effort required' },
  { grade: 'E', label: 'Serious cause for concern, so much effort required' },
];
const EFFORT_GRADES = EFFORT_SCHEME.map((e) => e.grade);

// Parses a stored TEXT blob into a plain object with exactly the fixed
// key set (missing/unparseable -> null per key), so a caller never has to
// guard against a stray/legacy key or a malformed JSON string.
function parseJsonFields(raw, fieldDefs) {
  let parsed = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw) || {};
    } catch {
      parsed = {};
    }
  }
  const result = {};
  fieldDefs.forEach(({ key }) => {
    result[key] = parsed[key] === undefined ? null : parsed[key];
  });
  return result;
}

// Builds the TEXT blob to store — always the full fixed key set (a save
// always submits the whole section, see RemarksFormPage.jsx), so a stray
// key from a previous schema version can never survive a save.
function stringifyJsonFields(values, fieldDefs) {
  const result = {};
  fieldDefs.forEach(({ key }) => {
    result[key] = values[key] === undefined ? null : values[key];
  });
  return JSON.stringify(result);
}

// Behavior progress: each value must be null or a number 0-100.
function validateProgressValues(values) {
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    return 'must be an object';
  }
  for (const { key, label } of BEHAVIOR_PROGRESS_FIELDS) {
    const value = values[key];
    if (value === undefined || value === null || value === '') continue;
    const num = Number(value);
    if (Number.isNaN(num) || num < 0 || num > 100) {
      return `${label} must be a number between 0 and 100`;
    }
  }
  return null;
}

// Comment sections: each value must be null/absent or a string, capped at a
// generous length (these are short paragraphs, not essays).
const MAX_COMMENT_LENGTH = 1000;
function validateCommentValues(values, fieldDefs) {
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    return 'must be an object';
  }
  for (const { key, label } of fieldDefs) {
    const value = values[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string') return `${label} must be a string`;
    if (value.length > MAX_COMMENT_LENGTH) return `${label} must be ${MAX_COMMENT_LENGTH} characters or fewer`;
  }
  return null;
}

module.exports = {
  BEHAVIOR_PROGRESS_FIELDS,
  GENERAL_COMMENTS_FIELDS,
  LEARNING_BEHAVIOUR_FIELDS,
  GROWTH_MINDSET_FIELDS,
  EFFORT_SCHEME,
  EFFORT_GRADES,
  parseJsonFields,
  stringifyJsonFields,
  validateProgressValues,
  validateCommentValues,
};
