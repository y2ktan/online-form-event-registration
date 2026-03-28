import { expect, test, describe, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock } from "../singleton";
import * as auth from "../../lib/auth";

// Mock rate limit
vi.mock("../../lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
}));

vi.mock("../../lib/auth", () => ({
  getSession: vi.fn(),
  canEditForm: vi.fn(),
}));

// Mock Next.js headers/cookies
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn() }),
  headers: vi.fn().mockResolvedValue({ get: vi.fn() }),
}));

import { POST as COPY } from "../../app/api/forms/[id]/copy/route";

const mockAdminSession = { userId: "admin-1", email: "admin@test.com", role: "ADMIN" };

const mockOriginalForm = {
  id: "form-1",
  title: "Original Form",
  description: "A test form",
  published: true,
  collectPhone: true,
  phoneDescription: "Phone desc",
  phoneTitle: "Phone Number",
  phonePlaceholder: "Enter phone",
  authorId: "admin-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  sections: [
    {
      id: "sec-1",
      formId: "form-1",
      title: "Section 1",
      description: "",
      order: 0,
      routingConfig: JSON.stringify({ defaultRoute: "sec-2" }),
      questions: [
        {
          id: "q-1",
          formId: "form-1",
          sectionId: "sec-1",
          type: "SHORT_TEXT",
          label: "Name",
          isRequired: true,
          order: 0,
          config: "{}",
          options: [],
        },
        {
          id: "q-2",
          formId: "form-1",
          sectionId: "sec-1",
          type: "MULTIPLE_CHOICE",
          label: "Color",
          isRequired: false,
          order: 1,
          config: JSON.stringify({ routing: { enabled: true, type: "OPTION_MATCH", rules: { Red: "sec-2" } } }),
          options: [
            { id: "opt-1", questionId: "q-2", value: "Red", order: 0, group: "default" },
            { id: "opt-2", questionId: "q-2", value: "Blue", order: 1, group: "default" },
          ],
        },
      ],
    },
    {
      id: "sec-2",
      formId: "form-1",
      title: "Section 2",
      description: "Second section",
      order: 1,
      routingConfig: "{}",
      questions: [],
    },
  ],
  collaborators: [
    { id: "collab-1", userId: "user-2", formId: "form-1", role: "EDITOR", createdAt: new Date() },
  ],
};

// The new form returned by form.create inside transaction
const mockNewForm = {
  id: "form-2",
  title: "Copy of Original Form",
  description: "A test form",
  published: false,
  authorId: "admin-1",
};

describe("POST /api/forms/[id]/copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 when not authenticated", async () => {
    vi.mocked(auth.getSession).mockResolvedValue(null);
    const req = new NextRequest("http://localhost:3000/api/forms/form-1/copy", { method: "POST" });
    const res = await COPY(req, { params: Promise.resolve({ id: "form-1" }) });
    expect(res.status).toBe(401);
  });

  test("returns 403 when user cannot edit the form", async () => {
    vi.mocked(auth.getSession).mockResolvedValue(mockAdminSession);
    vi.mocked(auth.canEditForm).mockResolvedValue(false);
    const req = new NextRequest("http://localhost:3000/api/forms/form-1/copy", { method: "POST" });
    const res = await COPY(req, { params: Promise.resolve({ id: "form-1" }) });
    expect(res.status).toBe(403);
  });

  test("returns 404 when form does not exist", async () => {
    vi.mocked(auth.getSession).mockResolvedValue(mockAdminSession);
    vi.mocked(auth.canEditForm).mockResolvedValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.form.findUnique.mockResolvedValue(null as any);

    const req = new NextRequest("http://localhost:3000/api/forms/form-1/copy", { method: "POST" });
    const res = await COPY(req, { params: Promise.resolve({ id: "form-1" }) });
    expect(res.status).toBe(404);
  });

  test("copies form successfully with sections, questions, options and collaborators", async () => {
    vi.mocked(auth.getSession).mockResolvedValue(mockAdminSession);
    vi.mocked(auth.canEditForm).mockResolvedValue(true);

    // findUnique returns the original form first, then the full new form
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.form.findUnique.mockResolvedValueOnce(mockOriginalForm as any);

    // Mock the transaction — the callback receives a tx proxy, we mock it via $transaction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => {
      const txMock = {
        form: {
          create: vi.fn().mockResolvedValue(mockNewForm),
        },
        section: {
          create: vi.fn()
            .mockResolvedValueOnce({ id: "new-sec-1", formId: "form-2", title: "Section 1", order: 0 })
            .mockResolvedValueOnce({ id: "new-sec-2", formId: "form-2", title: "Section 2", order: 1 }),
          update: vi.fn().mockResolvedValue({}),
        },
        question: {
          create: vi.fn()
            .mockResolvedValueOnce({ id: "new-q-1" })
            .mockResolvedValueOnce({ id: "new-q-2" }),
          update: vi.fn().mockResolvedValue({}),
        },
        option: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        formCollaborator: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return fn(txMock);
    });

    // Second findUnique returns the full new form for the response
    const fullNewForm = { ...mockNewForm, sections: [], questions: [], _count: { responses: 0, questions: 2 } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.form.findUnique.mockResolvedValueOnce(fullNewForm as any);

    const req = new NextRequest("http://localhost:3000/api/forms/form-1/copy", { method: "POST" });
    const res = await COPY(req, { params: Promise.resolve({ id: "form-1" }) });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toBe("Copy of Original Form");
  });

  test("copy creates form as draft regardless of original publish state", async () => {
    vi.mocked(auth.getSession).mockResolvedValue(mockAdminSession);
    vi.mocked(auth.canEditForm).mockResolvedValue(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.form.findUnique.mockResolvedValueOnce(mockOriginalForm as any);

    let capturedFormData: Record<string, unknown> | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => {
      const txMock = {
        form: {
          create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
            capturedFormData = args.data;
            return Promise.resolve(mockNewForm);
          }),
        },
        section: {
          create: vi.fn().mockResolvedValue({ id: "new-sec-1", formId: "form-2" }),
          update: vi.fn().mockResolvedValue({}),
        },
        question: { create: vi.fn().mockResolvedValue({ id: "new-q-1" }), update: vi.fn().mockResolvedValue({}) },
        option: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        formCollaborator: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      };
      return fn(txMock);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.form.findUnique.mockResolvedValueOnce({ ...mockNewForm, sections: [], questions: [], _count: { responses: 0, questions: 0 } } as any);

    const req = new NextRequest("http://localhost:3000/api/forms/form-1/copy", { method: "POST" });
    await COPY(req, { params: Promise.resolve({ id: "form-1" }) });

    expect(capturedFormData).not.toBeNull();
    expect(capturedFormData!.published).toBe(false);
    expect(capturedFormData!.title).toBe("Copy of Original Form");
  });
});
