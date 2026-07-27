'use strict';

// Pure data rename — every school's fixed Level rows (see
// utils/defaultLevels.js) get "Pre-school 1"/"Pre-school 2" as their display
// name instead of "Nursery"/"Kindergarten". The category codes (NURSERY/KG)
// are untouched, so this needs no constraint changes and nothing else that
// keys off category (report cards' isEarlyYearsCategory, etc.) is affected.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `UPDATE levels SET name = 'Pre-school 1' WHERE category = 'NURSERY' AND name = 'Nursery'`,
    );
    await queryInterface.sequelize.query(
      `UPDATE levels SET name = 'Pre-school 2' WHERE category = 'KG' AND name = 'Kindergarten'`,
    );
  },
  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `UPDATE levels SET name = 'Nursery' WHERE category = 'NURSERY' AND name = 'Pre-school 1'`,
    );
    await queryInterface.sequelize.query(
      `UPDATE levels SET name = 'Kindergarten' WHERE category = 'KG' AND name = 'Pre-school 2'`,
    );
  },
};
