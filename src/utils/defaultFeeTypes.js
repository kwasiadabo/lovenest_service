// Every school starts with these 4 fee categories (amounts are set later,
// per level, on the Fees setup page); admins can also add custom ones
// (category OTHER) for things like PTA dues or feeding fees.
const DEFAULT_FEE_TYPES = [
  { name: 'Admission Fee', category: 'ADMISSION' },
  { name: 'Term Fees', category: 'TERM' },
  { name: 'Books', category: 'BOOKS' },
  { name: 'Uniforms', category: 'UNIFORM' },
];

async function seedDefaultFeeTypes(FeeType, schoolId, transaction) {
  await FeeType.bulkCreate(
    DEFAULT_FEE_TYPES.map((feeType) => ({ schoolId, ...feeType })),
    { transaction },
  );
}

module.exports = { DEFAULT_FEE_TYPES, seedDefaultFeeTypes };
