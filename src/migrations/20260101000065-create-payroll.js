'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('salary_structures', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      staffId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      effectiveDate: { type: Sequelize.DATEONLY, allowNull: false },
      basicSalaryPesewas: { type: Sequelize.INTEGER, allowNull: false },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('salary_structures', ['schoolId']);
    await queryInterface.addIndex('salary_structures', ['staffId']);

    await queryInterface.createTable('salary_components', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      salaryStructureId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'salary_structures', key: 'id' },
        onDelete: 'NO ACTION',
      },
      name: { type: Sequelize.STRING(60), allowNull: false },
      componentType: { type: Sequelize.ENUM('ALLOWANCE', 'OTHER_DEDUCTION'), allowNull: false },
      calcMethod: { type: Sequelize.ENUM('FIXED', 'PERCENT_OF_BASIC'), allowNull: false },
      amountPesewas: { type: Sequelize.INTEGER, allowNull: true },
      percent: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      taxable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('salary_components', ['schoolId']);
    await queryInterface.addIndex('salary_components', ['salaryStructureId']);

    // Platform-level, NOT schoolId-scoped — Ghana Revenue Authority PAYE
    // bands are national, not per-school. Rate changes ship as a new
    // seeder row (see seeders/), never a code change.
    await queryInterface.createTable('paye_tax_bands', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      effectiveFrom: { type: Sequelize.DATEONLY, allowNull: false },
      bandOrder: { type: Sequelize.INTEGER, allowNull: false },
      upToPesewas: { type: Sequelize.BIGINT, allowNull: true },
      ratePercent: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('paye_tax_bands', ['effectiveFrom']);

    await queryInterface.createTable('payroll_runs', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      payPeriodStart: { type: Sequelize.DATEONLY, allowNull: false },
      payPeriodEnd: { type: Sequelize.DATEONLY, allowNull: false },
      payPeriodLabel: { type: Sequelize.STRING(20), allowNull: false },
      academicYearId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'academic_years', key: 'id' },
        onDelete: 'NO ACTION',
      },
      termId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'terms', key: 'id' },
        onDelete: 'NO ACTION',
      },
      status: { type: Sequelize.ENUM('DRAFT', 'APPROVED', 'PAID'), allowNull: false, defaultValue: 'DRAFT' },
      createdByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      approvedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      approvedAt: { type: Sequelize.DATE, allowNull: true },
      paidByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      paidAt: { type: Sequelize.DATE, allowNull: true },
      cashAccountId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'cash_accounts', key: 'id' },
        onDelete: 'NO ACTION',
      },
      totalGrossPesewas: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      totalPayePesewas: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      totalSsnitEmployeePesewas: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      totalSsnitEmployerPesewas: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      totalOtherDeductionsPesewas: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      totalNetPesewas: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('payroll_runs', ['schoolId']);

    await queryInterface.createTable('payslips', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      payrollRunId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'payroll_runs', key: 'id' },
        onDelete: 'NO ACTION',
      },
      staffId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      grossPesewas: { type: Sequelize.INTEGER, allowNull: false },
      payePesewas: { type: Sequelize.INTEGER, allowNull: false },
      ssnitEmployeePesewas: { type: Sequelize.INTEGER, allowNull: false },
      ssnitEmployerPesewas: { type: Sequelize.INTEGER, allowNull: false },
      otherDeductionsPesewas: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      netPesewas: { type: Sequelize.INTEGER, allowNull: false },
      breakdownJson: { type: Sequelize.TEXT, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('payslips', ['schoolId']);
    await queryInterface.addIndex('payslips', ['payrollRunId']);
    await queryInterface.addIndex('payslips', ['staffId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('payslips');
    await queryInterface.dropTable('payroll_runs');
    await queryInterface.dropTable('paye_tax_bands');
    await queryInterface.dropTable('salary_components');
    await queryInterface.dropTable('salary_structures');
  },
};
