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

export default {
  getDayOfWeekInteger,
};
