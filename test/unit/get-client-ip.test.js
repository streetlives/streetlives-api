/**
 * @jest-environment node
 */

// Tests for getClientIp in src/utils/request.js. This value keys the
// per-client NL rate limit, so it must come from a connection-derived source
// (API Gateway's requestContext.identity.sourceIp) and never from the
// client-supplied x-forwarded-for header, which a caller can rotate to mint
// fresh rate-limit buckets on every request.

import { getClientIp } from '../../src/utils/request';

// A request as aws-serverless-express's eventContext middleware presents it
// in production: API Gateway's event (including the connection-derived
// sourceIp) on req.apiGateway, headers passed through from the client.
const apiGatewayReq = ({ sourceIp, headers = {} }) => ({
  headers,
  apiGateway: {
    event: {
      requestContext: { identity: { sourceIp } },
    },
  },
  ip: '10.0.0.1',
  connection: { remoteAddress: '10.0.0.1' },
});

describe('getClientIp', () => {
  it('uses the connection-derived API Gateway sourceIp', () => {
    expect(getClientIp(apiGatewayReq({ sourceIp: '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('ignores a spoofed x-forwarded-for header when the API Gateway sourceIp is present', () => {
    const req = apiGatewayReq({
      sourceIp: '203.0.113.7',
      headers: { 'x-forwarded-for': '198.51.100.99, 203.0.113.7' },
    });

    expect(getClientIp(req)).toBe('203.0.113.7');
  });

  it('rotating x-forwarded-for values does not change the derived client id', () => {
    const spoofed = ['1.1.1.1', '2.2.2.2', '3.3.3.3'].map(fake =>
      getClientIp(apiGatewayReq({
        sourceIp: '203.0.113.7',
        headers: { 'x-forwarded-for': fake },
      })));

    expect(spoofed).toEqual(['203.0.113.7', '203.0.113.7', '203.0.113.7']);
  });

  it('ignores x-forwarded-for even without an API Gateway context (local/dev)', () => {
    const req = {
      headers: { 'x-forwarded-for': '198.51.100.99' },
      ip: '192.0.2.10',
      connection: { remoteAddress: '192.0.2.10' },
    };

    expect(getClientIp(req)).toBe('192.0.2.10');
  });

  it('falls back to the socket address when req.ip is unset', () => {
    const req = {
      headers: {},
      connection: { remoteAddress: '192.0.2.20' },
    };

    expect(getClientIp(req)).toBe('192.0.2.20');
  });

  it('strips the IPv6-mapped prefix from IPv4 addresses', () => {
    expect(getClientIp(apiGatewayReq({ sourceIp: '::ffff:203.0.113.7' }))).toBe('203.0.113.7');
    expect(getClientIp({ headers: {}, ip: '::ffff:192.0.2.10' })).toBe('192.0.2.10');
  });

  it('returns "unknown" when no address source is available', () => {
    expect(getClientIp({ headers: {} })).toBe('unknown');
  });
});
