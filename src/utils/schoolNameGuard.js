const ApiError = require('./ApiError');

// Case/whitespace/punctuation-insensitive so "WestHatch School" and
// "Westhatch School" collapse to the same key.
function normalize(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Classic edit-distance DP — small inputs (school names), so the O(n*m)
// table is negligible.
function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist = Array.from({ length: rows }, (_, i) => [i, ...new Array(cols - 1).fill(0)]);
  for (let j = 1; j < cols; j += 1) dist[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(
        dist[i - 1][j] + 1,
        dist[i][j - 1] + 1,
        dist[i - 1][j - 1] + cost,
      );
    }
  }
  return dist[rows - 1][cols - 1];
}

// A couple of stray characters ("Westhatch" vs "West Hatch School" once
// normalized) still counts as the same name; longer names get a little more
// slack since a handful of edits matters less at that length.
function isTooSimilar(normalizedA, normalizedB) {
  if (!normalizedA || !normalizedB) return false;
  if (normalizedA === normalizedB) return true;
  const distance = levenshtein(normalizedA, normalizedB);
  const threshold = Math.max(2, Math.floor(Math.min(normalizedA.length, normalizedB.length) * 0.1));
  return distance <= threshold;
}

// Guards school registration (both the public onboarding form and the
// SuperAdmin platform console) against near-duplicate names — the platform
// otherwise has no uniqueness constraint on School.name, only on School.code,
// which a submitter never sees or picks themselves.
async function assertUniqueSchoolName(School, name, { excludeId } = {}) {
  const normalizedCandidate = normalize(name);
  const existingSchools = await School.findAll({ attributes: ['id', 'name'] });

  for (const school of existingSchools) {
    if (excludeId && school.id === excludeId) continue;
    if (isTooSimilar(normalizedCandidate, normalize(school.name))) {
      throw new ApiError(409, `A school with a very similar name ("${school.name}") is already registered — please use a more distinct name`);
    }
  }
}

module.exports = { assertUniqueSchoolName };
