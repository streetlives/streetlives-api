/**
 * A small evaluator for the subset of the GitHub Actions expression language
 * that this repo's workflow `if:` conditions use.
 *
 * The point is to test the *gates* rather than the YAML text: given a set of
 * job/step results, does the deploy job actually run? Those conditions have
 * already been wrong twice on this pipeline in ways that read fine (see the
 * comments in deploy-prod.yml), so they are worth pinning down by behaviour.
 *
 * Supported: && || ! ( ) == != , string literals, true/false, and the
 * contexts referenced by these workflows. Anything else throws, so an
 * unsupported construct fails loudly instead of silently evaluating to false.
 */

const TOKEN_PATTERN = new RegExp(
  "\\s*(\\|\\||&&|==|!=|!|\\(|\\)|'(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_.-]*(?:\\(\\))?)",
  'y',
);

const tokenize = (expression) => {
  const tokens = [];
  TOKEN_PATTERN.lastIndex = 0;
  while (TOKEN_PATTERN.lastIndex < expression.length) {
    const start = TOKEN_PATTERN.lastIndex;
    const match = TOKEN_PATTERN.exec(expression);
    if (!match) {
      if (expression.slice(start).trim() === '') break;
      throw new Error(`Unparsable GitHub expression at: ${expression.slice(start)}`);
    }
    tokens.push(match[1]);
  }
  return tokens;
};

// GitHub's truthiness: an empty string is false, any other non-empty string true.
const truthy = (value) => {
  if (typeof value === 'string') return value !== '';
  return Boolean(value);
};

// GitHub casts across types before comparing: null and false and '' all become
// 0, true becomes 1, a non-numeric string becomes NaN and never matches. This
// is exactly how `inputs.run_migrations != false` came to mean "false" on a
// push trigger, so the evaluator has to reproduce it rather than use ===.
const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value.trim() === '' ? 0 : Number(value);
  return NaN;
};

const looseEquals = (left, right) => {
  if (typeof left === 'string' && typeof right === 'string') {
    return left.toLowerCase() === right.toLowerCase();
  }
  if (typeof left === typeof right) return left === right;

  const [a, b] = [toNumber(left), toNumber(right)];
  return !Number.isNaN(a) && !Number.isNaN(b) && a === b;
};

const lookUp = (context, reference) => reference
  .split('.')
  .reduce((value, key) => (value == null ? undefined : value[key]), context);

const resultsOfNeeds = context => Object.keys(context.needs || {})
  .map(job => context.needs[job].result);

const callFunction = (name, context) => {
  const results = resultsOfNeeds(context);
  switch (name) {
    // always() is true even when the run is cancelled - that is its whole job.
    case 'always()': return true;
    case 'cancelled()': return Boolean(context.cancelled);
    case 'failure()': return results.some(result => result === 'failure');
    case 'success()': return results.every(result => result === 'success');
    default: throw new Error(`Unsupported function in GitHub expression: ${name}`);
  }
};

const parse = (tokens, context) => {
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++]; // eslint-disable-line no-plusplus

  const parseOr = () => {
    let value = parseAnd(); // eslint-disable-line no-use-before-define
    while (peek() === '||') {
      take();
      const right = parseAnd(); // eslint-disable-line no-use-before-define
      value = truthy(value) ? value : right;
    }
    return value;
  };

  const parsePrimary = () => {
    const token = take();
    if (token === undefined) throw new Error('Unexpected end of GitHub expression');
    if (token === '(') {
      const value = parseOr();
      if (take() !== ')') throw new Error('Unbalanced parentheses in GitHub expression');
      return value;
    }
    if (token === '!') return !truthy(parsePrimary());
    if (token.startsWith("'")) return token.slice(1, -1).replace(/''/g, "'");
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (token.endsWith('()')) return callFunction(token, context);
    return lookUp(context, token);
  };

  const parseComparison = () => {
    const left = parsePrimary();
    const operator = peek();
    if (operator !== '==' && operator !== '!=') return left;
    take();
    const right = parsePrimary();
    return operator === '==' ? looseEquals(left, right) : !looseEquals(left, right);
  };

  const parseAnd = () => {
    let value = parseComparison();
    while (peek() === '&&') {
      take();
      const right = parseComparison();
      value = truthy(value) ? right : value;
    }
    return value;
  };

  const value = parseOr();
  if (position !== tokens.length) {
    throw new Error(`Trailing tokens in GitHub expression: ${tokens.slice(position).join(' ')}`);
  }
  return value;
};

/**
 * @param {string} expression an `if:` value, with or without the ${{ }} wrapper
 * @param {object} context { needs, steps, github, inputs, cancelled }
 * @returns {boolean} whether the job or step runs
 */
const evaluate = (expression, context = {}) => {
  const unwrapped = String(expression).trim().replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, '');
  return truthy(parse(tokenize(unwrapped), context));
};

module.exports = { evaluate };
