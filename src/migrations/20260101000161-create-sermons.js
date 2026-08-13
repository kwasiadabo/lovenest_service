'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('sermons', {
      id: {
        type: Sequelize.UUID, primaryKey: true, allowNull: false,
      },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      title: { type: Sequelize.STRING(150), allowNull: false },
      scripture: { type: Sequelize.STRING(150), allowNull: true },
      speaker: { type: Sequelize.STRING(150), allowNull: true },
      body: { type: Sequelize.TEXT, allowNull: false },
      // The day this sermon is featured on the marketing site's daily
      // popup — see announcements' startDate/endDate migration for the
      // same DATEONLY convention.
      date: { type: Sequelize.DATEONLY, allowNull: false },
      imagesJson: { type: Sequelize.TEXT, allowNull: true },
      ctaLabel: { type: Sequelize.STRING(60), allowNull: true },
      ctaUrl: { type: Sequelize.STRING(300), allowNull: true },
      // NO ACTION, not CASCADE — schoolId already cascades from School
      // (same convention as announcements.createdByUserId).
      createdByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('sermons', ['schoolId']);
    await queryInterface.addIndex('sermons', ['schoolId', 'date']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('sermons');
  },
};
