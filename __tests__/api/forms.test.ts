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
}));

// Mock Next.js headers/cookies
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn() }),
  headers: vi.fn().mockResolvedValue({ get: vi.fn() }),
}));

// Now import the routes
import { GET, POST } from "../../app/api/forms/route";
import { GET as GET_ID, PUT as PUT_ID, DELETE as DELETE_ID } from "../../app/api/forms/[id]/route";

// Mock process.env for Turnstile
process.env.TURNSTILE_SECRET_KEY = "dummy";

// Type casting helpers
const mockForm = {
  id: "form-1",
  title: "Test Form",
  description: "A test form",
  published: false,
  collectPhone: true,
  phoneDescription: "Test Description",
  authorId: "admin-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  questions: [],
} as unknown;

describe("Forms API CRUD", () => {
  const mockAdminSession = { userId: "admin-1", email: "admin@test.com", role: "ADMIN" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("GET /api/forms requires admin", async () => {
    vi.mocked(auth.getSession).mockResolvedValue(null);
    const req = new NextRequest("http://localhost:3000/api/forms");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  test("GET /api/forms returns forms for admin", async () => {
    vi.mocked(auth.getSession).mockResolvedValue(mockAdminSession);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.form.findMany.mockResolvedValue([mockForm] as any);
    
    const req = new NextRequest("http://localhost:3000/api/forms");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data[0].id).toBe("form-1");
  });

  test("POST /api/forms creates a new form", async () => {
    vi.mocked(auth.getSession).mockResolvedValue(mockAdminSession);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.form.create.mockResolvedValue(mockForm as any);

    const req = new NextRequest("http://localhost:3000/api/forms", {
      method: "POST",
      body: JSON.stringify({ title: "New Form", description: "Desc" }),
    });
    
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(prismaMock.form.create).toHaveBeenCalled();
  });

  test("GET /api/forms/[id] returns a form", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.form.findUnique.mockResolvedValue(mockForm as any);
    vi.mocked(auth.getSession).mockResolvedValue(mockAdminSession);

    const req = new NextRequest("http://localhost:3000/api/forms/form-1");
    const res = await GET_ID(req, { params: Promise.resolve({ id: "form-1" }) });
    expect(res.status).toBe(200);
  });

  test("PUT /api/forms/[id] updates a form", async () => {
    vi.mocked(auth.getSession).mockResolvedValue(mockAdminSession);
    const updatedForm = { ...(mockForm as object), title: "Updated" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.form.update.mockResolvedValue(updatedForm as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.form.findUnique.mockResolvedValue(updatedForm as any);

    prismaMock.question.deleteMany.mockResolvedValue({ count: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.question.create.mockResolvedValue({ id: "q1", formId: "form-1", type: "SHORT_TEXT", label: "Q1", isRequired: false, order: 0, config: "{}" } as any);

    const req = new NextRequest("http://localhost:3000/api/forms/form-1", {
      method: "PUT",
      body: JSON.stringify({ title: "Updated", questions: [], collectPhone: false, phoneDescription: "Custom desc" }),
    });
    
    const res = await PUT_ID(req, { params: Promise.resolve({ id: "form-1" }) });
    expect(res.status).toBe(200);
    expect(prismaMock.form.update).toHaveBeenCalled();
  });

  test("DELETE /api/forms/[id] deletes a form", async () => {
    vi.mocked(auth.getSession).mockResolvedValue(mockAdminSession);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.form.delete.mockResolvedValue(mockForm as any);

    const req = new NextRequest("http://localhost:3000/api/forms/form-1", {
      method: "DELETE",
    });
    
    const res = await DELETE_ID(req, { params: Promise.resolve({ id: "form-1" }) });
    expect(res.status).toBe(200);
    expect(prismaMock.form.delete).toHaveBeenCalled();
  });
});
