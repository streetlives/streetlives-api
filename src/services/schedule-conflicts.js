import { findConflicts } from '../utils/schedule-rules';
import { getDayOfWeekInteger } from '../utils/times';
import { ValidationError } from '../utils/errors';

// How far ahead a schedule is checked: a year covers every weekly, monthly and yearly rule.
const CONFLICT_HORIZON_DAYS = 366;

// A PATCH /services irregularHours entry as the row schedule-rules.js reads.
const toRow = hours => ({
  closed: !!hours.closed,
  opens_at: hours.opensAt || null,
  closes_at: hours.closesAt || null,
  weekday: hours.weekday != null ? getDayOfWeekInteger(hours.weekday) : null,
  freq: hours.freq || null,
  interval: hours.interval || null,
  byday: hours.byday || null,
  bymonthday: hours.bymonthday || null,
  bymonth: hours.bymonth || null,
  valid_from: hours.validFrom || hours.startDate || null,
  valid_to: hours.validTo || hours.endDate || null,
  exdates: hours.exdates || null,
});

const describeRow = (row) => {
  const on = row.freq || row.weekday != null
    ? [row.byday, row.bymonthday && `day ${row.bymonthday}`, row.bymonth && `month ${row.bymonth}`]
      .filter(Boolean).join(' ')
    : row.valid_from;
  return `${on} ${row.opens_at.slice(0, 5)}-${row.closes_at.slice(0, 5)}`;
};

const describeConflict = ({
  type, rows: [first, second], first: date, count,
}) => {
  const more = count > 1 ? ` and ${count - 1} more date${count > 2 ? 's' : ''}` : '';
  if (type === 'closed-and-open') return `${date}${more} is both closed and open`;
  const clash = type === 'touching' ? 'touch (make them one range)' : 'overlap';
  return `${describeRow(first)} and ${describeRow(second)} ${clash} on ${date}${more}`;
};

// Refuses irregularHours whose time ranges overlap or touch on some date, or that make a date
// both closed and open, in the year from `today` (YYYY-MM-DD). Each occasion is its own
// schedule.
export default function assertNoScheduleConflicts(irregularHours, today) {
  const occasions = [...new Set(irregularHours.map(({ occasion }) => occasion))];
  const conflicts = occasions.flatMap(occasion => findConflicts(
    irregularHours.filter(hours => hours.occasion === occasion).map(toRow),
    today,
    CONFLICT_HORIZON_DAYS,
  ));
  if (conflicts.length) {
    throw new ValidationError(`The hours clash: ${conflicts.map(describeConflict).join('; ')}`);
  }
}
