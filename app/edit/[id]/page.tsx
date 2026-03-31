"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle, Star } from "lucide-react";
import { isGridType } from "@/lib/question-types";
import {
  isOtherSelectedForRadio,
  isOtherCheckedForCheckbox,
  toggleOtherInCheckbox,
  updateOtherTextInCheckbox,
} from "@/lib/form-helpers";

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
  hasOtherOption?: boolean;
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

interface AnswerData {
  id: string;
  questionId: string;
  value: string;
}

interface ResponseData {
  id: string;
  shortCode: string;
  phoneNumber: string;
  form: {
    id: string;
    title: string;
    description: string;
    questions: QuestionData[];
  };
  answers: AnswerData[];
}

function EditResponseForm() {
  const params = useParams();
  const searchParams = useSearchParams();
  const responseId = params.id as string;
  const editToken = searchParams.get("token");

  const [data, setData] = useState<ResponseData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchResponse = useCallback(async () => {
    if (!editToken) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const res = await fetch(`/api/responses/${responseId}?token=${editToken}`);
    if (res.ok) {
      const respData = await res.json();
      setData(respData);
      setPhoneNumber(respData.phoneNumber || "");

      const initialAnswers: Record<string, string> = {};
      const initialOtherText: Record<string, string> = {};
      respData.answers.forEach((ans: AnswerData) => {
        initialAnswers[ans.questionId] = ans.value;
      });
      // Pre-populate otherText for questions where saved answer is a custom "Other" value
      for (const q of respData.form.questions) {
        const config = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
        if (!config?.hasOtherOption) continue;
        const savedValue = initialAnswers[q.id];
        if (!savedValue) continue;
        const optionValues = new Set(q.options.map((o: OptionData) => o.value));
        if (q.type === "MULTIPLE_CHOICE" && !optionValues.has(savedValue)) {
          initialOtherText[q.id] = savedValue;
        } else if (q.type === "CHECKBOX") {
          try {
            const vals: string[] = JSON.parse(savedValue);
            const otherVal = vals.find((v) => !optionValues.has(v));
            if (otherVal !== undefined) initialOtherText[q.id] = otherVal;
          } catch { /* ignore */ }
        }
      }
      setAnswers(initialAnswers);
      setOtherText(initialOtherText);
    } else {
      setNotFound(true);
    }
    setLoading(false);
  }, [responseId, editToken]);

  useEffect(() => {
    fetchResponse();
  }, [fetchResponse]);

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
    if (!data) return;

    setError("");
    setFieldErrors({});

    // Client-side validation
    const errors: Record<string, string> = {};
    if (!phoneNumber.trim()) {
      errors["phoneNumber"] = "Phone number is required.";
    }
    for (const q of data.form.questions) {
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
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    // Build answers including phone number
    const phoneQuestion = data.form.questions.find((q) => {
      const config = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
      return config?.isPhoneNumber;
    });

    const allAnswers = { ...answers };
    if (phoneQuestion) {
      allAnswers[phoneQuestion.id] = phoneNumber;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/responses/${responseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editToken,
          phoneNumber,
          answers: allAnswers,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        setError(resData.error || "Update failed.");
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
        <div className="text-gray-500">Loading response...</div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">Not Found</h1>
          <p className="mt-2 text-gray-500">
            This response does not exist or you don&apos;t have permission to edit it.
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
            Response Updated!
          </h1>
          <p className="mt-2 text-gray-500">
            Your changes have been saved successfully.
          </p>
        </div>
      </div>
    );
  }

  const nonPhoneQuestions = data.form.questions.filter((q) => {
    const config = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
    return !config?.isPhoneNumber;
  });

  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-8">
      <div className="mx-auto w-full max-w-2xl px-3 sm:px-4">
        {/* Form header */}
        <div className="mb-4 overflow-hidden rounded-lg border-t-4 border-t-indigo-600 bg-white shadow-sm sm:mb-6 sm:rounded-xl">
          <div className="bg-gray-50 border-b border-gray-100 px-4 py-2 sm:px-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Submission ID
              </span>
              <span className="font-mono font-bold text-indigo-600">
                {data.shortCode}
              </span>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-2xl font-bold text-gray-900">
                {data.form.title}
              </h1>
              <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">
                Editing Response
              </span>
            </div>
            {data.form.description && (
              <p className="mt-2 text-gray-600">{data.form.description}</p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Phone Number field */}
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
                    onChange={(e) => updateAnswer(question.id, e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                )}

                {question.type === "PARAGRAPH" && (
                  <textarea
                    value={answers[question.id] || ""}
                    onChange={(e) => updateAnswer(question.id, e.target.value)}
                    rows={4}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                )}

                {question.type === "MULTIPLE_CHOICE" && (() => {
                  const config = typeof question.config === "string" ? JSON.parse(question.config) : question.config;
                  const optionValues = new Set(question.options.map((o) => o.value));
                  const isOtherSelected = config?.hasOtherOption && isOtherSelectedForRadio(answers[question.id], optionValues);
                  return (
                  <div className="space-y-2">
                    {question.options.map((opt) => (
                      <label
                        key={opt.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-gray-50"
                      >
                        <input
                          type="radio"
                          name={`q-${question.id}`}
                          value={opt.value}
                          checked={answers[question.id] === opt.value}
                          onChange={() => updateAnswer(question.id, opt.value)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700">
                          {opt.value}
                        </span>
                      </label>
                    ))}
                    {config?.hasOtherOption && (
                      <div className="flex items-center gap-3 rounded-lg p-2 hover:bg-gray-50">
                        <input
                          type="radio"
                          name={`q-${question.id}`}
                          checked={isOtherSelected}
                          onChange={() => updateAnswer(question.id, otherText[question.id] || "")}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-500">Other:</span>
                        <input
                          type="text"
                          value={isOtherSelected ? (otherText[question.id] ?? answers[question.id] ?? "") : (otherText[question.id] || "")}
                          onChange={(e) => {
                            setOtherText((prev) => ({ ...prev, [question.id]: e.target.value }));
                            if (isOtherSelected) updateAnswer(question.id, e.target.value);
                          }}
                          onFocus={() => {
                            if (!isOtherSelected) updateAnswer(question.id, otherText[question.id] || "");
                          }}
                          className="flex-1 border-b border-gray-300 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none"
                          placeholder="Type your answer"
                        />
                      </div>
                    )}
                  </div>
                  );
                })()}

                {question.type === "CHECKBOX" && (() => {
                  const config = typeof question.config === "string" ? JSON.parse(question.config) : question.config;
                  const optionValues = new Set(question.options.map((o) => o.value));
                  const isOtherChecked = config?.hasOtherOption && isOtherCheckedForCheckbox(answers[question.id] || "[]", optionValues);
                  return (
                  <div className="space-y-2">
                    {question.options.map((opt) => (
                      <label
                        key={opt.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={isCheckboxChecked(question.id, opt.value)}
                          onChange={() => toggleCheckbox(question.id, opt.value)}
                          className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700">
                          {opt.value}
                        </span>
                      </label>
                    ))}
                    {config?.hasOtherOption && (
                      <div className="flex items-center gap-3 rounded-lg p-2 hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={isOtherChecked}
                          onChange={() => {
                            setAnswers((prev) => ({
                              ...prev,
                              [question.id]: toggleOtherInCheckbox(prev[question.id] || "[]", optionValues, otherText[question.id] || "", isOtherChecked),
                            }));
                          }}
                          className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-500">Other:</span>
                        <input
                          type="text"
                          value={otherText[question.id] || ""}
                          onChange={(e) => {
                            const newVal = e.target.value;
                            setOtherText((prev) => ({ ...prev, [question.id]: newVal }));
                            if (isOtherChecked) {
                              setAnswers((prev) => ({
                                ...prev,
                                [question.id]: updateOtherTextInCheckbox(prev[question.id] || "[]", optionValues, newVal),
                              }));
                            }
                          }}
                          onFocus={() => {
                            if (!isOtherChecked) {
                              setAnswers((prev) => ({
                                ...prev,
                                [question.id]: toggleOtherInCheckbox(prev[question.id] || "[]", optionValues, otherText[question.id] || "", false),
                              }));
                            }
                          }}
                          className="flex-1 border-b border-gray-300 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none"
                          placeholder="Type your answer"
                        />
                      </div>
                    )}
                  </div>
                  );
                })()}

                {question.type === "DROPDOWN" && (
                  <select
                    value={answers[question.id] || ""}
                    onChange={(e) => updateAnswer(question.id, e.target.value)}
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
                        className="flex cursor-pointer flex-col items-center gap-1"
                      >
                        <input
                          type="radio"
                          name={`q-${question.id}`}
                          value={String(n)}
                          checked={answers[question.id] === String(n)}
                          onChange={() => updateAnswer(question.id, String(n))}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-xs text-gray-500">{n}</span>
                      </label>
                    ))}
                  </div>
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

          <div className="flex justify-start">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EditResponsePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="text-gray-500">Loading...</div>
        </div>
      }
    >
      <EditResponseForm />
    </Suspense>
  );
}
