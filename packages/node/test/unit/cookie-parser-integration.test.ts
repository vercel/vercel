import { describe, test, expect } from 'vitest';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import { addHelpers, VercelRequest } from '../../src/serverless-functions/helpers';

describe('Cookie Parser Integration', () => {
  // Helper function to create a mock request with cookie header
  function createMockRequest(cookieHeader: string): IncomingMessage {
    const mockSocket = new Socket();
    const req = new IncomingMessage(mockSocket);
    req.headers.cookie = cookieHeader;
    return req;
  }

  // Helper function to create a mock response
  function createMockResponse(): ServerResponse {
    const mockSocket = new Socket();
    return new ServerResponse(mockSocket);
  }

  test('should parse and return only valid cookies', async () => {
    const req = createMockRequest('sessionid=abc123; user_token=xyz789; auth-token=valid_value');
    const res = createMockResponse();
    
    await addHelpers(req, res);
    const vercelReq = req as VercelRequest;
    
    expect(vercelReq.cookies).toEqual({
      sessionid: 'abc123',
      user_token: 'xyz789',
      'auth-token': 'valid_value'
    });
  });

  test('should filter out cookies with invalid names', async () => {
    const req = createMockRequest('valid_name=value1; invalid;name=value2; another_valid=value3');
    const res = createMockResponse();
    
    await addHelpers(req, res);
    const vercelReq = req as VercelRequest;
    
    expect(vercelReq.cookies).toEqual({
      valid_name: 'value1',
      another_valid: 'value3'
    });
    expect(vercelReq.cookies).not.toHaveProperty('invalid;name');
  });

  test('should filter out cookies with invalid values', async () => {
    const req = createMockRequest('session=good_value; malicious=bad;injection; auth=valid_token');
    const res = createMockResponse();
    
    await addHelpers(req, res);
    const vercelReq = req as VercelRequest;
    
    expect(vercelReq.cookies).toEqual({
      session: 'good_value',
      auth: 'valid_token'
    });
    expect(vercelReq.cookies).not.toHaveProperty('malicious');
  });

  test('should prevent HTTP response splitting attacks', async () => {
    const req = createMockRequest('valid=value; evil=test\r\nSet-Cookie: injected=malicious; good=clean');
    const res = createMockResponse();
    
    await addHelpers(req, res);
    const vercelReq = req as VercelRequest;
    
    expect(vercelReq.cookies).toEqual({
      valid: 'value',
      good: 'clean'
    });
    expect(vercelReq.cookies).not.toHaveProperty('evil');
  });

  test('should prevent cookie injection attacks', async () => {
    const req = createMockRequest('session=abc123; attack=value; malicious=evil; normal=test');
    const res = createMockResponse();
    
    await addHelpers(req, res);
    const vercelReq = req as VercelRequest;
    
    expect(vercelReq.cookies).toEqual({
      session: 'abc123',
      attack: 'value',
      malicious: 'evil',
      normal: 'test'
    });
  });

  test('should handle control characters in cookie names', async () => {
    const req = createMockRequest('valid=value; bad\x00name=value; good_cookie=test');
    const res = createMockResponse();
    
    await addHelpers(req, res);
    const vercelReq = req as VercelRequest;
    
    expect(vercelReq.cookies).toEqual({
      valid: 'value',
      good_cookie: 'test'
    });
    expect(vercelReq.cookies).not.toHaveProperty('bad\x00name');
  });

  test('should handle control characters in cookie values', async () => {
    const req = createMockRequest('session=good; token=bad\x0Avalue; auth=clean');
    const res = createMockResponse();
    
    await addHelpers(req, res);
    const vercelReq = req as VercelRequest;
    
    expect(vercelReq.cookies).toEqual({
      session: 'good',
      auth: 'clean'
    });
    expect(vercelReq.cookies).not.toHaveProperty('token');
  });

  test('should handle empty cookie header', async () => {
    const req = createMockRequest('');
    const res = createMockResponse();
    
    await addHelpers(req, res);
    const vercelReq = req as VercelRequest;
    
    expect(vercelReq.cookies).toEqual({});
  });

  test('should handle missing cookie header', async () => {
    const mockSocket = new Socket();
    const req = new IncomingMessage(mockSocket);
    // No cookie header set
    const res = createMockResponse();
    
    await addHelpers(req, res);
    const vercelReq = req as VercelRequest;
    
    expect(vercelReq.cookies).toEqual({});
  });

  test('should handle malformed cookie headers gracefully', async () => {
    const req = createMockRequest('invalid cookie header format');
    const res = createMockResponse();
    
    await addHelpers(req, res);
    const vercelReq = req as VercelRequest;
    
    // Should not crash and return empty object for unparseable cookies
    expect(typeof vercelReq.cookies).toBe('object');
  });

  test('should maintain backward compatibility with existing valid cookies', async () => {
    // Test the existing test case mentioned in the PR description
    const req = createMockRequest('who=chris; sessionid=abc123; auth-token=jwt_value');
    const res = createMockResponse();
    
    await addHelpers(req, res);
    const vercelReq = req as VercelRequest;
    
    expect(vercelReq.cookies).toEqual({
      who: 'chris',
      sessionid: 'abc123',
      'auth-token': 'jwt_value'
    });
  });
});
