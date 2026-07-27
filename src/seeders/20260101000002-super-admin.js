'use strict';
const { randomUUID } = require('crypto');
const bcrypt = require('bcrypt');

const EMAIL = process.env.SUPER_ADMIN_EMAIL || 'superadmin@vx-school.dev';
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe123!';

module.exports = {
  up: async (queryInterface) => {
    const [[role]] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE name = 'SUPER_ADMIN'`,
    );
    if (!role) throw new Error('SUPER_ADMIN role not found — run the roles seeder first');

    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(PASSWORD, 12);

    await queryInterface.bulkInsert('users', [{
      id: userId,
      schoolId: null,
      email: EMAIL,
      passwordHash,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);

    await queryInterface.bulkInsert('user_roles', [{
      id: randomUUID(),
      userId,
      roleId: role.id,
    }]);
  },
  down: async (queryInterface) => {
    await queryInterface.bulkDelete('users', { email: EMAIL });
  },
};
