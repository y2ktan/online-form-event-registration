"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  FileText,
  Trash2,
  Eye,
  EyeOff,
  Search,
  LogOut,
  Users,
  ExternalLink,
} from "lucide-react";

interface Form {
  id: string;
  title: string;
  description: string;
  published: boolean;
  createdAt: string;
  _count: { responses: number; questions: number };
}

interface ResponseData {
  id: string;
  phoneNumber: string;
  createdAt: string;
  editToken: string;
  form: { title: string; id: string };
  answers: { id: string; value: string; question: { label: string; type: string } }[];
}

export default function AdminDashboard() {
  const router = useRouter();
  const [forms, setForms] = useState<Form[]>([]);
  const [responses, setResponses] = useState<ResponseData[]>([]);
  const [phoneSearch, setPhoneSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"forms" | "responses">("forms");
  const [loading, setLoading] = useState(true);

  const fetchForms = useCallback(async () => {
    const res = await fetch("/api/forms");
    if (res.ok) {
      setForms(await res.json());
    }
  }, []);

  useEffect(() => {
    // Ensure we run the fetch initially
    fetchForms().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateForm() {
    const res = await fetch("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled Form" }),
    });
    if (res.ok) {
      const form = await res.json();
      router.push(`/admin/forms/${form.id}`);
    }
  }

  async function handleDeleteForm(id: string) {
    if (!confirm("Delete this form and all its responses?")) return;
    const res = await fetch(`/api/forms/${id}`, { method: "DELETE" });
    if (res.ok) {
      setForms((prev) => prev.filter((f) => f.id !== id));
    }
  }

  async function handleTogglePublish(id: string, published: boolean) {
    const res = await fetch(`/api/forms/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !published }),
    });
    if (res.ok) {
      setForms((prev) =>
        prev.map((f) => (f.id === id ? { ...f, published: !published } : f))
      );
    }
  }

  async function handleSearchResponses() {
    if (!phoneSearch.trim()) return;
    const res = await fetch(
      `/api/responses?phone=${encodeURIComponent(phoneSearch)}`
    );
    if (res.ok) {
      setResponses(await res.json());
    }
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function getEditLink(responseId: string, editToken: string) {
    return `${window.location.origin}/edit/${responseId}?token=${editToken}`;
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    alert("Link copied to clipboard!");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-3 py-3 sm:px-4 sm:py-4">
          <h1 className="text-xl font-bold text-gray-900">Form Builder Admin</h1>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
        {/* Tabs */}
        <div className="mb-4 flex gap-2 border-b sm:mb-6 sm:gap-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab("forms")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
              activeTab === "forms"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <FileText className="h-4 w-4" />
            Forms
          </button>
          <button
            onClick={() => setActiveTab("responses")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
              activeTab === "responses"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Users className="h-4 w-4" />
            Search Responses
          </button>
        </div>

        {activeTab === "forms" && (
          <>
            <div className="mb-4 flex items-center justify-between gap-2 sm:mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Your Forms</h2>
              <button
                onClick={handleCreateForm}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
              >
                <Plus className="h-4 w-4" />
                New Form
              </button>
            </div>

            {forms.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-12 text-center">
                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-4 text-lg font-semibold text-gray-900">
                  No forms yet
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  Create your first form to get started.
                </p>
                <button
                  onClick={handleCreateForm}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  <Plus className="h-4 w-4" />
                  Create Form
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {forms.map((form) => (
                  <div
                    key={form.id}
                    className="rounded-lg border bg-white p-3 shadow-sm transition hover:shadow-md sm:rounded-xl sm:p-5"
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <h3 className="font-semibold text-gray-900 line-clamp-1">
                        {form.title}
                      </h3>
                      <span
                        className={`ml-2 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          form.published
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {form.published ? "Published" : "Draft"}
                      </span>
                    </div>
                    <div className="mb-4 flex gap-4 text-sm text-gray-500">
                      <span>{form._count.questions} questions</span>
                      <span>{form._count.responses} responses</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => router.push(`/admin/forms/${form.id}`)}
                        className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-200"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleTogglePublish(form.id, form.published)}
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                        title={form.published ? "Unpublish" : "Publish"}
                      >
                        {form.published ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                      {form.published && (
                        <button
                          onClick={() =>
                            window.open(`/form/${form.id}`, "_blank")
                          }
                          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                          title="View public form"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteForm(form.id)}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "responses" && (
          <>
            <div className="mb-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Search Responses by Phone Number
              </h2>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={phoneSearch}
                    onChange={(e) => setPhoneSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearchResponses()}
                    placeholder="Enter phone number..."
                    className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <button
                  onClick={handleSearchResponses}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  Search
                </button>
              </div>
            </div>

            {responses.length > 0 ? (
              <div className="space-y-4">
                {responses.map((resp) => (
                  <div
                    key={resp.id}
                    className="rounded-lg border bg-white p-3 shadow-sm sm:rounded-xl sm:p-5"
                  >
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {resp.form.title}
                        </h3>
                        <p className="text-xs text-gray-500 sm:text-sm">
                          Phone: {resp.phoneNumber} &bull; Submitted:{" "}
                          {new Date(resp.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() =>
                            router.push(`/admin/responses/${resp.id}`)
                          }
                          className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 sm:px-3 sm:text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() =>
                            copyToClipboard(
                              getEditLink(resp.id, resp.editToken)
                            )
                          }
                          className="rounded-lg bg-indigo-100 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-200 sm:px-3 sm:text-sm"
                        >
                          Copy Edit Link
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {resp.answers.map((a) => (
                        <div key={a.id} className="text-sm">
                          <span className="font-medium text-gray-700">
                            {a.question.label}:
                          </span>{" "}
                          <span className="text-gray-600">{a.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              phoneSearch && (
                <div className="rounded-xl border bg-white p-8 text-center text-gray-500">
                  No responses found for &quot;{phoneSearch}&quot;.
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
