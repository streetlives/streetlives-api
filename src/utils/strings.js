export const parseBoolean = (value, defaultValue = false) => {
  if (value == null) {
    return defaultValue;
  }

  switch (value.toLowerCase()) {
    case 'true':
      return true;
    case 'false':
      return false;
    default:
      throw new Error(`${value} is not a valid boolean`);
  }
};

export const parseNumber = (value, defaultValue) => {
  if (value == null) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${value} is not a valid number`);
  }

  return parsed;
};

export default {
  parseBoolean,
  parseNumber,
};
