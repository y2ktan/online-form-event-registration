"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload, Trash2, Type, Loader2 } from "lucide-react";

interface FontEntry {
  id: string;
  name: string;
  filename: string;
  createdAt: string;
}

export default function FontSettingsPage() {
  const router = useRouter();
  const [fonts, setFonts] = useState<FontEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [fontName, setFontName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetchFonts();
  }, []);

  async function fetchFonts() {
    try {
      const res = await fetch("/api/admin/fonts");
      if (res.ok) setFonts(await res.json());
    } catch {
      setError("Failed to load fonts");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    const form = e.currentTarget;
    const fileInput = form.querySelector<HTMLInputElement>('input[type="file"]');
    const file = fileInput?.files?.[0];

    if (!file) { setError("Please select a .ttf file"); return; }
    if (!fontName.trim()) { setError("Please enter a font name"); return; }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", fontName.trim());
      const res = await fetch("/api/admin/fonts", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Upload failed"); return; }
      setFonts((prev) => [...prev, data]);
      setFontName("");
      if (fileInput) fileInput.value = "";
      setSuccess(`Font "${data.name}" uploaded successfully`);
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete font "${name}"? Forms using it will fall back to the default font.`)) return;
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/fonts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || "Delete failed"); return; }
      setFonts((prev) => prev.filter((f) => f.id !== id));
      setSuccess(`Font "${name}" deleted`);
    } catch {
      setError("Delete failed");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <button
          onClick={() => router.push("/admin")}
          className="mb-6 flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </button>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Type className="h-5 w-5 text-indigo-600" />
            <h1 className="text-lg font-semibold text-gray-900">Font Configuration</h1>
          </div>

          {/* Upload form */}
          <form onSubmit={handleUpload} className="mb-6 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h2 className="text-sm font-medium text-gray-700">Upload Custom Font</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={fontName}
                onChange={(e) => setFontName(e.target.value)}
                placeholder="Font display name"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
                <Upload className="h-4 w-4" />
                <span>Choose .ttf file</span>
                <input type="file" accept=".ttf" className="hidden" />
              </label>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">Max 2 MB, .ttf format only</p>
              <button
                type="submit"
                disabled={uploading}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload"}
              </button>
            </div>
          </form>

          {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {success && <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</div>}

          {/* Font list */}
          <h2 className="text-sm font-medium text-gray-700 mb-3">Uploaded Fonts</h2>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : fonts.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No custom fonts uploaded yet</p>
          ) : (
            <div className="space-y-2">
              {fonts.map((font) => (
                <div key={font.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{font.name}</p>
                    <p className="text-xs text-gray-400">{new Date(font.createdAt).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(font.id, font.name)}
                    className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    title="Delete font"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
