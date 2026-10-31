import { getDayOfWeekIntegerFromDate, addDaysToDateOnly } from './times';

// SQL for the openAt search over HolidaySchedules rows, which work like Google Calendar (see
// the README): an open row with freq is a series; a closed row with freq is a recurring
// closure; a row without freq but with valid_from is a dated one-off. A date's hours come from
// its one-offs, else nothing if a recurring closure falls on it, else its series. Each
// occurrence belongs to the day it starts on, and runs past midnight when
// closes_at <= opens_at. schedule-rules.js applies the same rules in JavaScript, as gogetta and
// yourpeer.nyc do; test/fixtures/schedule-cases.json keeps them all in step.

const BYDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

const weekdayOf = date => getDayOfWeekIntegerFromDate(new Date(`${date}T00:00:00Z`));
// A legacy weekday 0 is Sunday too.
const sqlWeekdays = weekday => (weekday === 7 ? '7, 0' : String(weekday));

export default function scheduleSql(escape) {
  const sqlDate = date => `${escape(date)}::date`;

  // `table`'s row is a one-off covering `date` (YYYY-MM-DD). An open row with a weekday is a
  // series even without freq (rows saved before freq existed), so it isn't one.
  const getOneOffSql = (table, date) => {
    const column = name => `${table}."${name}"`;
    return `(${column('freq')} IS NULL
      AND (${column('weekday')} IS NULL OR ${column('closed')})
      AND ${column('valid_from')} <= ${sqlDate(date)}
      AND COALESCE(${column('valid_to')}, ${column('valid_from')}) >= ${sqlDate(date)}
      AND (${column('weekday')} IS NULL
        OR ${column('weekday')} IN (${sqlWeekdays(weekdayOf(date))})))`;
  };

  // `table`'s row repeats on `date`, whether it opens or closes: inside valid_from..valid_to,
  // not skipped, in its months, on a matching byday/bymonthday, and on an interval counted from
  // valid_from. A row with a weekday but no freq repeats every week on it.
  const getRecursSql = (table, date) => {
    const weekday = weekdayOf(date);
    const [year, month, day] = date.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const code = BYDAY_CODES[weekday - 1];
    const bydays = [code, `${Math.ceil(day / 7)}${code}`];
    if (day + 7 > daysInMonth) {
      bydays.push(`-1${code}`);
    }
    const monthDays = [String(day), String(day - daysInMonth - 1)];

    const column = name => `${table}."${name}"`;
    const list = values => values.map(value => escape(value)).join(', ');
    const dateLiteral = sqlDate(date);
    const years = `(EXTRACT(YEAR FROM ${dateLiteral})
      - EXTRACT(YEAR FROM ${column('valid_from')}))`;

    return `((${column('freq')} IS NOT NULL OR ${column('weekday')} IS NOT NULL)
      AND (${column('valid_from')} IS NULL OR ${column('valid_from')} <= ${dateLiteral})
      AND (${column('valid_to')} IS NULL OR ${column('valid_to')} >= ${dateLiteral})
      AND NOT (${dateLiteral} = ANY(COALESCE(${column('exdates')}, '{}')))
      AND (${column('weekday')} IN (${sqlWeekdays(weekday)}) OR (${column('weekday')} IS NULL
        AND (${column('byday')} IS NOT NULL OR ${column('bymonthday')} IS NOT NULL)))
      AND (${column('bymonth')} IS NULL
        OR string_to_array(${column('bymonth')}, ',') && ARRAY[${list([String(month)])}])
      AND (${column('byday')} IS NULL
        OR string_to_array(${column('byday')}, ',') && ARRAY[${list(bydays)}])
      AND (${column('bymonthday')} IS NULL
        OR string_to_array(${column('bymonthday')}, ',') && ARRAY[${list(monthDays)}])
      AND (COALESCE(${column('interval')}, 1) <= 1 OR (${column('valid_from')} IS NOT NULL AND (
        CASE ${column('freq')}
          WHEN 'YEARLY' THEN ${years}
          WHEN 'MONTHLY' THEN ${years} * 12
            + EXTRACT(MONTH FROM ${dateLiteral}) - EXTRACT(MONTH FROM ${column('valid_from')})
          ELSE (date_trunc('week', ${dateLiteral})::date
            - date_trunc('week', ${column('valid_from')})::date) / 7
        END
      )::integer % ${column('interval')} = 0)))`;
  };

  // Another row of `table`'s service and occasion matching `condition` (given its alias).
  const existsInScheduleSql = (table, alias, condition) => `EXISTS (
      SELECT 1 FROM holiday_schedules AS ${alias}
      WHERE ${alias}.service_id = ${table}.service_id
        AND ${alias}.occasion IS NOT DISTINCT FROM ${table}.occasion
        AND ${condition})`;

  // `table`'s row sets the service's hours on `date`: a one-off covering it; or, when no one-off
  // covers it and no recurring closure falls on it, a series occurring on it.
  const getAppliesOnSql = (table, date) => `(CASE
    WHEN ${existsInScheduleSql(table, 'one_off', getOneOffSql('one_off', date))}
      THEN ${getOneOffSql(table, date)}
    WHEN ${existsInScheduleSql(table, 'closure', `closure.closed AND closure.freq IS NOT NULL
      AND ${getRecursSql('closure', date)}`)}
      THEN FALSE
    ELSE ${getRecursSql(table, date)}
    END)`;

  // `table`'s row has the service open at `timeOfDay` on `date`: an occurrence that day that
  // has opened and not yet closed, or the overnight part of one from the day before.
  const getOpenSql = (table, date, timeOfDay) => {
    const previousDate = addDaysToDateOnly(date, -1);
    const column = name => `${table}."${name}"`;
    const time = `${escape(timeOfDay)}::time`;
    const overnight = `${column('closes_at')} <= ${column('opens_at')}`;

    return `(
      NOT COALESCE(${column('closed')}, false)
      AND ${column('opens_at')} IS NOT NULL AND ${column('closes_at')} IS NOT NULL
      AND (
        (${getAppliesOnSql(table, date)}
          AND ${column('opens_at')} <= ${time}
          AND (${column('closes_at')} > ${time} OR ${overnight}))
        OR (${getAppliesOnSql(table, previousDate)}
          AND ${overnight} AND ${column('closes_at')} > ${time})
      )
    )`;
  };

  return { getOpenSql };
}
