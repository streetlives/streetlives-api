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

export const formatTime = date => `${date.getUTCHours()}:${date.getUTCMinutes()}`;

export default {
  getDayOfWeekInteger,
  getDayOfWeekIntegerFromDate,
  formatTime,
};
