"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Check, Sheet, Upload, Wifi, WifiOff, Trash2 } from "lucide-react";

interface CredentialData {
  id?: string;
  enabled: boolean;
  serviceAccountEmail: string;
  serviceAccountKey: string;
}

export default function GoogleSheetsSettingsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<CredentialData>({
    enabled: false,
    serviceAccountEmail: "",
    serviceAccountKey: "",
  });
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/google-sheets");
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setForm({
              id: data.id,
              enabled: data.enabled ?? false,
              serviceAccountEmail: data.serviceAccountEmail || "",
              serviceAccountKey: data.serviceAccountKey || "",
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

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      setError("Please upload a .json file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        const parsed = JSON.parse(text);
        if (!parsed.client_email || !parsed.private_key) {
          setError("Invalid service account JSON. Must contain client_email and private_key.");
          return;
        }
        setForm((prev) => ({
          ...prev,
          serviceAccountKey: text,
          serviceAccountEmail: parsed.client_email,
        }));
        setFileName(file.name);
        setError("");
      } catch {
        setError("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
    // Reset so re-uploading the same file triggers onChange
    e.target.value = "";
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState("saving");
    try {
      const res = await fetch("/api/admin/google-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: form.enabled,
          serviceAccountKey: form.serviceAccountKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save credential.");
        setSaveState("idle");
      } else {
        setForm((prev) => ({
          ...prev,
          id: data.id,
          serviceAccountEmail: data.serviceAccountEmail || prev.serviceAccountEmail,
          serviceAccountKey: data.serviceAccountKey || prev.serviceAccountKey,
        }));
        setSuccess("Google Sheets credential saved successfully.");
        setSaveState("saved");
        saveTimerRef.current = setTimeout(() => setSaveState("idle"), 3000);
      }
    } catch {
      setError("An unexpected error occurred.");
      setSaveState("idle");
    }
  }

  async function handleTest() {
    setError("");
    setSuccess("");
    setTesting(true);
    try {
      const res = await fetch("/api/admin/google-sheets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Test failed.");
      } else {
        setSuccess(data.message || "Credential is valid!");
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

  const hasKey = form.serviceAccountKey && form.serviceAccountKey !== "";

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
            <Sheet className="h-5 w-5 text-green-600" />
            <h1 className="text-xl font-bold text-gray-900">Google Sheets Sync</h1>
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
        {/* Credential Card */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">
            Configure a Google Cloud service account to sync form submission data to Google Sheets in real-time.
            Each form can be configured individually after a global credential is set up here.
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
                Enable Google Sheets Sync
              </label>
            </div>

            {/* Service Account */}
            <fieldset className="space-y-4 rounded-lg border border-gray-200 p-4">
              <legend className="px-2 text-sm font-semibold text-gray-700">Service Account</legend>

              {/* Service Account Email (read-only) */}
              {form.serviceAccountEmail && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Service Account Email</label>
                  <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-600 break-all">
                    {form.serviceAccountEmail}
                  </div>
                </div>
              )}

              {/* JSON Key Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Service Account JSON Key *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                {hasKey && form.serviceAccountKey === "••••••••" ? (
                  <div className="mt-1 flex items-center gap-3">
                    <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500">
                      ••••••••  (key stored securely)
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, serviceAccountKey: "", serviceAccountEmail: "" }));
                        setFileName("");
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Replace
                    </button>
                  </div>
                ) : hasKey ? (
                  <div className="mt-1 flex items-center gap-3">
                    <div className="flex-1 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700">
                      {fileName || "Key loaded"} — {form.serviceAccountEmail}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, serviceAccountKey: "", serviceAccountEmail: "" }));
                        setFileName("");
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Clear
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 transition-colors hover:border-indigo-400 hover:text-indigo-600"
                  >
                    <Upload className="h-5 w-5" />
                    Upload JSON Key File
                  </button>
                )}
                <p className="mt-1.5 text-xs text-gray-400">
                  Download from Google Cloud Console → IAM → Service Accounts → Keys → Add Key → JSON.
                  The key is encrypted at rest and never displayed after saving.
                </p>
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
                  <><Save className="h-4 w-4" /> Save Credential</>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Test Card */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Sheet className="h-4 w-4 text-green-600" />
            Test Credential
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Verify the service account credential is valid and can authenticate with Google APIs.
          </p>

          <div className="mt-4">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !form.id}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50"
            >
              <Wifi className="h-4 w-4" />
              {testing ? "Testing..." : "Test Connection"}
            </button>
            {!form.id && (
              <p className="mt-2 text-xs text-amber-600">Save a credential above before testing.</p>
            )}
          </div>
        </div>

        {/* Setup Instructions */}
        <div className="rounded-xl border bg-blue-50 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-blue-900">Setup Instructions</h2>
          <ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-blue-800">
            <li>Go to <strong>Google Cloud Console</strong> → Create/select a project.</li>
            <li>Enable the <strong>Google Sheets API</strong>.</li>
            <li>Go to <strong>IAM &amp; Admin → Service Accounts</strong> → Create a service account.</li>
            <li>Create a <strong>JSON key</strong> for the service account and upload it above.</li>
            <li>For each spreadsheet you want to sync to, <strong>share the spreadsheet</strong> with the service account email address (with Editor access).</li>
            <li>Configure sync per-form from the form&apos;s admin page → Google Sheets tab.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
