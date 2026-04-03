/* eslint-disable */
/**
 * Global setup for Jest e2e suite.
 * No external services are required – tests in this project use in-process mocks.
 */
module.exports = async function () {
  console.log('\nSetting up...\n');
  globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down...\n';
};
