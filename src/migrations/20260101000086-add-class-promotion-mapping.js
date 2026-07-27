'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('classes', 'nextClassId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'classes', key: 'id' },
      // NO ACTION, not SET NULL — SQL Server rejects a self-referencing FK
      // with a cascading action ("may cause cycles or multiple cascade
      // paths"), even for SET NULL. academic/service.js#deleteClass clears
      // any other class's nextClassId pointing at the one being deleted
      // before removing it, achieving the same "mapping just clears" effect
      // in application code instead.
      onDelete: 'NO ACTION',
    });
    await queryInterface.addColumn('classes', 'isGraduatingClass', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('classes', 'isGraduatingClass');
    await queryInterface.removeColumn('classes', 'nextClassId');
  },
};
