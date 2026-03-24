"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  UserPlus,
  Trash2,
  RefreshCw,
  Mail,
  Shield,
  User,
  ClipboardCopy,
  Check,
} from "lucide-react";

interface UserData {
  id: string;
  email: string;
  nickname: string;
  phone: string;
  role: string;
  status: string;
  createdAt: string;
  _count: { collaborations: number };
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteNickname, setInviteNickname] = useState("");
  const [inviteRole, setInviteRole] = useState("USER");
  const [inviteError, setInviteError] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [copyingUserId, setCopyingUserId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      setUsers(await res.json());
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(u => {
      if (u) setCurrentUser(u);
    });
    fetchUsers().finally(() => setLoading(false));
  }, [fetchUsers]);

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update role.");
      }
    } catch {
      alert("An unexpected error occurred.");
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError("");
    setInviteMessage("");
    setInviteLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          nickname: inviteNickname,
          role: inviteRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error || "Failed to invite user.");
      } else {
        setInviteMessage(data.message || "User invited successfully.");
        setInviteEmail("");
        setInviteNickname("");
        setInviteRole("USER");
        fetchUsers();
      }
    } catch {
      setInviteError("An unexpected error occurred.");
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleDelete(userId: string, email: string) {
    if (!confirm(`Are you sure you want to delete ${email}? This action cannot be undone.`)) {
      return;
    }
    const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    if (res.ok) {
      fetchUsers();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to delete user.");
    }
  }

  async function handleCopyActivationLink(userId: string) {
    setCopyingUserId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/activation-link`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setToast({ message: data.error || "Failed to generate link.", type: "error" });
        setCopyingUserId(null);
        return;
      }
      await navigator.clipboard.writeText(data.activationLink);
      setToast({ message: "Activation link copied to clipboard!", type: "success" });
      setTimeout(() => setCopyingUserId(null), 1500);
    } catch {
      setToast({ message: "Failed to copy activation link.", type: "error" });
      setCopyingUserId(null);
    }
    setTimeout(() => setToast(null), 3000);
  }

  async function handleResend(userId: string) {
    const res = await fetch(`/api/admin/users/${userId}/resend`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      alert(data.message || "Invitation resent.");
    } else {
      alert(data.error || "Failed to resend invitation.");
    }
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
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/admin")}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">User Management</h1>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            <UserPlus className="h-4 w-4" />
            Invite User
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500">User</th>
                <th className="px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Role</th>
                <th className="px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Forms</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900 truncate max-w-[200px]">
                        {user.nickname || user.email}
                      </p>
                      {user.nickname && (
                        <p className="text-xs text-gray-500 truncate max-w-[200px]">{user.email}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="relative inline-block min-w-[120px]">
                      <select
                        value={user.role}
                        disabled={currentUser?.id === user.id}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className={`block w-full rounded-full pl-4 pr-12 py-1.5 text-xs font-bold appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed ${
                          user.role === "ADMIN"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        <option value="USER">USER</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center">
                        {user.role === "ADMIN" ? (
                          <Shield className="h-3.5 w-3.5 text-purple-700" />
                        ) : (
                          <User className="h-3.5 w-3.5 text-blue-700" />
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          user.status === "ACTIVATED"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {user.status === "ACTIVATED" ? "Active" : "Pending"}
                      </span>
                      {user.status === "PENDING_ACTIVATION" && (
                        <button
                          onClick={() => handleCopyActivationLink(user.id)}
                          className="rounded p-1 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                          title="Copy activation link"
                          disabled={copyingUserId === user.id}
                        >
                          {copyingUserId === user.id ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <ClipboardCopy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-500">
                    {user.role === "ADMIN" ? "All" : user._count.collaborations}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {user.status === "PENDING_ACTIVATION" && (
                        <button
                          onClick={() => handleResend(user.id)}
                          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                          title="Resend invitation"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(user.id, user.email)}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                        title="Delete user"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                    No users found. Invite your first user to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.type === "success" ? (
            <Check className="h-4 w-4" />
          ) : null}
          {toast.message}
        </div>
      )}

      {/* Invite User Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">Invite User</h2>
            <p className="mt-1 text-sm text-gray-500">
              Send an invitation email to a new user. They will set their own password.
            </p>
            <form onSubmit={handleInvite} className="mt-5 space-y-4">
              {inviteError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{inviteError}</div>
              )}
              {inviteMessage && (
                <div className="rounded-lg bg-green-50 p-3 text-sm text-green-600">{inviteMessage}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700">Email *</label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    className="block w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="user@example.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Nickname (optional)</label>
                <input
                  type="text"
                  value={inviteNickname}
                  onChange={(e) => setInviteNickname(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Display name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowInvite(false);
                    setInviteError("");
                    setInviteMessage("");
                  }}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {inviteLoading ? "Sending..." : "Send Invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
