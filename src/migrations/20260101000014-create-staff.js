'use strict';

const POSITIONS = [
  'Headteacher',
  'Assistant Headteacher',
  'Class Teacher',
  'Subject Teacher',
  'Administrator',
  'Accountant',
  'Secretary',
  'Librarian',
  'Store Keeper',
  'Cleaner',
  'Security',
  'Cook',
  'Driver',
  'Nurse',
  'Other',
];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('staff', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      fullName: { type: Sequelize.STRING, allowNull: false },
      dateOfBirth: { type: Sequelize.DATEONLY, allowNull: false },
      dateHired: { type: Sequelize.DATEONLY, allowNull: false },
      position: { type: Sequelize.ENUM(...POSITIONS), allowNull: false },
      staffType: { type: Sequelize.ENUM('TEACHING', 'NON_TEACHING'), allowNull: false },
      qualification: { type: Sequelize.STRING, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('staff', ['schoolId']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('staff');
  },
};
