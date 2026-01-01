import { beforeAll, afterEach, afterAll } from 'vitest';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Clean up after each test
afterEach(() => {
  // Reset any mocks or state between tests
});

// Global setup
beforeAll(() => {
  // Any global test setup
});

// Global teardown
afterAll(() => {
  // Any global cleanup
});
