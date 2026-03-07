import { describe, it, expect } from 'vitest';

/**
 * دالة حساب العمولة (محاكاة للمنطق الموجود في routers.ts)
 */
function calculateCommission(amount: string, percentage: string): string {
  const amt = parseFloat(amount);
  const pct = parseFloat(percentage);
  if (isNaN(amt) || isNaN(pct)) return "0.00";
  return (amt * (pct / 100)).toFixed(2);
}

/**
 * دالة حساب صافي المبلغ للبائع
 */
function calculateSellerNet(amount: string, commission: string): string {
  const amt = parseFloat(amount);
  const comm = parseFloat(commission);
  if (isNaN(amt) || isNaN(comm)) return "0.00";
  return (amt - comm).toFixed(2);
}

describe('Commission Calculations', () => {
  it('should calculate 2.5% commission correctly for 100 LYD', () => {
    const amount = "100.00";
    const percentage = "2.5";
    const expectedCommission = "2.50";
    const expectedNet = "97.50";

    const commission = calculateCommission(amount, percentage);
    const net = calculateSellerNet(amount, commission);

    expect(commission).toBe(expectedCommission);
    expect(net).toBe(expectedNet);
  });

  it('should calculate 5% commission correctly for 250.50 LYD', () => {
    const amount = "250.50";
    const percentage = "5.0";
    const expectedCommission = "12.53"; // 250.5 * 0.05 = 12.525 -> 12.53
    const expectedNet = "237.97";

    const commission = calculateCommission(amount, percentage);
    const net = calculateSellerNet(amount, commission);

    expect(commission).toBe(expectedCommission);
    expect(net).toBe(expectedNet);
  });

  it('should handle 0% commission', () => {
    const amount = "1000.00";
    const percentage = "0.0";
    const expectedCommission = "0.00";
    const expectedNet = "1000.00";

    const commission = calculateCommission(amount, percentage);
    const net = calculateSellerNet(amount, commission);

    expect(commission).toBe(expectedCommission);
    expect(net).toBe(expectedNet);
  });

  it('should handle 100% commission', () => {
    const amount = "50.00";
    const percentage = "100.0";
    const expectedCommission = "50.00";
    const expectedNet = "0.00";

    const commission = calculateCommission(amount, percentage);
    const net = calculateSellerNet(amount, commission);

    expect(commission).toBe(expectedCommission);
    expect(net).toBe(expectedNet);
  });

  it('should handle very small amounts', () => {
    const amount = "0.01";
    const percentage = "2.5";
    const expectedCommission = "0.00"; // 0.01 * 0.025 = 0.00025 -> 0.00
    const expectedNet = "0.01";

    const commission = calculateCommission(amount, percentage);
    const net = calculateSellerNet(amount, commission);

    expect(commission).toBe(expectedCommission);
    expect(net).toBe(expectedNet);
  });
});
