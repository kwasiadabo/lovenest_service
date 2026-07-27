// Levels are fixed, not admin-editable (per plan decision): every school gets
// exactly these 5, seeded once at school-creation time.
// One merged "Pre-school" level (Nursery and Kindergarten classes both live
// under it — see ClassesPage, where a school admin names individual classes
// "Nursery 1"/"KG 1" etc within this one level). The category code stays
// 'NURSERY' internally so report-card branching
// (reportCards/service.js#isEarlyYearsCategory, `=== 'NURSERY' || === 'KG'`)
// keeps working unchanged — 'KG' remains a valid category value for that
// check even though no Level row uses it anymore post-merge.
const DEFAULT_LEVELS = [
  { name: 'Pre-school', category: 'NURSERY', sequenceOrder: 1 },
  { name: 'Lower Primary', category: 'PRIMARY', sequenceOrder: 2 },
  { name: 'Upper Primary', category: 'PRIMARY', sequenceOrder: 3 },
  { name: 'JHS', category: 'JHS', sequenceOrder: 4 },
];

async function seedDefaultLevels(Level, schoolId, transaction) {
  await Level.bulkCreate(
    DEFAULT_LEVELS.map((level) => ({ schoolId, ...level })),
    { transaction },
  );
}

module.exports = { DEFAULT_LEVELS, seedDefaultLevels };
