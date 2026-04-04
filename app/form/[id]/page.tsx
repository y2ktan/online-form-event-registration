"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import CameraCapture from "@/components/CameraCapture";
import { 
  Star, 
  CheckCircle, 
  QrCode, 
  Copy, 
  Check, 
  Phone, 
  Camera, 
  X 
} from "lucide-react";
import { isGridType } from "@/lib/question-types";
import { QRCodeSVG } from "qrcode.react";
import { resolveNextSection } from "@/lib/routing";
import type { RoutingConfig } from "@/lib/routing";
import {
  isOtherSelectedForRadio,
  isOtherCheckedForCheckbox,
  toggleOtherInCheckbox,
  updateOtherTextInCheckbox,
} from "@/lib/form-helpers";
import { parseTheme, themeToCssVars, primaryTint, BUILT_IN_FONTS, type FormTheme } from "@/lib/theme";
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
  autoAdvance?: boolean;
  hasOtherOption?: boolean;
  showOnSuccessPage?: boolean;
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
  autoSubmit: boolean;
  sections: SectionData[];
  questions: QuestionData[];
}

export default function PublicFormPage() {
  const params = useParams();
  const formId = params.id as string;

  const [form, setForm] = useState<FormData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submissionData, setSubmissionData] = useState<{ shortCode: string; editToken: string; responseId: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showPhoneDialog, setShowPhoneDialog] = useState(false);
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

  // Routing-graph walk: which sections are reachable given current answers
  const reachableSectionIndices = useMemo(() => {
    if (!form?.sections?.length) return new Set<number>([0]);
    const sections = form.sections;
    const combinedAnswers = { ...originalValues, ...answers };
    const path = new Set<number>();
    let current = 0;
    const visited = new Set<number>();
    while (current < sections.length && !visited.has(current)) {
      path.add(current);
      visited.add(current);
      // Stop walking if this section still has unanswered required questions
      const section = sections[current];
      const incomplete = section.questions.some((q) => {
        const cfg = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
        if (cfg?.isPhoneNumber || cfg?.isTitle) return false;
        if (!q.isRequired) return false;
        const val = combinedAnswers[q.id] ?? "";
        return !val || !val.trim() || val === "[]";
      });
      if (incomplete) break;
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
        combinedAnswers
      );
      if (result.type === "SUBMIT") break;
      current = result.sectionIndex ?? current + 1;
    }
    return path;
  }, [form?.sections, answers, originalValues]);

  const reachableSorted = useMemo(
    () => Array.from(reachableSectionIndices).sort((a, b) => a - b),
    [reachableSectionIndices]
  );

  const fetchForm = useCallback(async () => {
    const res = await fetch(`/api/forms/${formId}`);
    if (res.ok) {
      const data = await res.json();
      // Parse sections from API response
      const sections: SectionData[] = (data.sections || []).map((s: any) => ({
        ...s,
        routingConfig: typeof s.routingConfig === "string" ? JSON.parse(s.routingConfig || "{}") : (s.routingConfig || {}),
        questions: (s.questions || []).map((q: any) => ({
          ...q,
          config: typeof q.config === "string" ? JSON.parse(q.config) : q.config,
        })),
      }));
      // Fallback: if no sections, create one from flat questions
      if (sections.length === 0) {
        const questions = (data.questions || []).map((q: any) => ({
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
      const theme = parseTheme(data.theme);
      setForm({ ...data, theme, sections });
      // Initialize answers from defaultValue config
      const defaults: Record<string, string> = {};
      for (const sec of sections) {
        for (const q of sec.questions) {
          const cfg = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
          if (cfg?.defaultValue !== undefined && cfg.defaultValue !== "" && cfg.defaultValue !== "[]") {
            defaults[q.id] = cfg.defaultValue as string;
          }
        }
      }
      if (Object.keys(defaults).length > 0) {
        setAnswers((prev) => ({ ...defaults, ...prev }));
      }
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
  }, [formId]);

  useEffect(() => {
    fetchForm().finally(() => setLoading(false));
  }, [fetchForm]);

  // Fetch registered user mapping config (public-safe: only lookupColumn + mappings, no rows)
  useEffect(() => {
    if (!form) return;
    (async () => {
      try {
        const res = await fetch(`/api/forms/${formId}/registered-user-data/config`);
        if (!res.ok) return;
        const cfg = await res.json();
        if (!cfg || !cfg.lookupColumn) return;
        const mappings: Record<string, string> = cfg.mappings || {};
        setRegUserConfig({ lookupColumn: cfg.lookupColumn, mappings, lookupQuestionId: cfg.lookupQuestionId || null, secondaryLookupColumn: cfg.secondaryLookupColumn || "", secondaryLookupQuestionId: cfg.secondaryLookupQuestionId || null });
      } catch { /* ignore */ }
    })();
  }, [form, formId]);

  async function regUserLookup(key: string, secondaryKey?: string) {
    if (!key.trim() || !regUserConfig) return;
    // If secondary verification is configured, both fields must be provided
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
        // Clear previously auto-filled fields silently
        clearAutoFilledFields();
        setRegUserLookupResult("idle");
        setRegUserLookupLoading(false);
        return;
      }
      const data = await res.json();
      if (data.found && data.values) {
        const clearValues: Record<string, string> = data.values;
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

  // Check if all required questions in a given section are answered
  function isSectionComplete(sectionIndex: number): boolean {
    if (!form) return false;
    const section = form.sections[sectionIndex];
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
    if (!form) return;
    const completed = new Set<number>();
    for (let i = 0; i < form.sections.length; i++) {
      if (isSectionComplete(i)) completed.add(i);
    }
    setCompletedSections(completed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, originalValues, form]);

  // Determine the highest section index the user can navigate to (routing-aware)
  function getMaxNavigableSection(): number {
    if (!form || reachableSorted.length === 0) return 0;
    for (const idx of reachableSorted) {
      if (!completedSections.has(idx)) return idx;
    }
    return reachableSorted[reachableSorted.length - 1];
  }

  function updateAnswer(questionId: string, value: string, isUserEdit = false) {
    // If user edits an auto-filled field, clear it completely so they can re-type
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
    if (form && isUserEdit) {
      let question: QuestionData | undefined;
      for (const section of form.sections) {
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
    if (!form) return;
    
    const sectionIndex = form.sections.findIndex(s => s.questions.some(q => q.id === question.id));
    if (sectionIndex === -1 || sectionIndex !== currentSectionIndex) return;

    const section = form.sections[sectionIndex];

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
      form.sections.map((s) => ({
        id: s.id,
        order: s.order,
        routingConfig: typeof s.routingConfig === "string" ? s.routingConfig : JSON.stringify(s.routingConfig),
      })),
      sectionIndex,
      sectionQuestions,
      updatedAnswers
    );

    if (result.type === "SUBMIT") {
      handleFinalSubmit();
    } else {
      const nextIdx = result.sectionIndex ?? sectionIndex + 1;
      if (nextIdx === sectionIndex) return;
      setSectionHistory((prev) => [...prev, currentSectionIndex]);
      setCurrentSectionIndex(nextIdx);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // Navigate to a specific section via section navigation
  function navigateToSection(targetIndex: number) {
    if (!form) return;
    if (!reachableSectionIndices.has(targetIndex)) return;
    const maxNav = getMaxNavigableSection();
    const targetPos = reachableSorted.indexOf(targetIndex);
    const maxNavPos = reachableSorted.indexOf(maxNav);
    if (targetPos > maxNavPos) return;
    if (targetIndex === currentSectionIndex) return;
    // Save current section index to history if going forward
    if (targetIndex > currentSectionIndex) {
      setSectionHistory((prev) => [...prev, currentSectionIndex]);
    } else {
      // Going backward: rebuild history up to targetIndex
      const newHistory = reachableSorted.filter((i) => i < targetIndex);
      setSectionHistory(newHistory);
    }
    setCurrentSectionIndex(targetIndex);
    setFieldErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  function validateCurrentSection(): boolean {
    if (!form) return false;
    
    setError("");
    setFieldErrors({});
    const errors: Record<string, string> = {};
    const section = form.sections[currentSectionIndex];
    if (!section) return true;

    for (const q of section.questions) {
      const config = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
      if (config?.isPhoneNumber) continue;
      
      const val = originalValues[q.id] ?? answers[q.id] ?? "";
      
      if (q.isRequired) {
        if (isGridType(q.type as any)) {
          try {
            const gridAnswers = val ? JSON.parse(val) : {};
            const rows = config.grid?.rows || [];
            
            if (q.type === "CHECKBOX_GRID") {
              let hasAnySelection = false;
              for (const row of rows) {
                const rowAnswer = gridAnswers[row.id];
                if (Array.isArray(rowAnswer) && rowAnswer.length > 0) {
                  hasAnySelection = true;
                  break;
                }
              }
              if (!hasAnySelection) {
                errors[q.id] = `"${q.label}" is required.`;
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
        } else {
          if (!val || !val.trim() || val === "[]") {
            errors[q.id] = `"${q.label}" is required.`;
          }
        }
      }
      
      if (val && val.trim() && val !== "[]" && !isGridType(q.type as any)) {
        const validationError = validateAnswer(q, val);
        if (validationError) {
          errors[q.id] = validationError;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return false;
    }
    return true;
  }

  function handleNext() {
    if (!form) return;
    if (!validateCurrentSection()) return;

    const section = form.sections[currentSectionIndex];
    const sectionQuestions = section.questions.map((q) => ({
      id: q.id,
      type: q.type,
      config: typeof q.config === "string" ? q.config : JSON.stringify(q.config),
    }));

    const result = resolveNextSection(
      form.sections.map((s) => ({
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

  async function handleFinalSubmit() {
    if (!form) return;
    
    // If phone is required but not yet provided, show the dialog
    if (form.collectPhone && !phoneNumber.trim()) {
      setShowPhoneDialog(true);
      return;
    }

    await submitForm();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;

    // For single-section forms, validate and submit directly
    if (form.sections.length === 1) {
      if (!validateCurrentSection()) return;
      await handleFinalSubmit();
      return;
    }

    // For multi-section, use handleNext which handles routing
    handleNext();
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
          answers: { ...answers, ...originalValues },
          visitedSectionIds: [...new Set([...sectionHistory, currentSectionIndex])].map(
            (idx) => form.sections[idx]?.id
          ).filter(Boolean),
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

    // Collect questions marked as showOnSuccessPage
    const successFields: { label: string; value: string }[] = [];
    if (form) {
      for (const section of form.sections) {
        for (const q of section.questions) {
          const cfg = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
          if (!cfg?.showOnSuccessPage) continue;
          const raw = originalValues[q.id] ?? answers[q.id] ?? "";
          if (!raw) continue;
          let display = raw;
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) display = parsed.join(", ");
          } catch { /* plain string */ }
          successFields.push({ label: q.label, value: display });
        }
      }
    }

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

          <div className="mb-6 rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="bg-indigo-50 px-6 py-4 text-center">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-indigo-400">
                Submission ID
              </p>
              <p className="text-3xl font-mono font-bold text-indigo-600 tracking-widest">
                {submissionData.shortCode}
              </p>
            </div>
            {(phoneNumber || successFields.length > 0) && (
              <div className="divide-y divide-gray-100 px-6">
                {phoneNumber && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Phone</span>
                    <span className="text-sm font-medium text-gray-900">{phoneNumber}</span>
                  </div>
                )}
                {successFields.map((field, idx) => (
                  <div key={idx} className="flex items-center justify-between py-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{field.label}</span>
                    <span className="text-sm font-medium text-gray-900 text-right max-w-[60%] break-words">{field.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-8 flex flex-col items-center justify-center space-y-3">
            <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-100">
              <QRCodeSVG value={editUrl} size={160} />
            </div>
            <p className="text-xs text-gray-400">
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

  const currentSection = form.sections[currentSectionIndex];
  const isMultiSection = form.sections.length > 1;
  const isFirstSection = currentSectionIndex === 0;

  const pc = form.theme.primaryColor;
  const themeVars = themeToCssVars(form.theme);

  return (
    <div className="min-h-screen py-4 sm:py-8" style={{ ...themeVars, backgroundColor: themeVars["--theme-bg"], fontFamily: themeVars["--theme-font"] } as React.CSSProperties}>
      {customFontCss && <style dangerouslySetInnerHTML={{ __html: customFontCss }} />}
      <div className="mx-auto w-full max-w-2xl px-3 sm:px-4">
        {/* Header image banner */}
        {form.theme.headerImage && (
          <div className="mb-0 overflow-hidden" style={{ borderRadius: `${themeVars["--theme-radius"]} ${themeVars["--theme-radius"]} 0 0` }}>
            <img src={form.theme.headerImage} alt="" className="w-full" />
          </div>
        )}
        {/* Form header */}
        <div className={`mb-4 bg-white p-4 shadow-sm sm:mb-6 sm:p-6 ${form.theme.headerImage ? "" : "border-t-4"}`} style={{ borderTopColor: form.theme.headerImage ? undefined : pc, borderRadius: form.theme.headerImage ? `0 0 ${themeVars["--theme-radius"]} ${themeVars["--theme-radius"]}` : themeVars["--theme-radius"] }}>
          <h1 className="text-2xl font-bold text-gray-900">{form.title}</h1>
          {form.description && !isRichTextEmpty(form.description) && (
            <div className="mt-2 text-gray-600 prose prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_a]:text-indigo-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: sanitizeRichText(form.description) }} />
          )}
          <p className="mt-3 text-sm text-red-500">* Required</p>
          {isMultiSection && (
            <>
              {/* Section navigation tabs */}
              <div className="mt-3 -mx-1 overflow-x-auto scrollbar-hide">
                <div className="flex gap-1 px-1 min-w-0">
                  {form.sections.map((section, idx) => {
                    if (!reachableSectionIndices.has(idx)) return null;
                    const isCompleted = completedSections.has(idx);
                    const isCurrent = idx === currentSectionIndex;
                    const maxNav = getMaxNavigableSection();
                    const targetPos = reachableSorted.indexOf(idx);
                    const maxNavPos = reachableSorted.indexOf(maxNav);
                    const isNavigable = targetPos <= maxNavPos;
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {currentSection && (
              <div key={currentSection.id} id={currentSection.id} className="space-y-4">
                {/* Section header (only show if multi-section and section has a title/desc) */}
                {isMultiSection && (currentSection.title || currentSection.description) && (
                  <div className="mb-4 bg-white p-4 shadow-sm sm:p-6 border-l-4" style={{ borderLeftColor: pc, borderRadius: themeVars["--theme-radius"] }}>
                    {currentSection.title && (
                      <h2 className="text-lg font-semibold text-gray-900">{currentSection.title}</h2>
                    )}
                    {currentSection.description && !isRichTextEmpty(currentSection.description) && (
                      <div className="mt-1 text-sm text-gray-600 prose prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_a]:text-indigo-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: sanitizeRichText(currentSection.description) }} />
                    )}
                  </div>
                )}

                {/* Questions for this section */}
                {currentSection.questions.filter((q: QuestionData) => {
                  const qConfig = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
                  return !qConfig?.isPhoneNumber;
                }).map((question) => {
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
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                                  </div>
                                )}
                              </div>
                              {isPrimaryLookup && (
                                <div className="mt-1.5">
                                  {regUserLookupResult === "found" && (
                                    <p className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="h-3.5 w-3.5" /> Profile found — fields auto-filled.</p>
                                  )}
                                  {regUserLookupResult === "idle" && !regUserLookupLoading && (
                                    <p className="text-xs text-gray-400">
                                      Enter your {regUserConfig!.lookupColumn}{hasSecondary ? ` and ${regUserConfig!.secondaryLookupColumn}` : ""} and click outside to look up your profile.
                                    </p>
                                  )}
                                </div>
                              )}
                              {isSecondaryLookup && (
                                <div className="mt-1.5">
                                  {regUserLookupResult === "idle" && !regUserLookupLoading && (
                                    <p className="text-xs text-gray-400">Used for profile verification.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {question.type === "PARAGRAPH" && (
                          <textarea
                            value={answers[question.id] || ""}
                            onChange={(e) =>
                              updateAnswer(question.id, e.target.value, true)
                            }
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
                                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-gray-50 cursor-pointer"
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
                                      const val = e.target.value;
                                      setOtherText((prev) => ({ ...prev, [question.id]: val }));
                                      if (isOtherSelected) updateAnswer(question.id, val, true);
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
                                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-gray-50 cursor-pointer"
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
                          <div>
                            <select
                              value={answers[question.id] || ""}
                              onChange={(e) => {
                                updateAnswer(question.id, e.target.value, true);
                                if (regUserConfig?.lookupQuestionId === question.id && e.target.value) {
                                  regUserLookup(e.target.value);
                                }
                              }}
                              className={`block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${answers[question.id] ? "text-gray-900" : "text-gray-400"}`}
                            >
                              <option value="" disabled className="text-gray-400">{regUserConfig?.lookupQuestionId === question.id ? `Select your ${regUserConfig.lookupColumn}` : "Choose"}</option>
                              {question.options.map((opt) => (
                                <option key={opt.id} value={opt.value}>
                                  {opt.value}
                                </option>
                              ))}
                            </select>
                            {regUserConfig?.lookupQuestionId === question.id && (
                              <div className="mt-1.5">
                                {regUserLookupLoading && (
                                  <p className="flex items-center gap-1 text-xs text-indigo-600"><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" /> Looking up profile…</p>
                                )}
                                {regUserLookupResult === "found" && (
                                  <p className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="h-3.5 w-3.5" /> Profile found — fields auto-filled.</p>
                                )}
                              </div>
                            )}
                          </div>
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
                                    updateAnswer(question.id, String(n), true)
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
                                  updateAnswer(question.id, String(n), true)
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
                              updateAnswer(question.id, e.target.value, true)
                            }
                            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        )}

                        {question.type === "TIME" && (
                          <input
                            type="time"
                            value={answers[question.id] || ""}
                            onChange={(e) =>
                              updateAnswer(question.id, e.target.value, true)
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
                                  onClick={() => updateAnswer(question.id, "", true)}
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
                                updateAnswer(question.id, file.name, true);
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
                                              const current = answers[question.id] || "{}";
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
                                              updateAnswer(question.id, JSON.stringify(gridAnswers), true);
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
              </div>
          )}

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              {isMultiSection && !isFirstSection && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
              )}
              {isMultiSection ? (
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                  style={{ backgroundColor: pc }}
                >
                  {submitting ? "Submitting..." : "Next"}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                  style={{ backgroundColor: pc }}
                >
                  {submitting ? "Submitting..." : "Submit"}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setAnswers({});
                setPhoneNumber("");
                setFieldErrors({});
                setCurrentSectionIndex(0);
                setSectionHistory([]);
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
                className="rounded-lg px-6 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                style={{ backgroundColor: pc }}
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
