'use strict';
const { randomUUID } = require('crypto');

// Fixed platform roles referenced throughout the codebase (§3 of the plan).
const ROLES = [
  { name: 'SUPER_ADMIN', description: 'Platform operator, cross-tenant access' },
  { name: 'SCHOOL_ADMIN', description: 'Full administrative access within one school' },
  { name: 'ADMINISTRATOR', description: 'Elevated non-teaching staff access within one school' },
  { name: 'HEAD_TEACHER', description: 'Read/approve access within one school' },
  { name: 'TEACHER', description: 'Manages an assigned class or subject: attendance, roster, scores' },
  { name: 'ACCOUNTANT', description: 'Manages billing within one school' },
  { name: 'PARENT', description: 'Read-only portal access scoped to their own linked children' },
];

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkInsert(
      'roles',
      ROLES.map((role) => ({ id: randomUUID(), ...role })),
    );
  },
  down: async (queryInterface) => {
    await queryInterface.bulkDelete('roles', { name: ROLES.map((r) => r.name) });
  },
};
