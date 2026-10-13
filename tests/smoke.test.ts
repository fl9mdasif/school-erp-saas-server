import { it, expect } from 'vitest';
import { APP_NAME } from '../src/app/config/constants';

it('boots the test runner', () => {
  expect(APP_NAME).toBe('school-management-server');
});
