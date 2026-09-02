const dayOfWeekStringsToInts = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

export const getDayOfWeekInteger = dayString => dayOfWeekStringsToInts[dayString.toLowerCase()];

export const getDayOfWeekIntegerFromDate = (date) => {
  const jsDayOfWeek = date.getUTCDay();
  return (jsDayOfWeek === 0) ? 7 : jsDayOfWeek;
};

export const formatTime = (date, timeZone) => new Intl.DateTimeFormat([], {
  timeZone,
  hour: 'numeric',
  minute: 'numeric',
}).format(date);

// ISO 8601 local datetime with UTC offset in the given IANA timezone,
// e.g. 2026-07-13T12:00:00-04:00 for America/New_York.
export const formatIsoWithTimezone = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce((acc, { type, value }) => ({ ...acc, [type]: value }), {});

  const wallClockAsUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMinutes = Math.round((wallClockAsUtcMs - date.getTime()) / 60000);
  const pad = n => String(n).padStart(2, '0');
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absOffset = Math.abs(offsetMinutes);
  const offset = `${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`;

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
};

export default {
  getDayOfWeekInteger,
  getDayOfWeekIntegerFromDate,
  formatTime,
  formatIsoWithTimezone,
};
