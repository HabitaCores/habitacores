import { describe, expect, it } from 'vitest';

import { failure, isFailure, isSuccess, success } from './result.js';

describe('Result primitives', () => {
  it('creates a successful result', () => {
    const result = success({
      status: 'created',
    });

    expect(isSuccess(result)).toBe(true);
    expect(result.value.status).toBe('created');
  });

  it('creates a failed result', () => {
    const result = failure({
      code: 'INVALID_INPUT',
    });

    expect(isFailure(result)).toBe(true);
    expect(result.error.code).toBe('INVALID_INPUT');
  });
});
