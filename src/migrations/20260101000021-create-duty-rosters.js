'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('duty_rosters', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      dutyId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'staff_duties', key: 'id' },
        onDelete: 'NO ACTION',
      },
      staffId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      date: { type: Sequelize.DATEONLY, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('duty_rosters', ['schoolId']);
    await queryInterface.addIndex('duty_rosters', ['date']);
    await queryInterface.addIndex('duty_rosters', ['dutyId', 'staffId', 'date'], { unique: true });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('duty_rosters');
  },
};
