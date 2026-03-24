import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateShortCode } from '../lib/short-code';
import { prisma } from '../lib/prisma';

// Mock prisma
vi.mock('../lib/prisma', () => ({
  prisma: {
    response: {
      findFirst: vi.fn(),
    },
  },
}));

describe('generateShortCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates a 6-character alphanumeric code', async () => {
    vi.mocked(prisma.response.findFirst).mockResolvedValue(null);
    const code = await generateShortCode('form-id');
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z0-9]+$/);
  });

  it('retries on collision and returns a unique code', async () => {
    // First attempt: collision
    // Second attempt: unique
    vi.mocked(prisma.response.findFirst)
      .mockResolvedValueOnce({ id: 'existing' } as any)
      .mockResolvedValueOnce(null);

    const code = await generateShortCode('form-id');
    expect(code).toHaveLength(6);
    expect(prisma.response.findFirst).toHaveBeenCalledTimes(2);
  });

  it('throws error after max attempts', async () => {
    vi.mocked(prisma.response.findFirst).mockResolvedValue({ id: 'existing' } as any);
    await expect(generateShortCode('form-id')).rejects.toThrow('Failed to generate a unique short code');
  });
});
