'use strict';

// Adds LICENSE, CV, and COVER_LETTER to staff_documents.documentType — the
// upload feature (modules/staffDocuments, StaffProfilePage's document tab)
// already supported any document type generically; only the allowed set was
// too narrow (CONTRACT/ID/CERTIFICATE/OTHER) to label these explicitly.
async function dropDocumentTypeConstraint(queryInterface) {
  const [checkConstraints] = await queryInterface.sequelize.query(`
    SELECT cc.name
    FROM sys.check_constraints cc
    WHERE cc.parent_object_id = OBJECT_ID('staff_documents') AND cc.definition LIKE '%documentType%'
  `);
  for (const { name } of checkConstraints) {
    await queryInterface.sequelize.query(`ALTER TABLE [staff_documents] DROP CONSTRAINT [${name}]`);
  }
}

module.exports = {
  up: async (queryInterface) => {
    await dropDocumentTypeConstraint(queryInterface);
    // queryInterface.changeColumn(..., { type: Sequelize.ENUM(...) }) emits
    // invalid T-SQL for an ENUM->ENUM change on this Sequelize/mssql
    // combination (confirmed: "Incorrect syntax near the keyword 'CHECK'")
    // — same raw-SQL fallback as 20260101000094-add-pending-payment-
    // transport-status.js. Column stays the same VARCHAR(255) it already was.
    await queryInterface.sequelize.query(`
      ALTER TABLE [staff_documents] ADD CONSTRAINT [CK_staff_documents_documentType]
        CHECK ([documentType] IN (N'CONTRACT', N'ID', N'CERTIFICATE', N'LICENSE', N'CV', N'COVER_LETTER', N'OTHER'))
    `);
  },

  down: async (queryInterface) => {
    await dropDocumentTypeConstraint(queryInterface);
    // Lossy: any row using one of the three new types would need reclassifying
    // before rolling back — same caveat as other narrowing "down" migrations
    // in this project (e.g. 20260101000091-remove-late-attendance-status.js).
    await queryInterface.sequelize.query(`
      ALTER TABLE [staff_documents] ADD CONSTRAINT [CK_staff_documents_documentType]
        CHECK ([documentType] IN (N'CONTRACT', N'ID', N'CERTIFICATE', N'OTHER'))
    `);
  },
};
