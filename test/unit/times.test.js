/**
 * @jest-environment node
 */

import { formatIsoWithTimezone, formatDateOnly, addDaysToDateOnly } from '../../src/utils/times';

describe('formatIsoWithTimezone', () => {
  it('formats an instant as New York local time even across the UTC day boundary', () => {
    // 01:30 UTC on July 14 is still 21:30 on July 13 in New York (EDT).
    expect(formatIsoWithTimezone(new Date('2026-07-14T01:30:00Z'), 'America/New_York'))
      .toBe('2026-07-13T21:30:00-04:00');
  });

  it('uses the standard-time offset in winter', () => {
    expect(formatIsoWithTimezone(new Date('2026-01-14T01:30:00Z'), 'America/New_York'))
      .toBe('2026-01-13T20:30:00-05:00');
  });

  it('round-trips back to the same instant', () => {
    const instant = new Date('2026-03-08T06:59:00Z'); // just before the DST switch
    const formatted = formatIsoWithTimezone(instant, 'America/New_York');
    expect(new Date(formatted).getTime()).toBe(instant.getTime());
  });
});

describe('formatDateOnly', () => {
  it('returns the New York calendar date, not the UTC one', () => {
    // 02:00 UTC on Dec 1 is still Nov 30 in New York.
    expect(formatDateOnly(new Date('2026-12-01T02:00:00Z'), 'America/New_York'))
      .toBe('2026-11-30');
  });
});

describe('addDaysToDateOnly', () => {
  it('moves across month and year ends', () => {
    expect(addDaysToDateOnly('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDaysToDateOnly('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('counts calendar days across a DST change', () => {
    expect(addDaysToDateOnly('2026-11-02', -1)).toBe('2026-11-01');
  });
});
