export const convertKeyValueArrayToObject = (arr) => {
  if (arr.length % 2 !== 0) {
    throw new Error('Key-value array must have even length, with each key followed by its value');
  }

  const obj = {};

  for (let i = 0; i < arr.length / 2; i += 1) {
    const key = arr[i * 2];
    const value = arr[(i * 2) + 1];
    obj[key] = value;
  }

  return obj;
};

export default {
  convertKeyValueArrayToObject,
};
