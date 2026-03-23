"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { CheckCircle, Star } from "lucide-react";

interface OptionData {
  id: string;
  value: string;
  order: number;
}

interface QuestionData {
  id: string;
  type: string;
  label: string;
  isRequired: boolean;
  order: number;
  options: OptionData[];
  config: string;
}

interface FormData {
  id: string;
  title: string;
  description: string;
  published: boolean;
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
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;

    setError("");
    setFieldErrors({});

    // Client-side validation
    const errors: Record<string, string> = {};
    if (!phoneNumber.trim()) {
      errors["phoneNumber"] = "Phone number is required.";
    }
    for (const q of form.questions) {
      const config = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
      if (config?.isPhoneNumber) continue; // Phone number handled separately
      if (q.isRequired) {
        const val = answers[q.id];
        if (!val || !val.trim() || val === "[]") {
          errors[q.id] = `"${q.label}" is required.`;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    // Build answers including phone number mapped to its question
    const phoneQuestion = form.questions.find((q) => {
      const config = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
      return config?.isPhoneNumber;
    });

    const allAnswers = { ...answers };
    if (phoneQuestion) {
      allAnswers[phoneQuestion.id] = phoneNumber;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId: form.id,
          phoneNumber,
          answers: allAnswers,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Submission failed.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  }

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

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-xl bg-white p-8 text-center shadow-sm">
          <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
          <h1 className="mt-4 text-xl font-bold text-gray-900">
            Response Submitted!
          </h1>
          <p className="mt-2 text-gray-500">
            Thank you for submitting your response.
          </p>
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

          {/* Phone Number field (always first, always required) */}
          <div className="rounded-lg bg-white p-4 shadow-sm sm:rounded-xl sm:p-6">
            <label className="block text-base font-medium text-gray-900">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => {
                setPhoneNumber(e.target.value);
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next["phoneNumber"];
                  return next;
                });
              }}
              className={`mt-2 block w-full rounded-lg border px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-1 ${
                fieldErrors["phoneNumber"]
                  ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                  : "border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
              }`}
              placeholder="Enter your phone number"
            />
            {fieldErrors["phoneNumber"] && (
              <p className="mt-1 text-sm text-red-600">
                {fieldErrors["phoneNumber"]}
              </p>
            )}
          </div>

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
                  <div className="text-sm text-gray-500">
                    Grid input (simplified view)
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
    </div>
  );
}
