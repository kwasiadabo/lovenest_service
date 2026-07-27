'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('schools', 'smsSenderId', { type: Sequelize.STRING(20), allowNull: true });
    await queryInterface.addColumn('schools', 'emailUser', { type: Sequelize.STRING, allowNull: true });
    // Encrypted (AES-256-GCM, see backend/src/utils/secretCrypto.js) — never
    // the plaintext Gmail App Password. Nullable/optional: a school can
    // register without these and add them later via Settings.
    await queryInterface.addColumn('schools', 'emailAppPasswordEncrypted', { type: Sequelize.STRING(500), allowNull: true });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('schools', 'emailAppPasswordEncrypted');
    await queryInterface.removeColumn('schools', 'emailUser');
    await queryInterface.removeColumn('schools', 'smsSenderId');
  },
};
