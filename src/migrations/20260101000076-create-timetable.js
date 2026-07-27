'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('timetable_periods', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING(50), allowNull: false },
      // Plain "HH:MM" 24h strings rather than a TIME column — avoids
      // cross-dialect TIME serialization quirks, and a period never needs
      // arithmetic beyond display/ordering.
      startTime: { type: Sequelize.STRING(5), allowNull: false },
      endTime: { type: Sequelize.STRING(5), allowNull: false },
      sortOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      isBreak: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('timetable_periods', ['schoolId']);
    await queryInterface.addIndex('timetable_periods', ['schoolId', 'name'], { unique: true });

    await queryInterface.createTable('timetable_slots', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      classId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'classes', key: 'id' },
        onDelete: 'NO ACTION',
      },
      periodId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'timetable_periods', key: 'id' },
        onDelete: 'NO ACTION',
      },
      dayOfWeek: {
        type: Sequelize.ENUM('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'),
        allowNull: false,
      },
      subjectId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'subjects', key: 'id' },
        onDelete: 'NO ACTION',
      },
      // Denormalized from subject_teachers at save time (see
      // modules/timetable/service.js#saveClassTimetable) rather than
      // resolved live on every read — this is also what the double-booking
      // check queries directly, across every class in the school.
      staffId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('timetable_slots', ['schoolId']);
    await queryInterface.addIndex('timetable_slots', ['classId']);
    // A teacher can't be in two places in the same period — enforced at the
    // service layer (across the whole school), this index is what makes
    // that check a fast lookup rather than a full scan.
    await queryInterface.addIndex('timetable_slots', ['schoolId', 'dayOfWeek', 'periodId', 'staffId']);
    await queryInterface.addIndex('timetable_slots', ['classId', 'dayOfWeek', 'periodId'], { unique: true });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('timetable_slots');
    await queryInterface.dropTable('timetable_periods');
  },
};
