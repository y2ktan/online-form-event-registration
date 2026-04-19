import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    messagingConfig: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock crypto — must come before importing messaging
vi.mock("@/lib/google-sheets-crypto", () => ({
  encryptKey: vi.fn((v: string) => `encrypted:${v}`),
  decryptKey: vi.fn((v: string) => v.replace("encrypted:", "")),
}));

import {
  sendConfirmation,
  uploadWaMedia,
  fireAndForgetConfirmation,
  type MessagingConfig,
  type ConfirmationRecipient,
} from "../lib/messaging";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<MessagingConfig> = {}): MessagingConfig {
  return {
    id: "cfg-1",
    enabled: true,
    waApiEnabled: true,
    waApiBaseUrl: "wabiwebhook.tzuchi.com.my",
    waApiPort: 3000,
    waApiBearerToken: "test-bearer-token",
    ...overrides,
  };
}

// ─── sendConfirmation ───────────────────────────────────────────────────────

describe("sendConfirmation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("returns error for empty recipients", async () => {
    const config = makeConfig();
    const result = await sendConfirmation(config, [], 3, "https://example.com/confirm");
    expect(result.success).toBe(false);
    expect(result.error).toBe("No recipients");
  });

  test("sends POST with correct URL, bearer header, and body", async () => {
    const config = makeConfig();
    const recipients: ConfirmationRecipient[] = [
      { to: "601165232155", name: "ong" },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"success":true}'),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await sendConfirmation(
      config,
      recipients,
      3,
      "https://example.com/confirm",
      "media-uuid",
      ["Event 1", "Event 2"],
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);

    // Verify fetch was called with correct arguments
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("http://wabiwebhook.tzuchi.com.my:3000/api/confirmation/send-confirmation");
    expect(options.method).toBe("POST");
    expect(options.headers["Authorization"]).toBe("Bearer test-bearer-token");
    expect(options.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(options.body);
    expect(body.recipients).toEqual(recipients);
    expect(body.templateNumber).toBe(3);
    expect(body.confirmationUrl).toBe("https://example.com/confirm");
    expect(body.headerMediaId).toBe("media-uuid");
    expect(body.events).toEqual(["Event 1", "Event 2"]);

    vi.unstubAllGlobals();
  });

  test("omits optional fields when not provided", async () => {
    const config = makeConfig();
    const recipients: ConfirmationRecipient[] = [{ to: "601165232155", name: "ong" }];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"success":true}'),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendConfirmation(config, recipients, 3, "https://example.com/confirm");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.headerMediaId).toBeUndefined();
    expect(body.events).toBeUndefined();

    vi.unstubAllGlobals();
  });

  test("handles fetch error gracefully", async () => {
    const config = makeConfig();
    const recipients: ConfirmationRecipient[] = [{ to: "601165232155", name: "ong" }];

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const result = await sendConfirmation(config, recipients, 3, "https://example.com/confirm");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error");

    vi.unstubAllGlobals();
  });

  test("handles non-ok response", async () => {
    const config = makeConfig();
    const recipients: ConfirmationRecipient[] = [{ to: "601165232155", name: "ong" }];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    }));

    const result = await sendConfirmation(config, recipients, 3, "https://example.com/confirm");
    expect(result.success).toBe(false);
    expect(result.status).toBe(401);

    vi.unstubAllGlobals();
  });

  test("uses http:// prefix when base URL has no protocol", async () => {
    const config = makeConfig({ waApiBaseUrl: "wabiwebhook.tzuchi.com.my" });
    const recipients: ConfirmationRecipient[] = [{ to: "601165232155", name: "ong" }];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"ok":true}'),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendConfirmation(config, recipients, 3, "https://example.com/confirm");

    const url = mockFetch.mock.calls[0][0];
    expect(url).toBe("http://wabiwebhook.tzuchi.com.my:3000/api/confirmation/send-confirmation");

    vi.unstubAllGlobals();
  });

  test("preserves existing http/https prefix in base URL", async () => {
    const config = makeConfig({ waApiBaseUrl: "https://wabiwebhook.tzuchi.com.my" });
    const recipients: ConfirmationRecipient[] = [{ to: "601165232155", name: "ong" }];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"ok":true}'),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendConfirmation(config, recipients, 3, "https://example.com/confirm");

    const url = mockFetch.mock.calls[0][0];
    expect(url).toBe("https://wabiwebhook.tzuchi.com.my:3000/api/confirmation/send-confirmation");

    vi.unstubAllGlobals();
  });
});

// ─── uploadWaMedia ──────────────────────────────────────────────────────────

describe("uploadWaMedia", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("uploads file and returns mediaId", async () => {
    const config = makeConfig();
    const buffer = Buffer.from("fake-image-data");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            results: [{ id: "media-uuid-123", filename: "test.jpg", url: "http://example.com/test.jpg" }],
          }),
        ),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await uploadWaMedia(config, buffer, "test.jpg", "image/jpeg");

    expect(result.success).toBe(true);
    expect(result.mediaId).toBe("media-uuid-123");

    // Verify bearer token in header
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("http://wabiwebhook.tzuchi.com.my:3000/api/media/upload");
    expect(options.headers.Authorization).toBe("Bearer test-bearer-token");
    expect(options.method).toBe("POST");

    vi.unstubAllGlobals();
  });

  test("returns error when upload fails", async () => {
    const config = makeConfig();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Server error"),
    }));

    const result = await uploadWaMedia(config, Buffer.from("data"), "test.jpg", "image/jpeg");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Upload failed");

    vi.unstubAllGlobals();
  });

  test("returns error when response has no results", async () => {
    const config = makeConfig();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ results: [] })),
    }));

    const result = await uploadWaMedia(config, Buffer.from("data"), "test.jpg", "image/jpeg");
    expect(result.success).toBe(false);
    expect(result.error).toBe("No media ID in response");

    vi.unstubAllGlobals();
  });

  test("handles network error", async () => {
    const config = makeConfig();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Connection refused")));

    const result = await uploadWaMedia(config, Buffer.from("data"), "test.jpg", "image/jpeg");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Connection refused");

    vi.unstubAllGlobals();
  });
});

// ─── fireAndForgetConfirmation ──────────────────────────────────────────────

describe("fireAndForgetConfirmation", () => {
  test("does not throw and runs asynchronously", async () => {
    // Mock getMessagingConfig to return null (disabled)
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.messagingConfig.findFirst).mockResolvedValue(null);

    // Should not throw
    expect(() => {
      fireAndForgetConfirmation(
        [{ to: "601165232155", name: "test" }],
        3,
        "https://example.com/confirm",
      );
    }).not.toThrow();

    // Wait for async to settle
    await new Promise((r) => setTimeout(r, 50));
  });
});

// ─── Bearer token security ─────────────────────────────────────────────────

describe("bearer token security", () => {
  test("bearer token is never included in the request body", async () => {
    const config = makeConfig();
    const recipients: ConfirmationRecipient[] = [{ to: "601165232155", name: "ong" }];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"success":true}'),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendConfirmation(config, recipients, 3, "https://example.com/confirm");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain("test-bearer-token");
    expect(bodyStr).not.toContain("Bearer");

    vi.unstubAllGlobals();
  });
});
