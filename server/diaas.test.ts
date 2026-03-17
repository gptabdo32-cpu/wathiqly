import { describe, it, expect, beforeAll } from 'vitest';
import { diaasRouter } from './routers/diaas';
import { getDb } from './db';
import { apiClients, verificationRequests } from '../drizzle/schema_diaas';
import { eq } from 'drizzle-orm';

describe('DIaaS Business API Tests', () => {
  let testClientId: string;
  let testClientSecret: string;
  let verificationId: number;

  it('should register a new business client (Admin only)', async () => {
    // Mock context with admin user
    const ctx: any = {
      db: await getDb(),
      user: { role: 'admin', id: 1 },
      encryption: { hashData: (s: string) => s }, // Simple mock
    };

    const input = {
      clientName: 'Test Bank Libya',
      businessCategory: 'banking',
      contactEmail: 'it@testbank.ly',
      allowedScopes: ['identity_verify']
    };

    const caller = diaasRouter.createCaller(ctx);
    const result = await caller.registerClient(input);

    expect(result.success).toBe(true);
    expect(result.clientId).toBeDefined();
    expect(result.clientSecret).toBeDefined();
    
    testClientId = result.clientId;
    testClientSecret = result.clientSecret;
  });

  it('should fail to initiate verification with invalid credentials', async () => {
    const ctx: any = {
      db: await getDb(),
      encryption: { hashData: (s: string) => s + "_wrong" }, // Wrong hash
      req: { ip: '127.0.0.1', headers: {} }
    };

    const caller = diaasRouter.createCaller(ctx);
    
    await expect(caller.initiateVerification({
      clientId: testClientId,
      clientSecret: testClientSecret,
      fullName: 'Test User',
      nationalIdNumber: '123456789',
      idCardImageUrl: 'http://test.com/id.jpg',
      selfieImageUrl: 'http://test.com/selfie.jpg'
    })).rejects.toThrow();
  });

  it('should fetch client stats and usage', async () => {
    const ctx: any = {
      db: await getDb(),
      encryption: { hashData: (s: string) => s },
    };

    const caller = diaasRouter.createCaller(ctx);
    const result = await caller.getClientStats({
      clientId: testClientId,
      clientSecret: testClientSecret
    });

    expect(result.clientName).toBe('Test Bank Libya');
    expect(result.stats).toBeDefined();
    expect(result.stats.totalRequests).toBeGreaterThanOrEqual(0);
  });
});
