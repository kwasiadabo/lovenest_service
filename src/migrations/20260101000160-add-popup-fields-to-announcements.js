'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('announcements', 'imagesJson', { type: Sequelize.TEXT, allowNull: true });
    await queryInterface.addColumn('announcements', 'ctaLabel', { type: Sequelize.STRING(60), allowNull: true });
    await queryInterface.addColumn('announcements', 'ctaUrl', { type: Sequelize.STRING(300), allowNull: true });
    // The window this announcement shows in the marketing site's popup —
    // unset (null) on either end means "don't show it there at all"; the
    // dashboard feed (announcements/service.js#list) ignores these entirely.
    await queryInterface.addColumn('announcements', 'startDate', { type: Sequelize.DATEONLY, allowNull: true });
    await queryInterface.addColumn('announcements', 'endDate', { type: Sequelize.DATEONLY, allowNull: true });
    await queryInterface.addIndex('announcements', ['schoolId', 'startDate', 'endDate']);
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex('announcements', ['schoolId', 'startDate', 'endDate']);
    await queryInterface.removeColumn('announcements', 'endDate');
    await queryInterface.removeColumn('announcements', 'startDate');
    await queryInterface.removeColumn('announcements', 'ctaUrl');
    await queryInterface.removeColumn('announcements', 'ctaLabel');
    await queryInterface.removeColumn('announcements', 'imagesJson');
  },
};
