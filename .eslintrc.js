module.exports = {
  extends: 'airbnb-base',

  env: {
    node: true,
  },

  rules: {
    'max-len': [2, 100],
    'no-console': 2,
    'no-multiple-empty-lines': [2, { max: 1, maxBOF: 1, maxEOF: 1 }],
    'no-unused-vars': [2, { args: 'none' }],
  },
};
