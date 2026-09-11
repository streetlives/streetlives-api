/**
 * @jest-environment node
 */

import { formatIsoWithTimezone } from '../../src/utils/times';

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
