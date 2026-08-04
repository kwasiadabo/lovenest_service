'use strict';

// Same SQL Server quirk fixed for bills.billingCycle in
// 20260101000134-fix-monthly-billing-fields-on-bills.js: addColumn with an
// ENUM + defaultValue doesn't backfill pre-existing rows on this dialect —
// every class that existed before 20260101000132 was left with
// feeBillingCycle = NULL instead of 'TERMLY'.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query("UPDATE [classes] SET [feeBillingCycle] = 'TERMLY' WHERE [feeBillingCycle] IS NULL");
  },

  down: async () => {
    // Data backfill isn't reversed — same convention as other corrective
    // migrations in this codebase (e.g. 20260101000134).
  },
};
