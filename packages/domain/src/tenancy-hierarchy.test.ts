import { describe, expect, it } from 'vitest';

import { TENANCY_HIERARCHY_ORDER } from './tenancy-hierarchy.js';

describe('tenancy hierarchy', () => {
  it('preserves the approved hierarchy order', () => {
    expect(TENANCY_HIERARCHY_ORDER).toEqual([
      'organization',
      'property',
      'community',
      'building',
      'block',
      'floor',
      'unit',
    ]);
  });
});
