"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  CheckCircle, 
  ArrowLeft, 
  Star, 
  Camera, 
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check
} from "lucide-react";
import CameraCapture from "@/components/CameraCapture";
import { isGridType } from "@/lib/question-types";
import { resolveNextSection } from "@/lib/routing";
import type { RoutingConfig } from "@/lib/routing";
import {
  isOtherSelectedForRadio,
  isOtherCheckedForCheckbox,
  toggleOtherInCheckbox,
  updateOtherTextInCheckbox,
} from "@/lib/form-helpers";
import { parseTheme, themeToCssVars, BUILT_IN_FONTS, type FormTheme } from "@/lib/theme";
import { sanitizeRichText, isRichTextEmpty } from "@/lib/rich-text";
import { maskValue } from "@/lib/masking";

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
  routing?: RoutingConfig;
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

interface SectionData {
  id: string;
  title: string;
  description: string;
  order: number;
  routingConfig: string | { defaultRoute?: string };
  questions: QuestionData[];
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
  theme: FormTheme;
  sections: SectionData[];
  questions: QuestionData[];
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
  formId: string;
  form: FormData;
  answers: AnswerData[];
}

export default function AdminEditResponsePage() {
  const params = useParams();
  const router = useRouter();
  const responseId = params.id as string;

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
  const [showCamera, setShowCamera] = useState<{
    questionId: string;
    show: boolean;
  }>({ questionId: "", show: false });
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [sectionHistory, setSectionHistory] = useState<number[]>([]);
  const [customFontCss, setCustomFontCss] = useState("");
  const [regUserConfig, setRegUserConfig] = useState<{
    lookupColumn: string;
    mappings: Record<string, string>;
    lookupQuestionId: string | null;
    secondaryLookupColumn: string;
    secondaryLookupQuestionId: string | null;
  } | null>(null);
  const [regUserLookedUp, setRegUserLookedUp] = useState(false);
  const [regUserLookupLoading, setRegUserLookupLoading] = useState(false);
  const [regUserLookupResult, setRegUserLookupResult] = useState<"idle" | "found" | "not_found">("idle");
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({});
  const [completedSections, setCompletedSections] = useState<Set<number>>(new Set());

  // Compute which section indices are reachable via routing from section 0
  const reachableSectionIndices = useMemo(() => {
    if (!data?.form?.sections?.length) return new Set<number>([0]);
    const sections = data.form.sections;
    const path = new Set<number>();
    let current = 0;
    const visited = new Set<number>();
    while (current < sections.length && !visited.has(current)) {
      path.add(current);
      visited.add(current);
      const section = sections[current];
      const sectionQuestions = section.questions.map((q) => ({
        id: q.id,
        type: q.type,
        config: typeof q.config === "string" ? q.config : JSON.stringify(q.config),
      }));
      const result = resolveNextSection(
        sections.map((s) => ({
          id: s.id,
          order: s.order,
          routingConfig: typeof s.routingConfig === "string"
            ? s.routingConfig
            : JSON.stringify(s.routingConfig),
        })),
        current,
        sectionQuestions,
        { ...originalValues, ...answers }
      );
      if (result.type === "SUBMIT") break;
      current = result.sectionIndex ?? current + 1;
    }
    return path;
  }, [data?.form?.sections, answers, originalValues]);

  const fetchResponse = useCallback(async () => {
    const res = await fetch(`/api/responses/${responseId}`);
    if (res.ok) {
      const respData = await res.json();
      
      // Parse sections and questions similar to PublicFormPage
      const sections: SectionData[] = (respData.form.sections || []).map((s: any) => ({
        ...s,
        routingConfig: typeof s.routingConfig === "string" ? JSON.parse(s.routingConfig || "{}") : (s.routingConfig || {}),
        questions: (s.questions || []).map((q: any) => ({
          ...q,
          config: typeof q.config === "string" ? JSON.parse(q.config) : q.config,
        })),
      }));

      // Fallback: if no sections, create one from flat questions
      if (sections.length === 0) {
        const questions = (respData.form.questions || []).map((q: any) => ({
          ...q,
          config: typeof q.config === "string" ? JSON.parse(q.config) : q.config,
        }));
        sections.push({
          id: "default",
          title: "Section 1",
          description: "",
          order: 0,
          routingConfig: {},
          questions,
        });
      }

      const theme = parseTheme(respData.form.theme);
      respData.form.theme = theme;
      respData.form.sections = sections;
      
      setData(respData);
      setPhoneNumber(respData.phoneNumber || "");

      const initialAnswers: Record<string, string> = {};
      const initialOtherText: Record<string, string> = {};
      respData.answers.forEach((ans: AnswerData) => {
        initialAnswers[ans.questionId] = ans.value;
      });

      // Pre-populate otherText for questions where saved answer is a custom "Other" value
      const allQuestions = sections.flatMap(s => s.questions);
      for (const q of allQuestions) {
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

      // Load custom font @font-face if needed
      if (theme.fontFamily && !BUILT_IN_FONTS.has(theme.fontFamily)) {
        try {
          const fRes = await fetch("/api/admin/fonts");
          if (fRes.ok) {
            const fonts: { name: string; filename: string }[] = await fRes.json();
            const match = fonts.find((f) => f.name === theme.fontFamily);
            if (match) {
              setCustomFontCss(`@font-face { font-family: "${match.name}"; src: url("/fonts/${match.filename}") format("truetype"); font-display: swap; }`);
            }
          }
        } catch { /* ignore */ }
      }
    } else {
      setNotFound(true);
    }
    setLoading(false);
  }, [responseId]);

  useEffect(() => {
    fetchResponse();
  }, [fetchResponse]);

  useEffect(() => {
    if (submitted) {
      const timer = setTimeout(() => router.push(`/admin/forms/${data?.formId}?tab=responses`), 3000);
      return () => clearTimeout(timer);
    }
  }, [submitted, router, data]);

  // Fetch registered user mapping config
  useEffect(() => {
    if (!data?.form) return;
    const formId = data.formId;
    (async () => {
      try {
        const res = await fetch(`/api/forms/${formId}/registered-user-data/config`);
        if (!res.ok) return;
        const cfg = await res.json();
        if (!cfg || !cfg.lookupColumn) return;
        const mappings: Record<string, string> = cfg.mappings || {};
        setRegUserConfig({ 
          lookupColumn: cfg.lookupColumn, 
          mappings, 
          lookupQuestionId: cfg.lookupQuestionId || null, 
          secondaryLookupColumn: cfg.secondaryLookupColumn || "", 
          secondaryLookupQuestionId: cfg.secondaryLookupQuestionId || null 
        });
      } catch { /* ignore */ }
    })();
  }, [data]);

  async function regUserLookup(key: string, secondaryKey?: string) {
    if (!key.trim() || !regUserConfig || !data) return;
    const formId = data.formId;
    if (regUserConfig.secondaryLookupColumn && regUserConfig.secondaryLookupQuestionId) {
      if (!secondaryKey?.trim()) return;
    }
    setRegUserLookupLoading(true);
    setRegUserLookupResult("idle");
    try {
      let url = `/api/forms/${formId}/registered-user-lookup?key=${encodeURIComponent(key.trim())}`;
      if (secondaryKey?.trim()) {
        url += `&secondaryKey=${encodeURIComponent(secondaryKey.trim())}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        clearAutoFilledFields();
        setRegUserLookupResult("idle");
        setRegUserLookupLoading(false);
        return;
      }
      const lookupData = await res.json();
      if (lookupData.found && lookupData.values) {
        const clearValues: Record<string, string> = lookupData.values;
        const masked: Record<string, string> = {};
        for (const [qId, val] of Object.entries(clearValues)) {
          masked[qId] = maskValue(val);
        }
        setOriginalValues((prev) => ({ ...prev, ...clearValues }));
        setAnswers((prev) => ({ ...prev, ...masked }));
        setAutoFilledFields(new Set(Object.keys(clearValues)));
        setRegUserLookedUp(true);
        setRegUserLookupResult("found");
      } else {
        clearAutoFilledFields();
        setRegUserLookupResult("idle");
      }
    } catch {
      clearAutoFilledFields();
      setRegUserLookupResult("idle");
    } finally {
      setRegUserLookupLoading(false);
    }
  }

  // Check if all required questions in a given section are answered
  function isSectionComplete(sectionIndex: number): boolean {
    if (!data?.form) return false;
    const section = data.form.sections[sectionIndex];
    if (!section) return false;
    for (const q of section.questions) {
      const config = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
      if (config?.isPhoneNumber || config?.isTitle) continue;
      if (!q.isRequired) continue;
      const val = originalValues[q.id] ?? answers[q.id] ?? "";
      if (!val || !val.trim() || val === "[]") return false;
      if (isGridType(q.type as any)) {
        try {
          const gridAnswers = val ? JSON.parse(val) : {};
          const rows = config.grid?.rows || [];
          if (q.type === "CHECKBOX_GRID") {
            let hasAny = false;
            for (const row of rows) {
              const ra = gridAnswers[row.id];
              if (Array.isArray(ra) && ra.length > 0) { hasAny = true; break; }
            }
            if (!hasAny) return false;
          } else {
            for (const row of rows) {
              const ra = gridAnswers[row.id];
              if (!ra || (Array.isArray(ra) && ra.length === 0)) return false;
            }
          }
        } catch { return false; }
      }
    }
    return true;
  }

  // Track completed sections whenever answers change
  useEffect(() => {
    if (!data?.form) return;
    const completed = new Set<number>();
    for (let i = 0; i < data.form.sections.length; i++) {
      if (isSectionComplete(i)) completed.add(i);
    }
    setCompletedSections(completed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, originalValues, data]);

  function getMaxNavigableSection(): number {
    if (!data?.form) return 0;
    for (let i = 0; i < data.form.sections.length; i++) {
      if (!isSectionComplete(i)) return i;
    }
    return data.form.sections.length - 1;
  }

  function navigateToSection(targetIndex: number) {
    if (!data?.form) return;
    const maxNav = getMaxNavigableSection();
    if (targetIndex > maxNav) return;
    if (targetIndex === currentSectionIndex) return;
    if (targetIndex > currentSectionIndex) {
      setSectionHistory((prev) => [...prev, currentSectionIndex]);
    } else {
      const newHistory: number[] = [];
      for (let i = 0; i < targetIndex; i++) newHistory.push(i);
      setSectionHistory(newHistory);
    }
    setCurrentSectionIndex(targetIndex);
    setFieldErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearAutoFilledFields() {
    if (autoFilledFields.size > 0) {
      setAnswers((prev) => {
        const next = { ...prev };
        for (const qId of autoFilledFields) {
          next[qId] = "";
        }
        return next;
      });
      setAutoFilledFields(new Set());
      setOriginalValues({});
      setRegUserLookedUp(false);
    }
  }

  function updateAnswer(questionId: string, value: string, isUserEdit = false) {
    if (isUserEdit && autoFilledFields.has(questionId)) {
      setAutoFilledFields((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
      setOriginalValues((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
      setAnswers((prev) => ({ ...prev, [questionId]: "" }));
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
      return;
    }
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });

    // Handle auto-advance (only when routing is enabled on the question)
    if (data?.form && isUserEdit) {
      let question: QuestionData | undefined;
      for (const section of data.form.sections) {
        question = section.questions.find((q) => q.id === questionId);
        if (question) break;
      }

      if (question) {
        const config = typeof question.config === "string" ? JSON.parse(question.config) : question.config;
        if (config?.routing?.enabled && config?.autoAdvance !== false && (question.type === "MULTIPLE_CHOICE" || question.type === "DROPDOWN")) {
          const updatedAnswers = { ...answers, [questionId]: value };
          handleSectionTransition(question, updatedAnswers);
        }
      }
    }
  }

  function handleSectionTransition(question: QuestionData, updatedAnswers: Record<string, string>) {
    if (!data?.form) return;

    const sectionIndex = data.form.sections.findIndex(s => s.questions.some(q => q.id === question.id));
    if (sectionIndex === -1 || sectionIndex !== currentSectionIndex) return;

    const section = data.form.sections[sectionIndex];

    // Only auto-advance when all questions in the section are answered
    for (const q of section.questions) {
      const config = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
      if (config?.isPhoneNumber) continue;
      if (config?.isTitle) continue;
      const val = originalValues[q.id] ?? updatedAnswers[q.id] ?? "";
      if (!val || !val.trim() || val === "[]") return;
    }
    const sectionQuestions = section.questions.map((q) => ({
      id: q.id,
      type: q.type,
      config: typeof q.config === "string" ? q.config : JSON.stringify(q.config),
    }));

    const result = resolveNextSection(
      data.form.sections.map((s) => ({
        id: s.id,
        order: s.order,
        routingConfig: typeof s.routingConfig === "string" ? s.routingConfig : JSON.stringify(s.routingConfig),
      })),
      sectionIndex,
      sectionQuestions,
      updatedAnswers
    );

    if (result.type === "SUBMIT") {
      handleFinalSubmit(updatedAnswers);
    } else {
      const nextIdx = result.sectionIndex ?? sectionIndex + 1;
      if (nextIdx === sectionIndex) return;
      setSectionHistory((prev) => [...prev, currentSectionIndex]);
      setCurrentSectionIndex(nextIdx);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
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
    if (!config?.validationEnabled || !config.validation) return null;
    const validation = config.validation;
    const { type, rule, value: ruleValue, maxValue, errorMessage } = validation;
    const getError = (defaultMsg: string) => errorMessage || defaultMsg;

    if (type === "NUMBER") {
      const num = parseFloat(value);
      const compareValue = parseFloat(ruleValue || "0");
      const compareMax = parseFloat(maxValue || "0");
      if (rule === "IS_NUMBER" && isNaN(num)) return getError("Must be a number");
      if (rule === "WHOLE_NUMBER" && (!Number.isInteger(num) || isNaN(num))) return getError("Must be a whole number");
      if (rule === "GREATER_THAN" && (isNaN(num) || num <= compareValue)) return getError(`Must be greater than ${ruleValue}`);
      if (rule === "GREATER_THAN_OR_EQUAL" && (isNaN(num) || num < compareValue)) return getError(`Must be greater than or equal to ${ruleValue}`);
      if (rule === "LESS_THAN" && (isNaN(num) || num >= compareValue)) return getError(`Must be less than ${ruleValue}`);
      if (rule === "LESS_THAN_OR_EQUAL" && (isNaN(num) || num > compareValue)) return getError(`Must be less than or equal to ${ruleValue}`);
      if (rule === "EQUAL_TO" && (isNaN(num) || num !== compareValue)) return getError(`Must be equal to ${ruleValue}`);
      if (rule === "NOT_EQUAL_TO" && (isNaN(num) || num === compareValue)) return getError(`Must not be equal to ${ruleValue}`);
      if (rule === "BETWEEN" && (isNaN(num) || num < compareValue || num > compareMax)) return getError(`Must be between ${ruleValue} and ${maxValue}`);
      if (rule === "NOT_BETWEEN" && !isNaN(num) && num >= compareValue && num <= compareMax) return getError(`Must not be between ${ruleValue} and ${maxValue}`);
    }

    if (type === "TEXT") {
      if (rule === "CONTAINS" && !value.includes(ruleValue || "")) return getError(`Must contain "${ruleValue}"`);
      if (rule === "DOES_NOT_CONTAIN" && value.includes(ruleValue || "")) return getError(`Must not contain "${ruleValue}"`);
      if (rule === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return getError("Must be a valid email address");
      if (rule === "URL") {
        try { new URL(value); } catch { return getError("Must be a valid URL"); }
      }
    }

    if (type === "LENGTH") {
      const length = value.length;
      if (rule === "MAX_CHARS" && length > parseInt(ruleValue || "0")) return getError(`Must be at most ${ruleValue} characters`);
      if (rule === "MIN_CHARS" && length < parseInt(ruleValue || "0")) return getError(`Must be at least ${ruleValue} characters`);
    }

    if (type === "REGEX") {
      try {
        const regex = new RegExp(ruleValue || "");
        const matches = regex.test(value);
        if ((rule === "CONTAINS" || rule === "MATCHES") && !matches) return getError(`Must match pattern`);
        if ((rule === "DOES_NOT_CONTAIN" || rule === "DOES_NOT_MATCH") && matches) return getError(`Must not match pattern`);
      } catch { return getError("Invalid pattern"); }
    }

    if (type === "CHECKBOX" && question.type === "CHECKBOX") {
      try {
        const selected = value ? JSON.parse(value) : [];
        const count = Array.isArray(selected) ? selected.length : 0;
        const requiredCount = parseInt(ruleValue || "0");
        if (rule === "AT_LEAST" && count < requiredCount) return getError(`Select at least ${ruleValue} option(s)`);
        if (rule === "AT_MOST" && count > requiredCount) return getError(`Select at most ${ruleValue} option(s)`);
        if (rule === "EXACTLY" && count !== requiredCount) return getError(`Select exactly ${ruleValue} option(s)`);
      } catch { return getError("Invalid selection"); }
    }
    return null;
  }

  function validateCurrentSection(): boolean {
    if (!data?.form) return false;
    const section = data.form.sections[currentSectionIndex];
    if (!section) return false;
    setError("");
    setFieldErrors({});
    const errors: Record<string, string> = {};
    for (const q of section.questions) {
      const config = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
      if (config?.isPhoneNumber) continue;
      const val = originalValues[q.id] ?? answers[q.id] ?? "";
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
          } catch { errors[q.id] = `"${q.label}" is required.`; }
          continue;
        } else {
          if (!val || !val.trim() || val === "[]") {
            errors[q.id] = `"${q.label}" is required.`;
            continue;
          }
        }
      }
      if (val && val.trim() && val !== "[]" && !isGridType(q.type as any)) {
        const validationError = validateAnswer(q, val);
        if (validationError) errors[q.id] = validationError;
      }
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return false;
    }
    return true;
  }

  function handleNext() {
    if (!data?.form) return;
    if (!validateCurrentSection()) return;
    const section = data.form.sections[currentSectionIndex];
    const sectionQuestions = section.questions.map((q) => ({
      id: q.id,
      type: q.type,
      config: typeof q.config === "string" ? q.config : JSON.stringify(q.config),
    }));
    const result = resolveNextSection(
      data.form.sections.map((s) => ({
        id: s.id,
        order: s.order,
        routingConfig: typeof s.routingConfig === "string" ? s.routingConfig : JSON.stringify(s.routingConfig),
      })),
      currentSectionIndex,
      sectionQuestions,
      answers
    );
    if (result.type === "SUBMIT") {
      handleFinalSubmit();
    } else {
      const nextIdx = result.sectionIndex ?? currentSectionIndex + 1;
      setSectionHistory((prev) => [...prev, currentSectionIndex]);
      setCurrentSectionIndex(nextIdx);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleBack() {
    if (sectionHistory.length > 0) {
      const prevIdx = sectionHistory[sectionHistory.length - 1];
      setSectionHistory((prev) => prev.slice(0, -1));
      setCurrentSectionIndex(prevIdx);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data?.form) return;

    if (data.form.sections.length === 1) {
      if (!validateCurrentSection()) return;
      await submitForm();
      return;
    }

    handleNext();
  }

  async function handleFinalSubmit(latestAnswers?: Record<string, string>) {
    if (!data?.form) return;
    await submitForm(latestAnswers);
  }

  async function submitForm(latestAnswers?: Record<string, string>) {
    if (!data) return;
    setSubmitting(true);
    setError("");
    const mergedAnswers = latestAnswers ?? answers;
    try {
      const res = await fetch(`/api/responses/${responseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          answers: { ...originalValues, ...mergedAnswers },
          visitedSectionIds: [...new Set([...sectionHistory, currentSectionIndex])].map(
            (idx) => data.form.sections[idx]?.id
          ).filter(Boolean),
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

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-xl bg-white p-8 text-center shadow-sm">
          <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
          <h1 className="mt-4 text-xl font-bold text-gray-900">Response Updated!</h1>
          <p className="mt-2 text-gray-500">Redirecting to responses...</p>
        </div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">Not Found</h1>
          <p className="mt-2 text-gray-500">Response does not exist.</p>
        </div>
      </div>
    );
  }

  if (!data || !data.form) return null;

  const currentSection = data.form.sections[currentSectionIndex];
  const isMultiSection = data.form.sections.length > 1;
  const isFirstSection = currentSectionIndex === 0;

  const nonPhoneQuestions = currentSection
    ? currentSection.questions.filter((q) => {
        const config = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
        return !config?.isPhoneNumber;
      })
    : [];

  const themeVars = themeToCssVars(data.form.theme);
  const pc = data.form.theme.primaryColor;

  return (
    <div className="min-h-screen py-4 sm:py-8" style={{ ...themeVars, backgroundColor: themeVars["--theme-bg"], fontFamily: themeVars["--theme-font"] } as React.CSSProperties}>
      {customFontCss && <style dangerouslySetInnerHTML={{ __html: customFontCss }} />}
      
      <div className="mx-auto w-full max-w-2xl px-3 sm:px-4">
        {/* Navigation Bar */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => router.push("/admin")}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              Admin Edit Mode
            </span>
          </div>
        </div>

        {/* Header image banner */}
        {data.form.theme.headerImage && (
          <div className="mb-0 overflow-hidden" style={{ borderRadius: `${themeVars["--theme-radius"]} ${themeVars["--theme-radius"]} 0 0` }}>
            <img src={data.form.theme.headerImage} alt="" className="w-full" />
          </div>
        )}

        {/* Form header */}
        <div className={`mb-4 bg-white p-4 shadow-sm sm:mb-6 sm:p-6 ${data.form.theme.headerImage ? "" : "border-t-4"}`} style={{ borderTopColor: data.form.theme.headerImage ? undefined : pc, borderRadius: data.form.theme.headerImage ? `0 0 ${themeVars["--theme-radius"]} ${themeVars["--theme-radius"]}` : themeVars["--theme-radius"] }}>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-bold text-gray-900">{data.form.title}</h1>
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800 self-start sm:self-auto">
              Response: {data.shortCode}
            </span>
          </div>
          {data.form.description && !isRichTextEmpty(data.form.description) && (
            <div className="mt-2 text-gray-600 prose prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_a]:text-indigo-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: sanitizeRichText(data.form.description) }} />
          )}
          <p className="mt-3 text-sm text-red-500">* Required</p>
          {isMultiSection && (
            <>
              {(() => {
                const reachableArray = Array.from(reachableSectionIndices).sort((a, b) => a - b);
                const posInPath = reachableArray.indexOf(currentSectionIndex) + 1;
                const totalInPath = reachableArray.length;
                return (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${(posInPath / totalInPath) * 100}%`, backgroundColor: pc }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {posInPath} / {totalInPath}
                    </span>
                  </div>
                );
              })()}
              {/* Section navigation tabs */}
              <div className="mt-3 -mx-1 overflow-x-auto scrollbar-hide">
                <div className="flex gap-1 px-1 min-w-0">
                  {data.form.sections.map((section, idx) => {
                    if (!reachableSectionIndices.has(idx)) return null;
                    const isCompleted = completedSections.has(idx);
                    const isCurrent = idx === currentSectionIndex;
                    const maxNav = getMaxNavigableSection();
                    const isNavigable = idx <= maxNav;
                    const isLocked = !isNavigable && !isCurrent;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        disabled={isLocked}
                        onClick={() => navigateToSection(idx)}
                        className={`flex-shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
                          isCurrent
                            ? "text-white shadow-sm"
                            : isCompleted
                            ? "bg-green-50 text-green-700 hover:bg-green-100 ring-1 ring-green-200"
                            : isNavigable
                            ? "bg-orange-50 text-orange-700 hover:bg-orange-100 ring-1 ring-orange-200"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}
                        style={isCurrent ? { backgroundColor: pc } : undefined}
                        title={
                          isLocked
                            ? "Complete previous sections first"
                            : isCompleted
                            ? `${section.title || `Section ${idx + 1}`} (completed)`
                            : section.title || `Section ${idx + 1}`
                        }
                      >
                        <span className="flex items-center gap-1">
                          {isCompleted && !isCurrent && (
                            <CheckCircle className="h-3 w-3 flex-shrink-0" />
                          )}
                          <span className="truncate max-w-[80px] sm:max-w-[120px]">
                            {section.title || `Section ${idx + 1}`}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Section header */}
        {isMultiSection && currentSection && (currentSection.title || currentSection.description) && (
          <div className="mb-4 bg-white p-4 shadow-sm sm:p-6 border-l-4" style={{ borderLeftColor: pc, borderRadius: themeVars["--theme-radius"] }}>
            {currentSection.title && (
              <h2 className="text-lg font-semibold text-gray-900">{currentSection.title}</h2>
            )}
            {currentSection.description && !isRichTextEmpty(currentSection.description) && (
              <div className="mt-1 text-sm text-gray-600 prose prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_a]:text-indigo-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: sanitizeRichText(currentSection.description) }} />
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Phone Number field — only on first section if form collects phone */}
          {isFirstSection && data.form.collectPhone && (
            <div className={`p-4 shadow-sm sm:p-6 bg-white`} style={{ borderRadius: themeVars["--theme-radius"] }}>
              <label className="block text-base font-medium text-gray-900">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <div className="mt-3">
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
                  className={`block w-full rounded-lg border px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-1 ${
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
            </div>
          )}

          {/* Dynamic questions for current section */}
          {nonPhoneQuestions.map((question) => {
            const qConfig = typeof question.config === "string" ? JSON.parse(question.config) : question.config;
            if (qConfig?.isTitle) {
              return (
                <div key={question.id} className="bg-white p-4 shadow-sm sm:p-6" style={{ borderRadius: themeVars["--theme-radius"] }}>
                  <h3 className="text-base font-medium text-gray-900">{question.label}</h3>
                  {qConfig.titleDescription && !isRichTextEmpty(qConfig.titleDescription) && (
                    <div className="mt-1 text-sm text-gray-600 prose prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_a]:text-indigo-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: sanitizeRichText(qConfig.titleDescription) }} />
                  )}
                </div>
              );
            }
            return (
              <div key={question.id} className={`p-4 shadow-sm sm:p-6 ${autoFilledFields.has(question.id) && regUserConfig?.lookupQuestionId !== question.id ? "bg-green-50 ring-1 ring-green-200" : "bg-white"}`} style={{ borderRadius: themeVars["--theme-radius"] }}>
                <label className="block text-base font-medium text-gray-900">
                  {question.label}
                  {question.isRequired && (
                    <span className="text-red-500"> *</span>
                  )}
                  {autoFilledFields.has(question.id) && regUserConfig?.lookupQuestionId !== question.id && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      <CheckCircle className="h-3 w-3" /> Auto-filled
                    </span>
                  )}
                </label>

                <div className="mt-3">
                  {question.type === "SHORT_TEXT" && (() => {
                    const isPrimaryLookup = regUserConfig?.lookupQuestionId === question.id;
                    const isSecondaryLookup = regUserConfig?.secondaryLookupQuestionId === question.id;
                    const isLookupField = isPrimaryLookup || isSecondaryLookup;
                    const hasSecondary = !!(regUserConfig?.secondaryLookupColumn && regUserConfig?.secondaryLookupQuestionId);

                    const handleLookupBlur = (val: string) => {
                      if (!regUserConfig || !val) return;
                      if (isPrimaryLookup) {
                        const secVal = hasSecondary ? (answers[regUserConfig.secondaryLookupQuestionId!] || "") : undefined;
                        regUserLookup(val, secVal);
                      } else if (isSecondaryLookup) {
                        const priVal = answers[regUserConfig.lookupQuestionId!] || "";
                        if (priVal) regUserLookup(priVal, val);
                      }
                    };

                    const isAutoFilled = autoFilledFields.has(question.id) && !isLookupField;

                    return (
                      <div>
                        <div className="relative">
                          <input
                            type="text"
                            value={answers[question.id] || ""}
                            onChange={(e) =>
                              updateAnswer(question.id, e.target.value, true)
                            }
                            onFocus={() => {
                              if (isAutoFilled) {
                                updateAnswer(question.id, "", true);
                              }
                            }}
                            onBlur={(e) => handleLookupBlur(e.target.value)}
                            readOnly={isAutoFilled}
                            aria-label={isAutoFilled ? `${question.label} — masked auto-filled value` : question.label}
                            className={`block w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1 ${
                              isAutoFilled
                                ? "border-green-300 bg-green-50 text-green-800 cursor-pointer focus:border-green-400 focus:ring-green-300"
                                : "border-gray-300 text-gray-900 focus:border-indigo-500 focus:ring-indigo-500"
                            }`}
                            placeholder={isPrimaryLookup ? `Enter your ${regUserConfig!.lookupColumn}` : isSecondaryLookup ? `Enter your ${regUserConfig!.secondaryLookupColumn}` : "Your answer"}
                          />
                          {isLookupField && regUserLookupLoading && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                            </div>
                          )}
                          {isLookupField && !regUserLookupLoading && regUserLookupResult === "found" && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            </div>
                          )}
                        </div>
                        {isLookupField && regUserLookupResult === "not_found" && (
                          <p className="mt-1 text-xs text-red-500">Record not found</p>
                        )}
                      </div>
                    );
                  })()}

                  {question.type === "PARAGRAPH" && (
                    <textarea
                      value={answers[question.id] || ""}
                      onChange={(e) => updateAnswer(question.id, e.target.value)}
                      rows={4}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="Your answer"
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
                              onChange={() => updateAnswer(question.id, opt.value, true)}
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
                              onChange={() => updateAnswer(question.id, otherText[question.id] || "", true)}
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-gray-500">Other:</span>
                            <input
                              type="text"
                              value={isOtherSelected ? (otherText[question.id] ?? answers[question.id] ?? "") : (otherText[question.id] || "")}
                              onChange={(e) => {
                                setOtherText((prev) => ({ ...prev, [question.id]: e.target.value }));
                                if (isOtherSelected) updateAnswer(question.id, e.target.value, true);
                              }}
                              onFocus={() => {
                                if (!isOtherSelected) updateAnswer(question.id, otherText[question.id] || "", true);
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
                      onChange={(e) => updateAnswer(question.id, e.target.value, true)}
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

                  {question.type === "RATING" && (
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => updateAnswer(question.id, String(n))}
                          className="p-1 focus:outline-none"
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
                      onChange={(e) => updateAnswer(question.id, e.target.value)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  )}

                  {question.type === "TIME" && (
                    <input
                      type="time"
                      value={answers[question.id] || ""}
                      onChange={(e) => updateAnswer(question.id, e.target.value)}
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
                    <div className="space-y-2">
                      {answers[question.id] && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Check className="h-4 w-4 text-green-500" />
                          <span>File uploaded: {answers[question.id]}</span>
                          <button 
                            type="button" 
                            onClick={() => updateAnswer(question.id, "")}
                            className="text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      )}
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
                    </div>
                  )}

                  {(question.type === "MULTIPLE_CHOICE_GRID" ||
                    question.type === "CHECKBOX_GRID") && (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-sm">
                        <thead>
                          <tr>
                            <th className="border-b border-gray-200 py-3 pr-4 font-medium text-gray-500"></th>
                            {(qConfig.grid?.columns || []).map((col: any) => (
                              <th key={col.id} className="border-b border-gray-200 px-4 py-3 text-center font-medium text-gray-500">
                                {col.value}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(qConfig.grid?.rows || []).map((row: any) => (
                            <tr key={row.id}>
                              <td className="py-4 pr-4 font-medium text-gray-900">{row.value}</td>
                              {(qConfig.grid?.columns || []).map((col: any) => {
                                const isSelected = (() => {
                                  const current = answers[question.id] || "{}";
                                  try {
                                    const gridAnswers = JSON.parse(current);
                                    if (question.type === "MULTIPLE_CHOICE_GRID") {
                                      return gridAnswers[row.id] === col.id;
                                    } else {
                                      return Array.isArray(gridAnswers[row.id]) && gridAnswers[row.id].includes(col.id);
                                    }
                                  } catch { return false; }
                                })();

                                return (
                                  <td key={col.id} className="px-4 py-4 text-center">
                                    <input
                                      type={question.type === "MULTIPLE_CHOICE_GRID" ? "radio" : "checkbox"}
                                      name={`grid-${question.id}-${row.id}`}
                                      checked={isSelected}
                                      onChange={() => {
                                        const current = answers[question.id] || "{}";
                                        let gridAnswers = {};
                                        try { gridAnswers = JSON.parse(current); } catch {}

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
                                        updateAnswer(question.id, JSON.stringify(gridAnswers));
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
            );
          })}

          <div className="flex items-center justify-between pt-4">
            <div>
              {!isFirstSection && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
              style={{ backgroundColor: pc }}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  {currentSectionIndex < data.form.sections.length - 1 ? (
                    <>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </>
                  ) : (
                    "Save Admin Changes"
                  )}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Camera Capture Modal */}
      {showCamera.show && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md">
            <CameraCapture
              onCapture={async (blob: Blob) => {
                try {
                  const formData = new FormData();
                  formData.append("file", blob, "selfie.jpg");
                  const res = await fetch("/api/upload", { method: "POST", body: formData });
                  if (!res.ok) throw new Error("Upload failed");
                  const uploadData = await res.json();
                  updateAnswer(showCamera.questionId, uploadData.path);
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

    </div>
  );
}
