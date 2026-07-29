'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('schools', 'termGraceEndsAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('schools', 'termPaymentPromptSentAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('schools', 'termPaymentPromptSentAt');
    await queryInterface.removeColumn('schools', 'termGraceEndsAt');
  },
};
