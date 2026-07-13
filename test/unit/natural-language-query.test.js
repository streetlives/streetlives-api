/**
 * @jest-environment node
 */

// Tests for parseNaturalLanguageQuery in src/controllers/openai.js: parsing of
// model output, sanitization of the structured params, and the guards around
// the paid OpenAI call (cache, rate limit, concurrency cap, circuit breaker).

const mockCreate = jest.fn();

jest.mock('openai', () => function OpenAI() {
  this.chat = {
    completions: {
      create: mockCreate,
    },
  };
});

// The cross-instance (Postgres-backed) guards live in ./nl-limiter. Mock them so
// these unit tests stay hermetic (no DB) and cover the per-instance guards in
// openai.js; the shared limiter itself is covered by an integration test. The
// defaults (set in beforeEach) let calls through so existing tests are unaffected.
const mockLimiter = {
  isCircuitOpen: jest.fn(),
  allowInWindow: jest.fn(),
  allowClientInWindow: jest.fn(),
  recordSuccess: jest.fn(),
  recordFailure: jest.fn(),
};
jest.mock('../../src/controllers/nl-limiter', () => mockLimiter);

// A full raw model response (every field the JSON schema requires), all nulls.
const rawNlResponse = overrides => ({
  searchString: null,
  streetAddress: null,
  neighborhood: null,
  openAt: null,
  gender: null,
  membership: null,
  ageMin: null,
  ageMax: null,
  referralRequired: null,
  photoIdRequired: null,
  zipcodes: null,
  taxonomyNames: null,
  ...overrides,
});

// The "current datetime" passed alongside every query.
const NOW = '2026-07-13T12:00:00-04:00';

const completionWith = content => ({
  choices: [{ message: { content } }],
});

const mockModelOutput = raw =>
  mockCreate.mockResolvedValue(completionWith(JSON.stringify(raw)));

describe('parseNaturalLanguageQuery', () => {
  let parseNaturalLanguageQuery;

  beforeEach(() => {
    // The module keeps cache/rate-limit/circuit-breaker state at module level,
    // so load a fresh copy for every test.
    jest.resetModules();
    mockCreate.mockReset();
    mockLimiter.isCircuitOpen.mockReset().mockResolvedValue(false);
    mockLimiter.allowInWindow.mockReset().mockResolvedValue(true);
    mockLimiter.allowClientInWindow.mockReset().mockResolvedValue(true);
    mockLimiter.recordSuccess.mockReset().mockResolvedValue();
    mockLimiter.recordFailure.mockReset().mockResolvedValue();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // eslint-disable-next-line global-require
    ({ parseNaturalLanguageQuery } = require('../../src/controllers/openai'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('successful parsing', () => {
    it('returns the structured params extracted by the model', async () => {
      mockModelOutput(rawNlResponse({
        searchString: 'halal',
        neighborhood: 'Harlem',
        openAt: '2026-07-13T20:00:00-04:00',
        gender: 'female',
        ageMin: 18,
        ageMax: 24,
        zipcodes: ['10001'],
        taxonomyNames: ['Food'],
      }));

      const result = await parseNaturalLanguageQuery('halal food for women in harlem', NOW);

      expect(result).toEqual(rawNlResponse({
        searchString: 'halal',
        neighborhood: 'Harlem',
        openAt: '2026-07-13T20:00:00-04:00',
        gender: 'female',
        ageMin: 18,
        ageMax: 24,
        zipcodes: ['10001'],
        taxonomyNames: ['Food'],
      }));
    });

    it('sends the user query and the current datetime to the model', async () => {
      mockModelOutput(rawNlResponse());

      await parseNaturalLanguageQuery('food pantry', NOW);

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const [request, options] = mockCreate.mock.calls[0];
      expect(request.messages).toEqual([
        expect.objectContaining({ role: 'system', content: expect.stringContaining(NOW) }),
        expect.objectContaining({ role: 'user', content: 'food pantry' }),
      ]);
      expect(options).toEqual(expect.objectContaining({
        timeout: expect.any(Number),
        maxRetries: expect.any(Number),
      }));
    });
  });

  describe('malformed model output', () => {
    it('throws when the model returns something that is not JSON', async () => {
      mockCreate.mockResolvedValue(completionWith('I cannot help with that'));

      await expect(parseNaturalLanguageQuery('food', NOW))
        .rejects.toThrow();
    });

    it('throws when the completion has no choices', async () => {
      mockCreate.mockResolvedValue({ choices: [] });

      await expect(parseNaturalLanguageQuery('food', NOW))
        .rejects.toThrow();
    });

    it('returns null when the model returns JSON that is not an object', async () => {
      mockCreate.mockResolvedValue(completionWith('null'));

      await expect(parseNaturalLanguageQuery('food', NOW))
        .resolves.toBeNull();
    });

    it('propagates upstream API errors to the caller', async () => {
      mockCreate.mockRejectedValue(new Error('rate limited upstream'));

      await expect(parseNaturalLanguageQuery('food', NOW))
        .rejects.toThrow('rate limited upstream');
    });
  });

  describe('sanitization of model output', () => {
    let queryCounter = 0;
    // Anchor every response with a benign extra field: an all-null result
    // collapses to null, and these tests assert on individual fields of a
    // result whose field under test may have been rejected.
    const parseWith = async (rawOverrides) => {
      mockModelOutput(rawNlResponse({ searchString: 'anchor', ...rawOverrides }));
      queryCounter += 1;
      return parseNaturalLanguageQuery(`some query ${queryCounter}`, NOW);
    };

    it('rejects genders other than male/female and lowercases valid ones', async () => {
      expect((await parseWith({ gender: 'FEMALE' })).gender).toBe('female');
      expect((await parseWith({ gender: 'everyone' })).gender).toBeNull();
    });

    it('drops invalid zipcodes and caps the list length', async () => {
      const result = await parseWith({
        zipcodes: ['10001', 'abcde', '123456', '1234', ...Array(30).fill('11201')],
      });
      expect(result.zipcodes).toHaveLength(20);
      expect(result.zipcodes[0]).toBe('10001');
      expect(result.zipcodes).not.toContain('abcde');
      expect(result.zipcodes).not.toContain('123456');
    });

    it('returns null zipcodes when none are valid', async () => {
      expect((await parseWith({ zipcodes: ['nozip'] })).zipcodes).toBeNull();
    });

    it('nulls out the age range when ageMin is greater than ageMax', async () => {
      const result = await parseWith({ ageMin: 30, ageMax: 20 });
      expect(result.ageMin).toBeNull();
      expect(result.ageMax).toBeNull();
    });

    it('rejects out-of-range and non-integer ages', async () => {
      const result = await parseWith({ ageMin: -1, ageMax: 500 });
      expect(result.ageMin).toBeNull();
      expect(result.ageMax).toBeNull();
    });

    it('rejects openAt values that are not parseable datetimes', async () => {
      expect((await parseWith({ openAt: 'tonight' })).openAt).toBeNull();
    });

    it('rejects openAt values without an explicit UTC offset', async () => {
      // A naive datetime would be interpreted in the server's timezone,
      // silently shifting the intended New York time.
      expect((await parseWith({ openAt: '2026-07-13T20:00:00' })).openAt).toBeNull();
      expect((await parseWith({ openAt: '2026-07-13T20:00:00-04:00' })).openAt)
        .toBe('2026-07-13T20:00:00-04:00');
      expect((await parseWith({ openAt: '2026-07-14T00:00:00Z' })).openAt)
        .toBe('2026-07-14T00:00:00Z');
    });

    it('truncates overlong strings', async () => {
      const result = await parseWith({ searchString: 'a'.repeat(500) });
      expect(result.searchString).toHaveLength(200);
    });

    it('rejects non-boolean values for boolean filters', async () => {
      const result = await parseWith({
        membership: 'yes',
        referralRequired: 1,
        photoIdRequired: false,
      });
      expect(result.membership).toBeNull();
      expect(result.referralRequired).toBeNull();
      expect(result.photoIdRequired).toBe(false);
    });

    it('trims taxonomy names, drops blank ones and caps the list length', async () => {
      const result = await parseWith({
        taxonomyNames: ['  Food  ', '', '   ', ...Array(15).fill('Shelter')],
      });
      expect(result.taxonomyNames).toHaveLength(10);
      expect(result.taxonomyNames[0]).toBe('Food');
      expect(result.taxonomyNames).not.toContain('');
    });
  });

  describe('effectively empty model output', () => {
    // An all-null result carries no filters: if it were returned as an object,
    // the caller would treat the parse as successful, skip its raw-query
    // fallback and run an unfiltered search returning every location.
    it('returns null when the model extracts no parameters at all', async () => {
      mockModelOutput(rawNlResponse());

      await expect(parseNaturalLanguageQuery('gibberish the model cannot parse', NOW))
        .resolves.toBeNull();
    });

    it('returns null when every extracted field is rejected by sanitization', async () => {
      mockModelOutput(rawNlResponse({
        gender: 'everyone',
        zipcodes: ['nozip'],
        openAt: 'tonight',
        taxonomyNames: ['', '   '],
      }));

      await expect(parseNaturalLanguageQuery('query with only invalid fields', NOW))
        .resolves.toBeNull();
    });

    it('does not collapse a result whose only value is an explicit false', async () => {
      mockModelOutput(rawNlResponse({ membership: false }));

      const result = await parseNaturalLanguageQuery('no membership needed', NOW);

      expect(result).not.toBeNull();
      expect(result.membership).toBe(false);
    });
  });

  describe('caching', () => {
    it('only calls OpenAI once for repeated queries (case/whitespace-insensitive)', async () => {
      mockModelOutput(rawNlResponse({ searchString: 'food' }));

      const first = await parseNaturalLanguageQuery('Food Pantry', NOW);
      const second = await parseNaturalLanguageQuery('  food pantry ', NOW);

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it('does not reuse a cached result resolved against a different datetime', async () => {
      mockModelOutput(rawNlResponse());

      // Relative queries like "open now" resolve against the current
      // datetime, so a result from one time bucket must not serve another.
      await parseNaturalLanguageQuery('shelter open now', NOW);
      await parseNaturalLanguageQuery('shelter open now', '2026-07-13T12:06:00-04:00');

      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('calls OpenAI again for a different query', async () => {
      mockModelOutput(rawNlResponse());

      await parseNaturalLanguageQuery('food', NOW);
      await parseNaturalLanguageQuery('shelter', NOW);

      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('calls OpenAI again once the cache entry has expired', async () => {
      mockModelOutput(rawNlResponse());

      await parseNaturalLanguageQuery('food', NOW);

      const later = Date.now() + (6 * 60 * 1000); // past the 5-minute TTL
      jest.spyOn(Date, 'now').mockReturnValue(later);

      await parseNaturalLanguageQuery('food', NOW);

      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('does not cache failures', async () => {
      mockCreate.mockRejectedValueOnce(new Error('boom'));
      await expect(parseNaturalLanguageQuery('food', NOW))
        .rejects.toThrow();

      mockModelOutput(rawNlResponse({ searchString: 'food' }));
      const result = await parseNaturalLanguageQuery('food', NOW);

      expect(result.searchString).toBe('food');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe('rate limiting', () => {
    it('returns null (without calling OpenAI) once the per-window limit is hit', async () => {
      mockModelOutput(rawNlResponse());

      // 60 uncached calls are allowed per window.
      for (let i = 0; i < 60; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await parseNaturalLanguageQuery(`query ${i}`, NOW);
      }
      expect(mockCreate).toHaveBeenCalledTimes(60);

      await expect(parseNaturalLanguageQuery('one too many', NOW))
        .resolves.toBeNull();
      expect(mockCreate).toHaveBeenCalledTimes(60);
    });

    it('still serves cached results when the rate limit is hit', async () => {
      mockModelOutput(rawNlResponse({ searchString: 'food' }));

      await parseNaturalLanguageQuery('food', NOW);
      for (let i = 0; i < 59; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await parseNaturalLanguageQuery(`query ${i}`, NOW);
      }

      const result = await parseNaturalLanguageQuery('food', NOW);
      expect(result.searchString).toBe('food');
      expect(mockCreate).toHaveBeenCalledTimes(60);
    });

    it('allows calls again in the next window', async () => {
      mockModelOutput(rawNlResponse());

      for (let i = 0; i < 61; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await parseNaturalLanguageQuery(`query ${i}`, NOW);
      }
      expect(mockCreate).toHaveBeenCalledTimes(60);

      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + (61 * 1000));

      await parseNaturalLanguageQuery('next window', NOW);
      expect(mockCreate).toHaveBeenCalledTimes(61);
    });
  });

  describe('concurrency cap', () => {
    it('returns null when too many requests are already in flight', async () => {
      const resolvers = [];
      mockCreate.mockImplementation(() => new Promise((resolve) => {
        resolvers.push(resolve);
      }));

      const inFlight = [];
      for (let i = 0; i < 10; i += 1) {
        inFlight.push(parseNaturalLanguageQuery(`query ${i}`, NOW));
      }

      // The 10 calls reserve their in-flight slots synchronously, but now clear
      // the (async) shared-store guards before reaching OpenAI, so let those
      // microtasks settle before asserting they all hit the upstream mock.
      await new Promise(resolve => setImmediate(resolve));

      await expect(parseNaturalLanguageQuery('over the cap', NOW))
        .resolves.toBeNull();
      expect(mockCreate).toHaveBeenCalledTimes(10);

      resolvers.forEach(resolve =>
        resolve(completionWith(JSON.stringify(rawNlResponse()))));
      await Promise.all(inFlight);

      // Once the in-flight requests drain, new calls go through again.
      mockModelOutput(rawNlResponse());
      await parseNaturalLanguageQuery('after the burst', NOW);
      expect(mockCreate).toHaveBeenCalledTimes(11);
    });
  });

  describe('circuit breaker', () => {
    const failNTimes = async (n) => {
      mockCreate.mockRejectedValue(new Error('upstream down'));
      for (let i = 0; i < n; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await expect(parseNaturalLanguageQuery(`failing ${Math.random()}`, NOW))
          .rejects.toThrow();
      }
    };

    it('opens after consecutive failures and skips OpenAI while open', async () => {
      await failNTimes(5);
      expect(mockCreate).toHaveBeenCalledTimes(5);

      await expect(parseNaturalLanguageQuery('while open', NOW))
        .resolves.toBeNull();
      expect(mockCreate).toHaveBeenCalledTimes(5);
    });

    it('closes again after the cooldown period', async () => {
      await failNTimes(5);

      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + (61 * 1000));
      mockModelOutput(rawNlResponse({ searchString: 'food' }));

      const result = await parseNaturalLanguageQuery('after cooldown', NOW);
      expect(result.searchString).toBe('food');
      expect(mockCreate).toHaveBeenCalledTimes(6);
    });

    it('resets the failure count on success', async () => {
      await failNTimes(4);

      mockModelOutput(rawNlResponse());
      await parseNaturalLanguageQuery('success resets', NOW);

      // One more failure would have tripped the breaker without the reset.
      await failNTimes(1);

      mockModelOutput(rawNlResponse());
      await parseNaturalLanguageQuery('still closed', NOW);
      expect(mockCreate).toHaveBeenCalledTimes(7);
    });
  });

  describe('shared (cross-instance) limiter', () => {
    it('skips OpenAI when the global circuit breaker is open', async () => {
      mockLimiter.isCircuitOpen.mockResolvedValue(true);
      mockModelOutput(rawNlResponse());

      await expect(parseNaturalLanguageQuery('while global open', NOW))
        .resolves.toBeNull();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('skips OpenAI when the global rate limit is hit', async () => {
      mockLimiter.allowInWindow.mockResolvedValue(false);
      mockModelOutput(rawNlResponse());

      await expect(parseNaturalLanguageQuery('global rate hit', NOW))
        .resolves.toBeNull();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('skips OpenAI when the per-client rate limit is hit', async () => {
      mockLimiter.allowClientInWindow.mockResolvedValue(false);
      mockModelOutput(rawNlResponse());

      await expect(parseNaturalLanguageQuery('client rate hit', NOW, '1.2.3.4'))
        .resolves.toBeNull();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('passes the given clientId through to the per-client check', async () => {
      mockModelOutput(rawNlResponse());

      await parseNaturalLanguageQuery('food', NOW, '1.2.3.4');

      expect(mockLimiter.allowClientInWindow).toHaveBeenCalledWith('1.2.3.4');
    });

    it('falls back to an "unknown" client bucket when no clientId is given', async () => {
      mockModelOutput(rawNlResponse());

      await parseNaturalLanguageQuery('food', NOW);

      expect(mockLimiter.allowClientInWindow).toHaveBeenCalledWith('unknown');
    });

    it('records success against the shared limiter on a successful call', async () => {
      mockModelOutput(rawNlResponse({ searchString: 'food' }));

      await parseNaturalLanguageQuery('food', NOW);

      expect(mockLimiter.recordSuccess).toHaveBeenCalledTimes(1);
      expect(mockLimiter.recordFailure).not.toHaveBeenCalled();
    });

    it('records failure against the shared limiter when the call throws', async () => {
      mockCreate.mockRejectedValue(new Error('upstream down'));

      await expect(parseNaturalLanguageQuery('boom', NOW)).rejects.toThrow();

      expect(mockLimiter.recordFailure).toHaveBeenCalledTimes(1);
      expect(mockLimiter.recordSuccess).not.toHaveBeenCalled();
    });
  });
});
