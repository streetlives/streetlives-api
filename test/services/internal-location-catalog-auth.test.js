const encodeBase64Url = value =>
  Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const buildJwt = (payload, header = { alg: 'RS256', kid: 'kid-1' }) => [
  encodeBase64Url(header),
  encodeBase64Url(payload),
  'signature',
].join('.');

const ORIGINAL_ENV = process.env;

const loadAuthorizeWithMocks = ({
  allowedClientIds = 'allowed-client-id',
  allowedHosts = 'sheets.doobneek.org',
  allowedGroups,
  verifyResult = true,
} = {}) => {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: 'test',
    INTERNAL_LOCATION_CATALOG_ALLOWED_CLIENT_IDS: allowedClientIds,
    INTERNAL_LOCATION_CATALOG_ALLOWED_HOSTS: allowedHosts,
  };

  if (allowedGroups === undefined) {
    delete process.env.INTERNAL_LOCATION_CATALOG_ALLOWED_GROUP_NAMES;
  } else {
    process.env.INTERNAL_LOCATION_CATALOG_ALLOWED_GROUP_NAMES = allowedGroups;
  }

  const axios = require('axios');
  const crypto = require('crypto');
  const verify = {
    update: jest.fn(),
    end: jest.fn(),
    verify: jest.fn(() => verifyResult),
  };

  jest.spyOn(axios, 'get').mockResolvedValue({
    data: {
      keys: [{ kid: 'kid-1', kty: 'RSA' }],
    },
  });
  jest.spyOn(crypto, 'createPublicKey').mockReturnValue('mock-public-key');
  jest.spyOn(crypto, 'createVerify').mockReturnValue(verify);

  const authorizeInternalLocationCatalogRequest =
    require('../../src/services/internal-location-catalog-auth').default;
  const config = require('../../src/config').default;

  return {
    authorizeInternalLocationCatalogRequest,
    config,
    verify,
    axios,
  };
};

describe('internal location catalog auth', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = ORIGINAL_ENV;
  });

  it('accepts a signed token from an allowed client without a browser origin', async () => {
    const {
      authorizeInternalLocationCatalogRequest,
      config,
      verify,
      axios,
    } = loadAuthorizeWithMocks();

    const token = buildJwt({
      iss: config.cognito.userPoolIssuer,
      exp: Math.floor(Date.now() / 1000) + 3600,
      token_use: 'id',
      aud: 'allowed-client-id',
      sub: 'user-123',
    });

    await expect(authorizeInternalLocationCatalogRequest({
      headers: {
        authorization: `Bearer ${token}`,
      },
    })).resolves.toEqual(expect.objectContaining({
      aud: 'allowed-client-id',
      sub: 'user-123',
    }));

    expect(axios.get).toHaveBeenCalled();
    expect(verify.verify).toHaveBeenCalled();
  });

  it('rejects a token from a disallowed client', async () => {
    const {
      authorizeInternalLocationCatalogRequest,
      config,
    } = loadAuthorizeWithMocks();

    const token = buildJwt({
      iss: config.cognito.userPoolIssuer,
      exp: Math.floor(Date.now() / 1000) + 3600,
      token_use: 'id',
      aud: 'some-other-client',
      sub: 'user-123',
    });

    await expect(authorizeInternalLocationCatalogRequest({
      headers: {
        authorization: `Bearer ${token}`,
      },
    })).rejects.toThrow('Bearer token client is not allowed for internal location catalog');
  });

  it('rejects a browser origin that is not on the allowlist', async () => {
    const {
      authorizeInternalLocationCatalogRequest,
      config,
    } = loadAuthorizeWithMocks();

    const token = buildJwt({
      iss: config.cognito.userPoolIssuer,
      exp: Math.floor(Date.now() / 1000) + 3600,
      token_use: 'id',
      aud: 'allowed-client-id',
      sub: 'user-123',
    });

    await expect(authorizeInternalLocationCatalogRequest({
      headers: {
        authorization: `Bearer ${token}`,
        origin: 'https://example.com',
      },
    })).rejects.toThrow('Origin not allowed for internal location catalog');
  });

  it('rejects a token with an invalid signature', async () => {
    const {
      authorizeInternalLocationCatalogRequest,
      config,
    } = loadAuthorizeWithMocks({ verifyResult: false });

    const token = buildJwt({
      iss: config.cognito.userPoolIssuer,
      exp: Math.floor(Date.now() / 1000) + 3600,
      token_use: 'access',
      client_id: 'allowed-client-id',
      sub: 'user-123',
    });

    await expect(authorizeInternalLocationCatalogRequest({
      headers: {
        authorization: `Bearer ${token}`,
      },
    })).rejects.toThrow('Unable to verify bearer token');
  });

  it('rejects a token with an unsupported Cognito token type', async () => {
    const {
      authorizeInternalLocationCatalogRequest,
      config,
    } = loadAuthorizeWithMocks();

    const token = buildJwt({
      iss: config.cognito.userPoolIssuer,
      exp: Math.floor(Date.now() / 1000) + 3600,
      token_use: 'refresh',
      aud: 'allowed-client-id',
      sub: 'user-123',
    });

    await expect(authorizeInternalLocationCatalogRequest({
      headers: {
        authorization: `Bearer ${token}`,
      },
    })).rejects.toThrow('Unsupported Cognito token type');
  });

  it('can require an allowed Cognito group in addition to the client id', async () => {
    const {
      authorizeInternalLocationCatalogRequest,
      config,
    } = loadAuthorizeWithMocks({ allowedGroups: 'InternalCatalogUsers' });

    const token = buildJwt({
      iss: config.cognito.userPoolIssuer,
      exp: Math.floor(Date.now() / 1000) + 3600,
      token_use: 'id',
      aud: 'allowed-client-id',
      'cognito:groups': ['AnotherGroup'],
      sub: 'user-123',
    });

    await expect(authorizeInternalLocationCatalogRequest({
      headers: {
        authorization: `Bearer ${token}`,
      },
    })).rejects.toThrow('Bearer token group is not allowed for internal location catalog');
  });
});
