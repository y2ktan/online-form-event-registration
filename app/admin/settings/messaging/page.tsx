"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Save, Check, MessageSquare, Send, Wifi, WifiOff } from "lucide-react";

interface MessagingData {
  enabled: boolean;
  waApiEnabled: boolean;
  waApiBaseUrl: string;
  waApiPort: number;
  waApiBearerToken: string;
}

const defaultConfig: MessagingData = {
  enabled: false,
  waApiEnabled: false,
  waApiBaseUrl: "",
  waApiPort: 3000,
  waApiBearerToken: "",
};

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
              waApiEnabled: data.waApiEnabled ?? false,
              waApiBaseUrl: data.waApiBaseUrl || "",
              waApiPort: data.waApiPort || 3000,
              waApiBearerToken: data.waApiBearerToken || "",
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

  function toggleEnabled() {
    const next = !form.enabled;
    // waApiEnabled always mirrors the main toggle — TC_WA is the only protocol
    setForm({ ...form, enabled: next, waApiEnabled: next });
  }

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
        if (data.waApiBearerToken) {
          setForm((prev) => ({ ...prev, waApiBearerToken: data.waApiBearerToken }));
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
        body: JSON.stringify({ testPhone: testPhone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Test failed.");
      } else {
        setSuccess(data.message || "Test confirmation sent!");
      }
    } catch {
      setError("Connection test failed.");
    } finally {
      setTesting(false);
    }
  }

  const isReady = form.enabled && !!form.waApiBearerToken;

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
            {isReady ? (
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
            Send WhatsApp confirmations to respondents via the TC_WA REST API.
          </p>

          <form onSubmit={handleSave} className="mt-6 space-y-5">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}
            {success && (
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-600">{success}</div>
            )}

            {/* Single master toggle */}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Enable WhatsApp Messaging</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {form.enabled ? "Confirmations will be sent on form submit." : "No messages will be sent."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.enabled}
                onClick={toggleEnabled}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                  form.enabled ? "bg-green-500" : "bg-gray-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    form.enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* TC_WA fields — only visible when enabled */}
            {form.enabled && (
              <fieldset className="space-y-4 rounded-lg border border-green-200 bg-green-50/30 p-4">
                <legend className="px-2 text-sm font-semibold text-green-800">WhatsApp REST API (TC_WA)</legend>

                {/* Warning if no bearer token yet */}
                {!form.waApiBearerToken && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      A bearer token is required before messaging can be used. Paste your token below and save.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700">API Base URL</label>
                  <input
                    type="text"
                    value={form.waApiBaseUrl}
                    onChange={(e) => setForm({ ...form, waApiBaseUrl: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    placeholder="wabiwebhook.tzuchi.com.my"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Port</label>
                  <input
                    type="number"
                    value={form.waApiPort}
                    onChange={(e) => setForm({ ...form, waApiPort: parseInt(e.target.value) || 3000 })}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 sm:max-w-[200px]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Bearer Token</label>
                  <div className="relative mt-1">
                    <input
                      type="password"
                      value={form.waApiBearerToken}
                      onChange={(e) => setForm({ ...form, waApiBearerToken: e.target.value })}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-24 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                      placeholder="Paste your JWT bearer token"
                    />
                    {form.waApiBearerToken === "••••••••" && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, waApiBearerToken: "" })}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                      >
                        Replace
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">Token is encrypted at rest and never displayed after saving.</p>
                </div>
              </fieldset>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saveState !== "idle"}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-80"
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

        {/* Test Card — only shown when fully configured */}
        {isReady && (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <Send className="h-4 w-4 text-green-600" />
              Send Test Confirmation
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Verify your configuration by sending a test WhatsApp confirmation (e.g. 601165232155).
            </p>

            <div className="mt-4 flex gap-3">
              <input
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="601165232155"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 sm:max-w-xs"
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {testing ? "Sending..." : "Test"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
