// Which hours a service's schedule rows give on a date. Rows work like Google Calendar
// (streetlives-api README, "Schedules are series"):
// - an open row with freq is a series: it occurs on the days its byday/bymonthday name, in the
//   months bymonth names, every `interval` weeks, months or years counted from valid_from, from
//   valid_from until valid_to, except on its exdates;
// - a closed row with freq is a recurring closure ("every December 25", "every 4th Thursday of
//   November"): on the days it recurs, the service is closed;
// - a row without freq but with valid_from is a one-off for valid_from..valid_to: on those
//   dates the one-offs replace everything else, either closed or with their own hours;
// - each occurrence belongs to the day it starts on, and runs into the next day when
//   closes_at <= opens_at.
// So a date's hours come from its one-offs, else nothing if a recurring closure falls on it,
// else its series. Rows use the API's column names. The API uses this file to refuse schedules
// that clash; the openAt search applies the same rules in SQL (schedule-sql.js). gogetta
// (openingHours/scheduleRules.js) and yourpeer.nyc (src/components/schedule-rules.js) have
// copies, and all are tested against test/fixtures/schedule-cases.json: change them together.

const BYDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const DAY_MS = 24 * 60 * 60 * 1000;
export const MINUTES_PER_DAY = 24 * 60;

const toDate = date => new Date(`${date.slice(0, 10)}T00:00:00Z`);
const dateOnly = date => (date ? date.slice(0, 10) : null);

// The YYYY-MM-DD date `days` days after `date`.
export const addDays = (date, days) =>
  new Date(toDate(date).getTime() + (days * DAY_MS)).toISOString().slice(0, 10);

// ISO weekday of a YYYY-MM-DD date: 1 is Monday, 7 is Sunday.
export const isoWeekday = date => toDate(date).getUTCDay() || 7;

const dayOfMonth = date => Number(date.slice(8, 10));
const monthOf = date => Number(date.slice(5, 7));
const daysInMonth = date =>
  new Date(Date.UTC(Number(date.slice(0, 4)), monthOf(date), 0)).getUTCDate();

// Rows store weekdays as ISO weekdays, with a legacy 0 for Sunday.
const isWeekday = (weekday, day) => weekday != null && (weekday % 7 || 7) === day;

// Open rows with a weekday from before freq existed repeat every week.
export const isSeries = row =>
  !row.closed && (!!row.freq || row.weekday != null);

export const isRecurringClosure = row => !!row.freq && !!row.closed;

export const isOneOff = row => !row.freq && !isSeries(row) && !!row.valid_from;

const getByday = row =>
  row.byday || (row.weekday != null ? BYDAY_CODES[(row.weekday + 6) % 7] : '');

// Numbered weekdays ("2FR", "-1MO") count weeks within the month, also for yearly rows,
// which always name their months.
function matchesByday(byday, date) {
  const code = BYDAY_CODES[isoWeekday(date) - 1];
  const day = dayOfMonth(date);
  return byday.split(',').some((part) => {
    const match = part.trim().match(/^(-?\d)?([A-Z]{2})$/);
    if (!match || match[2] !== code) return false;
    if (!match[1]) return true;
    const week = Number(match[1]);
    return week > 0
      ? Math.ceil(day / 7) === week
      : Math.ceil(((daysInMonth(date) - day) + 1) / 7) === -week;
  });
}

// Negative days count from the end of the month: -1 is its last day.
function matchesBymonthday(bymonthday, date) {
  const day = dayOfMonth(date);
  return bymonthday.split(',').map(Number)
    .some(n => (n > 0 ? day === n : day === daysInMonth(date) + n + 1));
}

const matchesBymonth = (bymonth, date) => bymonth.split(',').map(Number).includes(monthOf(date));

// Weeks start on Monday, as in the API's search and RFC 5545's default WKST.
function matchesInterval(row, date) {
  const interval = row.interval || 1;
  if (interval <= 1) return true;
  if (!row.valid_from) return false;
  const start = dateOnly(row.valid_from);
  const years = Number(date.slice(0, 4)) - Number(start.slice(0, 4));
  if (row.freq === 'YEARLY') return years % interval === 0;
  if (row.freq === 'MONTHLY') {
    return ((years * 12) + (monthOf(date) - monthOf(start))) % interval === 0;
  }
  const monday = day => toDate(addDays(day, 1 - isoWeekday(day))).getTime();
  const weeks = Math.round((monday(date) - monday(start)) / (7 * DAY_MS));
  return weeks % interval === 0;
}

// Whether `row`'s repeat rule falls on `date` (YYYY-MM-DD), whether it opens or closes.
export function recursOn(row, date) {
  if (!row.freq && row.weekday == null) return false;
  if (row.valid_from && date < dateOnly(row.valid_from)) return false;
  if (row.valid_to && date > dateOnly(row.valid_to)) return false;
  if ((row.exdates || []).some(exdate => dateOnly(exdate) === date)) return false;
  if (row.weekday != null && !isWeekday(row.weekday, isoWeekday(date))) return false;
  if (row.bymonth && !matchesBymonth(row.bymonth, date)) return false;
  const byday = getByday(row);
  if (!byday && !row.bymonthday) return false;
  if (byday && !matchesByday(byday, date)) return false;
  if (row.bymonthday && !matchesBymonthday(row.bymonthday, date)) return false;
  return matchesInterval(row, date);
}

// Whether series `row` has an occurrence on `date`.
export const occursOn = (row, date) => isSeries(row) && recursOn(row, date);

// Whether recurring closure `row` closes the service on `date`.
export const closesOn = (row, date) => isRecurringClosure(row) && recursOn(row, date);

// Whether one-off `row` covers `date`. Legacy closures can be limited to one weekday.
export function coversDate(row, date) {
  return isOneOff(row) &&
    dateOnly(row.valid_from) <= date &&
    date <= dateOnly(row.valid_to || row.valid_from) &&
    (row.weekday == null || isWeekday(row.weekday, isoWeekday(date)));
}

// The rows that replace a date's series: its one-offs, or else the recurring closures on it.
// A one-off is the more specific, so "open 10 AM–2 PM this Christmas" beats "closed every
// Christmas".
export function overridesOn(rows, date) {
  const oneOffs = rows.filter(row => coversDate(row, date));
  return oneOffs.length ? oneOffs : rows.filter(row => closesOn(row, date));
}

// The rows that set the hours on `date`: its overrides, or else the series that occur on it.
export function rowsOn(rows, date) {
  const overrides = overridesOn(rows, date);
  if (overrides.length) return { rows: overrides, override: true };
  return { rows: rows.filter(row => occursOn(row, date)), override: false };
}

const toMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours * 60) + (minutes || 0);
};

// The open intervals that start on `date`, as minutes after its midnight sorted by opening.
// Overnight intervals close after MINUTES_PER_DAY.
export function intervalsOn(rows, date) {
  return rowsOn(rows, date).rows
    .filter(row => !row.closed && row.opens_at && row.closes_at)
    .map((row) => {
      const open = toMinutes(row.opens_at);
      const close = toMinutes(row.closes_at);
      return { open, close: close <= open ? close + MINUTES_PER_DAY : close, row };
    })
    .sort((a, b) => a.open - b.open);
}

// Whether the service is open `minutes` after midnight on `date`, counting overnight hours
// from the day before.
export function isOpenAt(rows, date, minutes) {
  return intervalsOn(rows, date).some(({ open, close }) => open <= minutes && minutes < close) ||
    intervalsOn(rows, addDays(date, -1))
      .some(({ close }) => minutes + MINUTES_PER_DAY < close);
}

// What clashes in the `days` days from `from`: time ranges on the same day that overlap or
// touch (9 AM–1 PM with 12–5 PM, or with 1–5 PM, which should be one range), counting
// overnight hours from the day before, and dates that one-offs make both closed and open.
// Each clash is reported once, with the first date it happens on and how many dates it does.
export function findConflicts(rows, from, days = 366) {
  const found = new Map();
  const report = (key, conflict, date) => {
    const existing = found.get(key);
    if (existing) existing.count += 1;
    else found.set(key, { ...conflict, first: date, count: 1 });
  };
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(from, offset);
    const overrides = overridesOn(rows, date);
    const closed = overrides.find(row => row.closed);
    const open = overrides.find(row => !row.closed);
    if (closed && open && coversDate(closed, date)) {
      report(`closed-open:${rows.indexOf(closed)}:${rows.indexOf(open)}`, {
        type: 'closed-and-open', rows: [closed, open],
      }, date);
    }
    const intervals = [
      ...intervalsOn(rows, addDays(date, -1))
        .filter(({ close }) => close > MINUTES_PER_DAY)
        .map(interval => ({
          ...interval,
          open: interval.open - MINUTES_PER_DAY,
          close: interval.close - MINUTES_PER_DAY,
        })),
      ...intervalsOn(rows, date),
    ].sort((a, b) => a.open - b.open);
    intervals.forEach((later, i) => {
      intervals.slice(0, i)
        .filter(earlier => later.open <= earlier.close)
        .forEach((earlier) => {
          const pair = [rows.indexOf(earlier.row), rows.indexOf(later.row)].sort();
          report(`overlap:${pair.join(':')}`, {
            type: later.open === earlier.close ? 'touching' : 'overlapping',
            rows: [earlier.row, later.row],
          }, date);
        });
    });
  }
  return [...found.values()];
}
