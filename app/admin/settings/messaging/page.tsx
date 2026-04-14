"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Check, MessageSquare, Send, Wifi, WifiOff } from "lucide-react";

interface MessagingData {
  enabled: boolean;
  provider: string;
  apiBaseUrl: string;
  apiPort: number;
  apiPath: string;
  tokenId: string;
  sender: string;
  requestTimeout: number;
  maxRetries: number;
  tlsVerify: boolean;
}

const defaultConfig: MessagingData = {
  enabled: false,
  provider: "TzuChiWABI",
  apiBaseUrl: "",
  apiPort: 441,
  apiPath: "/api/sendMessage",
  tokenId: "",
  sender: "WhatsApp",
  requestTimeout: 10000,
  maxRetries: 3,
  tlsVerify: true,
};

const SENDER_OPTIONS = ["WhatsApp", "SmsModem", "SmsGateway", "Email"];

export default function MessagingSettingsPage() {
  const router = useRouter();
  const [form, setForm] = useState<MessagingData>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/messaging");
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setForm({
              enabled: data.enabled ?? false,
              provider: data.provider || "TzuChiWABI",
              apiBaseUrl: data.apiBaseUrl || "",
              apiPort: data.apiPort || 441,
              apiPath: data.apiPath || "/api/sendMessage",
              tokenId: data.tokenId || "",
              sender: data.sender || "WhatsApp",
              requestTimeout: data.requestTimeout || 10000,
              maxRetries: data.maxRetries ?? 3,
              tlsVerify: data.tlsVerify ?? true,
            });
          }
        }
      } catch {
        // Ignore load errors
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Clean up save timer on unmount
  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState("saving");
    try {
      const res = await fetch("/api/admin/messaging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save messaging config.");
        setSaveState("idle");
      } else {
        setSuccess("Messaging configuration saved successfully.");
        if (data.tokenId) {
          setForm((prev) => ({ ...prev, tokenId: data.tokenId }));
        }
        setSaveState("saved");
        saveTimerRef.current = setTimeout(() => setSaveState("idle"), 3000);
      }
    } catch {
      setError("An unexpected error occurred.");
      setSaveState("idle");
    }
  }

  async function handleTest() {
    if (!testPhone.trim()) {
      setError("Enter a phone number for the test message.");
      return;
    }
    setError("");
    setSuccess("");
    setTesting(true);
    try {
      const res = await fetch("/api/admin/messaging", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testPhone: testPhone.trim(), ...form }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Test failed.");
      } else {
        setSuccess(data.message || "Test message sent!");
      }
    } catch {
      setError("Connection test failed.");
    } finally {
      setTesting(false);
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
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-4">
          <button
            onClick={() => router.push("/admin")}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-600" />
            <h1 className="text-xl font-bold text-gray-900">Messaging Settings</h1>
          </div>
          <div className="ml-auto">
            {form.enabled ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                <Wifi className="h-3 w-3" /> Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                <WifiOff className="h-3 w-3" /> Disabled
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-6">
        {/* Config Card */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">
            Configure the messaging API used for sending WhatsApp notifications, reminders, and QR codes to respondents.
          </p>

          <form onSubmit={handleSave} className="mt-6 space-y-5">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}
            {success && (
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-600">{success}</div>
            )}

            {/* Enable toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.enabled}
                onClick={() => setForm({ ...form, enabled: !form.enabled })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                  form.enabled ? "bg-green-500" : "bg-gray-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    form.enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <label className="text-sm font-medium text-gray-700">
                Enable Messaging
              </label>
            </div>

            {/* Connection Settings */}
            <fieldset className="space-y-4 rounded-lg border border-gray-200 p-4">
              <legend className="px-2 text-sm font-semibold text-gray-700">Connection</legend>

              <div>
                <label className="block text-sm font-medium text-gray-700">API Base URL *</label>
                <input
                  type="text"
                  value={form.apiBaseUrl}
                  onChange={(e) => setForm({ ...form, apiBaseUrl: e.target.value })}
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="https://wabiwebhook.tzuchi.com.my"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Port</label>
                  <input
                    type="number"
                    value={form.apiPort}
                    onChange={(e) => setForm({ ...form, apiPort: parseInt(e.target.value) || 441 })}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">API Path</label>
                  <input
                    type="text"
                    value={form.apiPath}
                    onChange={(e) => setForm({ ...form, apiPath: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="/api/sendMessage"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="tlsVerify"
                  checked={form.tlsVerify}
                  onChange={(e) => setForm({ ...form, tlsVerify: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="tlsVerify" className="text-sm text-gray-700">
                  Verify TLS certificate (recommended)
                </label>
              </div>
            </fieldset>

            {/* Auth & Channel Settings */}
            <fieldset className="space-y-4 rounded-lg border border-gray-200 p-4">
              <legend className="px-2 text-sm font-semibold text-gray-700">Authentication &amp; Channel</legend>

              <div>
                <label className="block text-sm font-medium text-gray-700">API Token *</label>
                <div className="relative mt-1">
                  <input
                    type="password"
                    value={form.tokenId}
                    onChange={(e) => setForm({ ...form, tokenId: e.target.value })}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-24 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Enter API token"
                  />
                  {form.tokenId === "••••••••" && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, tokenId: "" })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                    >
                      Replace
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-400">Token is stored securely and never displayed after saving.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Provider</label>
                  <input
                    type="text"
                    value={form.provider}
                    onChange={(e) => setForm({ ...form, provider: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="TzuChiWABI"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Sender Channel</label>
                  <select
                    value={form.sender}
                    onChange={(e) => setForm({ ...form, sender: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {SENDER_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            {/* Advanced Settings */}
            <fieldset className="space-y-4 rounded-lg border border-gray-200 p-4">
              <legend className="px-2 text-sm font-semibold text-gray-700">Advanced</legend>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Request Timeout (ms)</label>
                  <input
                    type="number"
                    value={form.requestTimeout}
                    onChange={(e) => setForm({ ...form, requestTimeout: parseInt(e.target.value) || 10000 })}
                    min={1000}
                    max={60000}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Max Retries</label>
                  <input
                    type="number"
                    value={form.maxRetries}
                    onChange={(e) => setForm({ ...form, maxRetries: parseInt(e.target.value) || 3 })}
                    min={0}
                    max={10}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </fieldset>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saveState !== "idle"}
                className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-300 disabled:opacity-80 ${
                  saveState === "saved"
                    ? "bg-green-600"
                    : "bg-indigo-600 hover:bg-indigo-500"
                }`}
              >
                {saveState === "saving" ? (
                  <><Save className="h-4 w-4 animate-spin" /> Saving...</>
                ) : saveState === "saved" ? (
                  <><Check className="h-4 w-4" /> Saved</>
                ) : (
                  <><Save className="h-4 w-4" /> Save Configuration</>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Test Card */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Send className="h-4 w-4 text-green-600" />
            Send Test Message
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Verify your configuration by sending a test message to a phone number (E.164 format, e.g. +60123456789).
          </p>

          <div className="mt-4 flex gap-3">
            <input
              type="tel"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+60123456789"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:max-w-xs"
            />
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !form.enabled}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {testing ? "Sending..." : "Test"}
            </button>
          </div>
          {!form.enabled && (
            <p className="mt-2 text-xs text-amber-600">Enable messaging above and save before testing.</p>
          )}
        </div>
      </div>
    </div>
  );
}
