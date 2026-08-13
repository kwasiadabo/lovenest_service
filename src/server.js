require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');
const { startScheduler } = require('./jobs/scheduler');

const PORT = process.env.PORT || 4000;

async function start() {
  await sequelize.authenticate();
  // Not started under test — Jest runs shouldn't leave a cron ticking.
  if (process.env.NODE_ENV !== 'test') {
    startScheduler();
  }
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Lovenest API listening on port ${PORT}`);
  });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
