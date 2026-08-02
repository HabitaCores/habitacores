import { describe, expect, it } from 'vitest';

import { applicationMetadata } from './application';

describe('applicationMetadata', () => {
  it('identifies the Habitacores product and initial market', () => {
    expect(applicationMetadata.name).toBe('Habitacores');
    expect(applicationMetadata.initialMarket).toBe('Nigeria');
    expect(applicationMetadata.implementationStatus).toBe('foundational');
  });
});
