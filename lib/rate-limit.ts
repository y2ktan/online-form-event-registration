const rateMap = new Map<string, { count: number; resetTime: number }>();

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 10 * 1000, // 1 minute
  maxRequests: 30,
};

const STRICT_CONFIG: RateLimitConfig = {
  windowMs: 10 * 1000,
  maxRequests: 5,
};

export function checkRateLimit(
  identifier: string,
  strict = false
): { allowed: boolean; remaining: number } {
  const config = strict ? STRICT_CONFIG : DEFAULT_CONFIG;
  const now = Date.now();
  const entry = rateMap.get(identifier);

  if (!entry || now > entry.resetTime) {
    rateMap.set(identifier, { count: 1, resetTime: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1 };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: config.maxRequests - entry.count };
}

// Clean up expired entries periodically
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateMap.entries()) {
      if (now > entry.resetTime) {
        rateMap.delete(key);
      }
    }
  }, 60 * 1000);
}
