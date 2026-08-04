// Runs once per Jest worker, before that worker requires any app code (src/
// models, src/app, etc.) — this is the only hook point where an env var
// override is guaranteed to be visible to those `require()` calls (unlike
// globalSetup, which runs in a separate orchestration process that doesn't
// share process.env with the actual test-running workers).
require('dotenv').config();

process.env.NODE_ENV = 'test';

// config/config.js's `test` block reads DB_NAME_TEST, defaulting to the
// literal 'vx_school_test'. That database isn't provisioned on this
// shared-hosting account (confirmed while wiring up this test suite — the
// account only has one database slot) and dotenv won't overwrite an
// already-set env var, so this override is what actually takes effect.
// Tests therefore run against the same database as development, NOT an
// isolated one — every fixture created under tests/helpers/testFixtures.js
// is unmistakably marked (TEST_SCHOOL_NAME_PREFIX) and torn down in each
// suite's afterAll, precisely because of this. Swap this back to a real
// isolated test database the moment one exists.
process.env.DB_NAME_TEST = process.env.DB_NAME;
