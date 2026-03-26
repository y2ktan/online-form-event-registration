"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import CameraCapture from "@/components/CameraCapture";
import { 
  Star, 
  CheckCircle, 
  QrCode, 
  Copy, 
  Check, 
  AlertCircle, 
  Phone, 
  Camera, 
  X 
} from "lucide-react";
import { isGridType } from "@/lib/question-types";
import { QRCodeSVG } from "qrcode.react";

interface OptionData {
  id: string;
  value: string;
  order: number;
}

interface GridItem {
  id: string;
  value: string;
}

interface ValidationConfig {
  type?: string;
  rule?: string;
  value?: string;
  maxValue?: string;
  errorMessage?: string;
}

interface QuestionConfig {
  isPhoneNumber?: boolean;
  validationEnabled?: boolean;
  validation?: ValidationConfig;
  grid?: {
    rows: GridItem[];
    columns: GridItem[];
  };
  [key: string]: unknown;
}

interface QuestionData {
  id: string;
  type: string;
  label: string;
  isRequired: boolean;
  order: number;
  options: OptionData[];
  config: QuestionConfig | string;
}

interface FormData {
  id: string;
  title: string;
  description: string;
  published: boolean;
  collectPhone: boolean;
  phoneDescription: string;
  phoneTitle: string;
  phonePlaceholder: string;
  questions: QuestionData[];
}

export default function PublicFormPage() {
  const params = useParams();
  const formId = params.id as string;

  const [form, setForm] = useState<FormData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submissionData, setSubmissionData] = useState<{ shortCode: string; editToken: string; responseId: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showPhoneDialog, setShowPhoneDialog] = useState(false);

  const fetchForm = useCallback(async () => {
    const res = await fetch(`/api/forms/${formId}`);
    if (res.ok) {
      setForm(await res.json());
    } else {
      setNotFound(true);
    }
  }, [formId]);

  useEffect(() => {
    fetchForm().finally(() => setLoading(false));
  }, [fetchForm]);

  function updateAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }

  function toggleCheckbox(questionId: string, optionValue: string) {
    setAnswers((prev) => {
      const current = prev[questionId] || "";
      let values: string[];
      try {
        values = current ? JSON.parse(current) : [];
      } catch {
        values = [];
      }
      if (values.includes(optionValue)) {
        values = values.filter((v) => v !== optionValue);
      } else {
        values.push(optionValue);
      }
      return { ...prev, [questionId]: JSON.stringify(values) };
    });
  }

  function isCheckboxChecked(questionId: string, optionValue: string): boolean {
    const current = answers[questionId] || "";
    try {
      const values = current ? JSON.parse(current) : [];
      return values.includes(optionValue);
    } catch {
      return false;
    }
  }

  function validateAnswer(question: QuestionData, value: string): string | null {
    const config = typeof question.config === "string" ? JSON.parse(question.config) : question.config;
    
    if (!config?.validationEnabled || !config.validation) {
      return null;
    }

    const validation = config.validation;
    const { type, rule, value: ruleValue, maxValue, errorMessage } = validation;

    // Helper to get custom error or default
    const getError = (defaultMsg: string) => errorMessage || defaultMsg;

    // NUMBER validation
    if (type === "NUMBER") {
      const num = parseFloat(value);
      const compareValue = parseFloat(ruleValue || "0");
      const compareMax = parseFloat(maxValue || "0");

      if (rule === "IS_NUMBER" && isNaN(num)) {
        return getError("Must be a number");
      }
      if (rule === "WHOLE_NUMBER" && (!Number.isInteger(num) || isNaN(num))) {
        return getError("Must be a whole number");
      }
      if (rule === "GREATER_THAN" && (isNaN(num) || num <= compareValue)) {
        return getError(`Must be greater than ${ruleValue}`);
      }
      if (rule === "GREATER_THAN_OR_EQUAL" && (isNaN(num) || num < compareValue)) {
        return getError(`Must be greater than or equal to ${ruleValue}`);
      }
      if (rule === "LESS_THAN" && (isNaN(num) || num >= compareValue)) {
        return getError(`Must be less than ${ruleValue}`);
      }
      if (rule === "LESS_THAN_OR_EQUAL" && (isNaN(num) || num > compareValue)) {
        return getError(`Must be less than or equal to ${ruleValue}`);
      }
      if (rule === "EQUAL_TO" && (isNaN(num) || num !== compareValue)) {
        return getError(`Must be equal to ${ruleValue}`);
      }
      if (rule === "NOT_EQUAL_TO" && (isNaN(num) || num === compareValue)) {
        return getError(`Must not be equal to ${ruleValue}`);
      }
      if (rule === "BETWEEN" && (isNaN(num) || num < compareValue || num > compareMax)) {
        return getError(`Must be between ${ruleValue} and ${maxValue}`);
      }
      if (rule === "NOT_BETWEEN" && !isNaN(num) && num >= compareValue && num <= compareMax) {
        return getError(`Must not be between ${ruleValue} and ${maxValue}`);
      }
    }

    // TEXT validation
    if (type === "TEXT") {
      if (rule === "CONTAINS" && !value.includes(ruleValue || "")) {
        return getError(`Must contain "${ruleValue}"`);
      }
      if (rule === "DOES_NOT_CONTAIN" && value.includes(ruleValue || "")) {
        return getError(`Must not contain "${ruleValue}"`);
      }
      if (rule === "EMAIL") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          return getError("Must be a valid email address");
        }
      }
      if (rule === "URL") {
        try {
          new URL(value);
        } catch {
          return getError("Must be a valid URL");
        }
      }
    }

    // LENGTH validation
    if (type === "LENGTH") {
      const length = value.length;
      const maxChars = parseInt(ruleValue || "0");
      const minChars = parseInt(ruleValue || "0");

      if (rule === "MAX_CHARS" && length > maxChars) {
        return getError(`Must be at most ${ruleValue} characters`);
      }
      if (rule === "MIN_CHARS" && length < minChars) {
        return getError(`Must be at least ${ruleValue} characters`);
      }
    }

    // REGEX validation
    if (type === "REGEX") {
      try {
        const regex = new RegExp(ruleValue || "");
        const matches = regex.test(value);

        if (rule === "CONTAINS" && !matches) {
          return getError(`Must match pattern`);
        }
        if (rule === "DOES_NOT_CONTAIN" && matches) {
          return getError(`Must not match pattern`);
        }
        if (rule === "MATCHES" && !matches) {
          return getError(`Must match pattern`);
        }
        if (rule === "DOES_NOT_MATCH" && matches) {
          return getError(`Must not match pattern`);
        }
      } catch {
        return getError("Invalid pattern");
      }
    }

    // CHECKBOX validation
    if (type === "CHECKBOX" && question.type === "CHECKBOX") {
      try {
        const selected = value ? JSON.parse(value) : [];
        const count = Array.isArray(selected) ? selected.length : 0;
        const requiredCount = parseInt(ruleValue || "0");

        if (rule === "AT_LEAST" && count < requiredCount) {
          return getError(`Select at least ${ruleValue} option(s)`);
        }
        if (rule === "AT_MOST" && count > requiredCount) {
          return getError(`Select at most ${ruleValue} option(s)`);
        }
        if (rule === "EXACTLY" && count !== requiredCount) {
          return getError(`Select exactly ${ruleValue} option(s)`);
        }
      } catch {
        return getError("Invalid selection");
      }
    }

    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;

    setError("");
    setFieldErrors({});

    // Client-side validation (skip phone number question — handled via modal dialog)
    const errors: Record<string, string> = {};
    for (const q of form.questions) {
      const config = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
      if (config?.isPhoneNumber) continue;
      
      const val = answers[q.id] || "";
      
      // Check required field
      if (q.isRequired) {
        if (isGridType(q.type as any)) {
          try {
            const gridAnswers = val ? JSON.parse(val) : {};
            const rows = config.grid?.rows || [];
            if (rows.length === 0) {
              if (!val || val === "{}" || val === "[]") {
                errors[q.id] = `"${q.label}" is required.`;
                continue;
              }
            } else {
              for (const row of rows) {
                const rowAnswer = gridAnswers[row.id];
                if (!rowAnswer || (Array.isArray(rowAnswer) && rowAnswer.length === 0)) {
                  errors[q.id] = `"${q.label}": Each row requires a response.`;
                  break;
                }
              }
            }
          } catch {
            errors[q.id] = `"${q.label}" is required.`;
          }
          continue;
        } else {
          if (!val || !val.trim() || val === "[]") {
            errors[q.id] = `"${q.label}" is required.`;
            continue;
          }
        }
      }
      
      // Check validation rules (only if answer is provided and not a grid)
      if (val && val.trim() && val !== "[]" && !isGridType(q.type as any)) {
        const validationError = validateAnswer(q, val);
        if (validationError) {
          errors[q.id] = validationError;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    // If phone is required but not yet provided, show the dialog
    if (form.collectPhone && !phoneNumber.trim()) {
      setShowPhoneDialog(true);
      return;
    }

    // Otherwise submit directly
    await submitForm();
  }

  async function submitForm() {
    if (!form) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId: form.id,
          phoneNumber: form.collectPhone ? phoneNumber : undefined,
          answers: answers,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Submission failed.");
        setShowPhoneDialog(false);
        return;
      }

      setSubmissionData({
        shortCode: data.shortCode,
        editToken: data.editToken,
        responseId: data.responseId,
      });
      setShowPhoneDialog(false);
      setSubmitted(true);
    } catch {
      setError("An unexpected error occurred.");
      setShowPhoneDialog(false);
    } finally {
      setSubmitting(false);
    }
  }

  const [showCamera, setShowCamera] = useState<{
    questionId: string;
    show: boolean;
  }>({ questionId: "", show: false });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading form...</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">Form Not Found</h1>
          <p className="mt-2 text-gray-500">
            This form does not exist or is not published.
          </p>
        </div>
      </div>
    );
  }

  if (submitted && submissionData) {
    const editUrl = `${window.location.origin}/edit/${submissionData.responseId}?token=${submissionData.editToken}`;

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="mb-2 text-3xl font-bold text-gray-900">Submitted!</h1>
          <p className="mb-8 text-gray-600">
            Thank you for your response. Your submission has been recorded.
          </p>

          <div className="mb-8 rounded-xl bg-gray-50 p-6">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Submission ID
            </p>
            <p className="text-3xl font-mono font-bold text-indigo-600 tracking-widest">
              {submissionData.shortCode}
            </p>
          </div>

          <div className="mb-8 flex flex-col items-center justify-center space-y-4">
            <div className="rounded-xl border-4 border-white bg-white p-2 shadow-md">
              <QRCodeSVG value={editUrl} size={180} />
            </div>
            <p className="text-sm text-gray-500">
              Scan to edit your submission later
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                navigator.clipboard.writeText(editUrl);
                alert("Edit link copied to clipboard!");
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              <Copy className="h-4 w-4" />
              Copy Edit Link
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Submit another response
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!form) return null;

  const nonPhoneQuestions = form.questions.filter((q) => {
    const config = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
    return !config?.isPhoneNumber;
  });

  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-8">
      <div className="mx-auto w-full max-w-2xl px-3 sm:px-4">
        {/* Form header */}
        <div className="mb-4 rounded-lg border-t-4 border-t-indigo-600 bg-white p-4 shadow-sm sm:mb-6 sm:rounded-xl sm:p-6">
          <h1 className="text-2xl font-bold text-gray-900">{form.title}</h1>
          {form.description && (
            <p className="mt-2 text-gray-600">{form.description}</p>
          )}
          <p className="mt-3 text-sm text-red-500">* Required</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Dynamic questions */}
          {nonPhoneQuestions.map((question) => (
            <div key={question.id} className="rounded-lg bg-white p-4 shadow-sm sm:rounded-xl sm:p-6">
              <label className="block text-base font-medium text-gray-900">
                {question.label}
                {question.isRequired && (
                  <span className="text-red-500"> *</span>
                )}
              </label>

              <div className="mt-3">
                {question.type === "SHORT_TEXT" && (
                  <input
                    type="text"
                    value={answers[question.id] || ""}
                    onChange={(e) =>
                      updateAnswer(question.id, e.target.value)
                    }
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Your answer"
                  />
                )}

                {question.type === "PARAGRAPH" && (
                  <textarea
                    value={answers[question.id] || ""}
                    onChange={(e) =>
                      updateAnswer(question.id, e.target.value)
                    }
                    rows={4}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Your answer"
                  />
                )}

                {question.type === "MULTIPLE_CHOICE" && (
                  <div className="space-y-2">
                    {question.options.map((opt) => (
                      <label
                        key={opt.id}
                        className="flex items-center gap-3 rounded-lg p-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name={`q-${question.id}`}
                          value={opt.value}
                          checked={answers[question.id] === opt.value}
                          onChange={() =>
                            updateAnswer(question.id, opt.value)
                          }
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700">
                          {opt.value}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {question.type === "CHECKBOX" && (
                  <div className="space-y-2">
                    {question.options.map((opt) => (
                      <label
                        key={opt.id}
                        className="flex items-center gap-3 rounded-lg p-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isCheckboxChecked(
                            question.id,
                            opt.value
                          )}
                          onChange={() =>
                            toggleCheckbox(question.id, opt.value)
                          }
                          className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700">
                          {opt.value}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {question.type === "DROPDOWN" && (
                  <select
                    value={answers[question.id] || ""}
                    onChange={(e) =>
                      updateAnswer(question.id, e.target.value)
                    }
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Choose</option>
                    {question.options.map((opt) => (
                      <option key={opt.id} value={opt.value}>
                        {opt.value}
                      </option>
                    ))}
                  </select>
                )}

                {question.type === "LINEAR_SCALE" && (
                  <div className="flex items-center gap-3">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label
                        key={n}
                        className="flex flex-col items-center gap-1 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name={`q-${question.id}`}
                          value={String(n)}
                          checked={answers[question.id] === String(n)}
                          onChange={() =>
                            updateAnswer(question.id, String(n))
                          }
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-xs text-gray-500">{n}</span>
                      </label>
                    ))}
                  </div>
                )}

                {question.type === "RATING" && (
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() =>
                          updateAnswer(question.id, String(n))
                        }
                        className="p-1"
                      >
                        <Star
                          className={`h-6 w-6 ${
                            Number(answers[question.id] || 0) >= n
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-gray-300"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                )}

                {question.type === "DATE" && (
                  <input
                    type="date"
                    value={answers[question.id] || ""}
                    onChange={(e) =>
                      updateAnswer(question.id, e.target.value)
                    }
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                )}

                {question.type === "TIME" && (
                  <input
                    type="time"
                    value={answers[question.id] || ""}
                    onChange={(e) =>
                      updateAnswer(question.id, e.target.value)
                    }
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                )}

                {question.type === "SELFIE" && (
                  <div className="space-y-4">
                    {answers[question.id] ? (
                      <div className="relative inline-block">
                        <img
                          src={answers[question.id]}
                          alt="Captured selfie"
                          className="h-48 w-auto rounded-lg border object-cover shadow-sm"
                        />
                        <button
                          type="button"
                          onClick={() => updateAnswer(question.id, "")}
                          className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white shadow-md hover:bg-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setShowCamera({ questionId: question.id, show: true })
                        }
                        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-indigo-200 bg-indigo-50/50 py-8 text-indigo-600 transition-colors hover:bg-indigo-50"
                      >
                        <Camera className="h-6 w-6" />
                        <span className="font-medium">Take a Selfie</span>
                      </button>
                    )}
                  </div>
                )}

                {question.type === "FILE_UPLOAD" && (
                  <input
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        updateAnswer(question.id, file.name);
                      }
                    }}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-600 hover:file:bg-indigo-100"
                  />
                )}

                {(question.type === "MULTIPLE_CHOICE_GRID" ||
                  question.type === "CHECKBOX_GRID") && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr>
                          <th className="border-b border-gray-200 py-3 pr-4 font-medium text-gray-500"></th>
                          {(typeof question.config === "string" ? JSON.parse(question.config) : question.config).grid?.columns?.map((col: { id: string, value: string }) => (
                            <th key={col.id} className="border-b border-gray-200 px-4 py-3 text-center font-medium text-gray-500">
                              {col.value}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(typeof question.config === "string" ? JSON.parse(question.config) : question.config).grid?.rows?.map((row: { id: string, value: string }) => (
                          <tr key={row.id}>
                            <td className="py-4 pr-4 font-medium text-gray-900">{row.value}</td>
                            {(typeof question.config === "string" ? JSON.parse(question.config) : question.config).grid?.columns?.map((col: { id: string, value: string }) => {
                              const isSelected = (() => {
                                const current = answers[question.id] || "{}";
                                try {
                                  const gridAnswers = JSON.parse(current);
                                  if (question.type === "MULTIPLE_CHOICE_GRID") {
                                    return gridAnswers[row.id] === col.id;
                                  } else {
                                    return Array.isArray(gridAnswers[row.id]) && gridAnswers[row.id].includes(col.id);
                                  }
                                } catch {
                                  return false;
                                }
                              })();

                              return (
                                <td key={col.id} className="px-4 py-4 text-center">
                                  <input
                                    type={question.type === "MULTIPLE_CHOICE_GRID" ? "radio" : "checkbox"}
                                    name={`grid-${question.id}-${row.id}`}
                                    checked={isSelected}
                                    onChange={() => {
                                      setAnswers((prev) => {
                                        const current = prev[question.id] || "{}";
                                        let gridAnswers = {};
                                        try {
                                          gridAnswers = JSON.parse(current);
                                        } catch {}

                                        if (question.type === "MULTIPLE_CHOICE_GRID") {
                                          gridAnswers = { ...gridAnswers, [row.id]: col.id };
                                        } else {
                                          const rowAnswers = Array.isArray((gridAnswers as any)[row.id]) ? [...(gridAnswers as any)[row.id]] : [];
                                          if (rowAnswers.includes(col.id)) {
                                            (gridAnswers as any)[row.id] = rowAnswers.filter((id: string) => id !== col.id);
                                          } else {
                                            (gridAnswers as any)[row.id] = [...rowAnswers, col.id];
                                          }
                                        }
                                        return { ...prev, [question.id]: JSON.stringify(gridAnswers) };
                                      });
                                    }}
                                    className={`h-4 w-4 text-indigo-600 focus:ring-indigo-500 ${question.type === "CHECKBOX_GRID" ? "rounded" : ""}`}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {fieldErrors[question.id] && (
                <p className="mt-2 text-sm text-red-600">
                  {fieldErrors[question.id]}
                </p>
              )}
            </div>
          ))}

          <div className="flex justify-between">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAnswers({});
                setPhoneNumber("");
                setFieldErrors({});
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear form
            </button>
          </div>
        </form>
      </div>

      {/* Camera Capture Modal */}
      {showCamera.show && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md">
            <CameraCapture
              onCapture={async (blob) => {
                try {
                  const formData = new FormData();
                  formData.append("file", blob, "selfie.jpg");

                  const res = await fetch("/api/upload", {
                    method: "POST",
                    body: formData,
                  });

                  if (!res.ok) throw new Error("Upload failed");

                  const data = await res.json();
                  updateAnswer(showCamera.questionId, data.path);
                  setShowCamera({ questionId: "", show: false });
                } catch (err) {
                  console.error("Selfie upload error:", err);
                  alert("Failed to upload selfie. Please try again.");
                }
              }}
              onCancel={() => setShowCamera({ questionId: "", show: false })}
            />
          </div>
        </div>
      )}

      {/* Phone Number Modal Dialog */}
      {showPhoneDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-2">{form.phoneTitle || "Phone Number"} Required</h3>
              <p className="text-sm text-gray-600 mb-6">
                {form.phoneDescription || "We need to keep your phone number for future reference."}
              </p>
              
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">{form.phoneTitle || "Phone Number"}</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => {
                    setPhoneNumber(e.target.value);
                    if (fieldErrors["phoneNumber"]) {
                      setFieldErrors(prev => {
                        const next = {...prev};
                        delete next["phoneNumber"];
                        return next;
                      });
                    }
                  }}
                  className={`block w-full rounded-lg border px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 ${
                    fieldErrors["phoneNumber"]
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                  }`}
                  placeholder={form.phonePlaceholder || "Enter your phone number"}
                  autoFocus
                />
                {fieldErrors["phoneNumber"] && (
                  <p className="text-sm text-red-600 mt-1">{fieldErrors["phoneNumber"]}</p>
                )}
              </div>
            </div>
            <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 rounded-b-xl border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowPhoneDialog(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!phoneNumber.trim()) {
                    setFieldErrors(prev => ({...prev, phoneNumber: "Phone number is required"}));
                    return;
                  }
                  submitForm();
                }}
                disabled={submitting}
                className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Form"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
