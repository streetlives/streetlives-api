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
  allowedGroups = 'InternalCatalogUsers',
  verifyResult = true,
} = {}) => {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: 'test',
    COGNITO_USER_POOL_ID: 'us-east-1_testPool',
  };

  if (allowedClientIds == null) {
    delete process.env.INTERNAL_LOCATION_CATALOG_ALLOWED_CLIENT_IDS;
  } else {
    process.env.INTERNAL_LOCATION_CATALOG_ALLOWED_CLIENT_IDS = allowedClientIds;
  }

  if (allowedGroups == null) {
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

  it('accepts a signed token from an allowed client and group', async () => {
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
      'cognito:groups': ['InternalCatalogUsers'],
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
      'cognito:groups': ['InternalCatalogUsers'],
      sub: 'user-123',
    });

    await expect(authorizeInternalLocationCatalogRequest({
      headers: {
        authorization: `Bearer ${token}`,
      },
    })).rejects.toThrow('Bearer token client is not allowed for internal location catalog');
  });

  it('rejects a token from a disallowed group', async () => {
    const {
      authorizeInternalLocationCatalogRequest,
      config,
    } = loadAuthorizeWithMocks();

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

  it('fails closed when the allowed group configuration is missing', async () => {
    const {
      authorizeInternalLocationCatalogRequest,
      config,
    } = loadAuthorizeWithMocks({ allowedGroups: null });

    const token = buildJwt({
      iss: config.cognito.userPoolIssuer,
      exp: Math.floor(Date.now() / 1000) + 3600,
      token_use: 'id',
      aud: 'allowed-client-id',
      'cognito:groups': ['InternalCatalogUsers'],
      sub: 'user-123',
    });

    await expect(authorizeInternalLocationCatalogRequest({
      headers: {
        authorization: `Bearer ${token}`,
      },
    })).rejects.toThrow('Internal location catalog authorization is not configured');
  });

  it('fails closed when the allowed client configuration is missing', async () => {
    const {
      authorizeInternalLocationCatalogRequest,
      config,
    } = loadAuthorizeWithMocks({ allowedClientIds: null });

    const token = buildJwt({
      iss: config.cognito.userPoolIssuer,
      exp: Math.floor(Date.now() / 1000) + 3600,
      token_use: 'id',
      aud: 'allowed-client-id',
      'cognito:groups': ['InternalCatalogUsers'],
      sub: 'user-123',
    });

    await expect(authorizeInternalLocationCatalogRequest({
      headers: {
        authorization: `Bearer ${token}`,
      },
    })).rejects.toThrow('Internal location catalog authorization is not configured');
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
      'cognito:groups': ['InternalCatalogUsers'],
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
      'cognito:groups': ['InternalCatalogUsers'],
      sub: 'user-123',
    });

    await expect(authorizeInternalLocationCatalogRequest({
      headers: {
        authorization: `Bearer ${token}`,
      },
    })).rejects.toThrow('Unsupported Cognito token type');
  });

  it('accepts an access token when both the client id and group are allowed', async () => {
    const {
      authorizeInternalLocationCatalogRequest,
      config,
    } = loadAuthorizeWithMocks();

    const token = buildJwt({
      iss: config.cognito.userPoolIssuer,
      exp: Math.floor(Date.now() / 1000) + 3600,
      token_use: 'access',
      client_id: 'allowed-client-id',
      'cognito:groups': ['InternalCatalogUsers'],
      sub: 'user-123',
    });

    await expect(authorizeInternalLocationCatalogRequest({
      headers: {
        authorization: `Bearer ${token}`,
      },
    })).resolves.toEqual(expect.objectContaining({
      client_id: 'allowed-client-id',
    }));
  });

  it('fails closed when the Cognito issuer is not configured', async () => {
    const {
      authorizeInternalLocationCatalogRequest,
    } = loadAuthorizeWithMocks();
    process.env = {
      ...process.env,
    };
    delete process.env.COGNITO_USER_POOL_ID;
    delete process.env.COGNITO_USER_POOL_ISSUER;
    jest.resetModules();

    const axios = require('axios');
    const crypto = require('crypto');
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: { keys: [{ kid: 'kid-1', kty: 'RSA' }] },
    });
    jest.spyOn(crypto, 'createPublicKey').mockReturnValue('mock-public-key');
    jest.spyOn(crypto, 'createVerify').mockReturnValue({
      update: jest.fn(),
      end: jest.fn(),
      verify: jest.fn(() => true),
    });

    const reloadedAuthorize =
      require('../../src/services/internal-location-catalog-auth').default;

    const token = buildJwt({
      iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_testPool',
      exp: Math.floor(Date.now() / 1000) + 3600,
      token_use: 'id',
      aud: 'allowed-client-id',
      'cognito:groups': ['InternalCatalogUsers'],
      sub: 'user-123',
    });

    await expect(reloadedAuthorize({
      headers: {
        authorization: `Bearer ${token}`,
      },
    })).rejects.toThrow('Internal location catalog authorization is not configured');

    expect(authorizeInternalLocationCatalogRequest).toBeDefined();
  });
});
