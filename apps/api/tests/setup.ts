import { vi } from 'vitest';

// Set test environment variables
process.env.DATA_DIR = './tests/data';
process.env.DB_PATH = './tests/data/test.db';
process.env.PORT = '0'; // Random port

// Mock crypto.randomUUID for consistent test IDs
let idCounter = 0;
const originalCrypto = globalThis.crypto;
Object.defineProperty(globalThis, 'crypto', {
  value: {
    ...originalCrypto,
    randomUUID: () => `test-uuid-${++idCounter}`,
  },
  writable: true,
  configurable: true,
});

// Reset ID counter before each test
beforeEach(() => {
  idCounter = 0;
});

// Mock console methods in tests to reduce noise
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  if (process.env.VERBOSE_TESTS !== 'true') {
    console.log = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();
  }
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});