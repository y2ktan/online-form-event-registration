"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  User,
  KeyRound,
  Settings,
  ChevronDown,
  Camera,
  Copy,
  Loader2,
  Type,
  MessageSquare,
} from "lucide-react";

interface CurrentUser {
  id: string;
  email: string;
  nickname: string;
  role: string;
}

interface Form {
  id: string;
  title: string;
  description: string;
  published: boolean;
  createdAt: string;
  _count: { responses: number; questions: number };
  author?: { email: string; nickname: string };
}

interface ResponseData {
  id: string;
  phoneNumber: string;
  createdAt: string;
  editToken: string;
  form: { title: string; id: string };
  answers: { id: string; value: string; question: { label: string; type: string } }[];
}

function AdminDashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [forms, setForms] = useState<Form[]>([]);
  const [responses, setResponses] = useState<ResponseData[]>([]);
  const [phoneSearch, setPhoneSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"forms" | "responses">(
    searchParams.get("tab") === "responses" ? "responses" : "forms"
  );
  const [loading, setLoading] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [pwdForm, setPwdForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [copyingFormId, setCopyingFormId] = useState<string | null>(null);

  const isAdmin = currentUser?.role === "ADMIN";

  const fetchForms = useCallback(async () => {
    const res = await fetch("/api/forms");
    if (res.ok) {
      setForms(await res.json());
    }
  }, []);

  const fetchUser = useCallback(async () => {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      setCurrentUser(await res.json());
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchForms(), fetchUser()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError("");
    setPwdSuccess(false);
    setPwdLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pwdForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwdError(data.error || "Failed to change password.");
      } else {
        setPwdSuccess(true);
        setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      }
    } catch {
      setPwdError("An unexpected error occurred.");
    } finally {
      setPwdLoading(false);
    }
  }

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

  async function handleCopyForm(id: string) {
    setCopyingFormId(id);
    try {
      const res = await fetch(`/api/forms/${id}/copy`, { method: "POST" });
      if (res.ok) {
        const newForm = await res.json();
        router.push(`/admin/forms/${newForm.id}`);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to copy form.");
      }
    } catch {
      alert("Failed to copy form.");
    } finally {
      setCopyingFormId(null);
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
          <h1 className="text-xl font-bold text-gray-900">Form Builder</h1>
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                <User className="h-4 w-4" />
              </div>
              <span className="hidden sm:inline max-w-[150px] truncate">
                {currentUser?.nickname || currentUser?.email || ""}
              </span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {showProfileMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowProfileMenu(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-xl bg-white py-2 shadow-xl ring-1 ring-black/5">
                  <div className="border-b px-4 py-3">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {currentUser?.nickname || currentUser?.email}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{currentUser?.email}</p>
                    <span className="mt-1 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {currentUser?.role}
                    </span>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => { setShowChangePassword(true); setShowProfileMenu(false); }}
                      className="flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <KeyRound className="h-4 w-4" />
                      Change Password
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => { router.push("/admin/users"); setShowProfileMenu(false); }}
                          className="flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <Users className="h-4 w-4" />
                          Manage Users
                        </button>
                        <button
                          onClick={() => { router.push("/admin/settings/smtp"); setShowProfileMenu(false); }}
                          className="flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <Settings className="h-4 w-4" />
                          SMTP Settings
                        </button>
                        <button
                          onClick={() => { router.push("/admin/settings/fonts"); setShowProfileMenu(false); }}
                          className="flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <Type className="h-4 w-4" />
                          Font Settings
                        </button>
                        <button
                          onClick={() => { router.push("/admin/settings/messaging"); setShowProfileMenu(false); }}
                          className="flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <MessageSquare className="h-4 w-4" />
                          Messaging Settings
                        </button>
                      </>
                    )}
                  </div>
                  <div className="border-t py-1">
                    <button
                      onClick={() => { handleLogout(); setShowProfileMenu(false); }}
                      className="flex w-full items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
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
              <h2 className="text-lg font-semibold text-gray-900">
                {isAdmin ? "All Forms" : "Your Forms"}
              </h2>
              {isAdmin && (
                <button
                  onClick={handleCreateForm}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                >
                  <Plus className="h-4 w-4" />
                  New Form
                </button>
              )}
            </div>

            {forms.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-12 text-center">
                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-4 text-lg font-semibold text-gray-900">
                  No forms yet
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  {isAdmin ? "Create your first form to get started." : "You have not been invited to any forms yet."}
                </p>
                {isAdmin && (
                  <button
                    onClick={handleCreateForm}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                  >
                    <Plus className="h-4 w-4" />
                    Create Form
                  </button>
                )}
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
                      {isAdmin && (
                        <>
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
                            onClick={() => handleCopyForm(form.id)}
                            disabled={copyingFormId === form.id}
                            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                            title="Make a copy"
                          >
                            {copyingFormId === form.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteForm(form.id)}
                            className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
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
                              <span className="text-gray-600">
                                {a.question.type === "SELFIE" ? (
                                  <span className="flex items-center gap-1 text-indigo-600">
                                    <Camera className="h-3 w-3" />
                                    Selfie Captured
                                  </span>
                                ) : (
                                  a.value
                                )}
                              </span>
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

      {/* Change Password Modal */}
      {showChangePassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">Change Password</h2>
            <p className="mt-1 text-sm text-gray-500">
              Must be at least 12 characters with uppercase, numbers, and symbols.
            </p>
            <form onSubmit={handleChangePassword} className="mt-5 space-y-4">
              {pwdError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{pwdError}</div>
              )}
              {pwdSuccess && (
                <div className="rounded-lg bg-green-50 p-3 text-sm text-green-600">Password changed successfully.</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700">Current Password</label>
                <div className="relative mt-1">
                  <input
                    type={showCurrentPwd ? "text" : "password"}
                    value={pwdForm.currentPassword}
                    onChange={(e) => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
                    required
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button type="button" onClick={() => setShowCurrentPwd(!showCurrentPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showCurrentPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">New Password</label>
                <div className="relative mt-1">
                  <input
                    type={showNewPwd ? "text" : "password"}
                    value={pwdForm.newPassword}
                    onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                    required
                    minLength={12}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button type="button" onClick={() => setShowNewPwd(!showNewPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                <div className="relative mt-1">
                  <input
                    type={showConfirmPwd ? "text" : "password"}
                    value={pwdForm.confirmPassword}
                    onChange={(e) => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
                    onPaste={(e) => e.preventDefault()}
                    required
                    minLength={12}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button type="button" onClick={() => setShowConfirmPwd(!showConfirmPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-400">Paste is disabled on this field.</p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowChangePassword(false); setPwdError(""); setPwdSuccess(false); setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); }}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {pwdLoading ? "Changing..." : "Change Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="text-gray-500">Loading...</div></div>}>
      <AdminDashboardInner />
    </Suspense>
  );
}
