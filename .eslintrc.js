module.exports = {
  extends: 'airbnb-base',

  env: {
    node: true,
  },

  rules: {
    'no-console': 2,
    'no-multiple-empty-lines': [2, { max: 1, maxBOF: 1, maxEOF: 1 }],
  },
};
