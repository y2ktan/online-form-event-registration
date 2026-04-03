"use client";

import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import {
  Plus,
  Trash2,
  GripVertical,
  ArrowLeft,
  Eye,
  X,
  Type,
  List,
  ChevronDown,
  ChevronUp,
  Star,
  Calendar,
  Clock,
  Upload,
  ToggleLeft,
  Import,
  Heading,
  Image,
  SeparatorHorizontal,
  CheckCircle,
  CloudOff,
  Loader2,
  ClipboardCopy,
  Link2,
  Pencil,
  Users,
  ExternalLink,
  MoreVertical,
  Check,
  Search,
  Hash,
  Camera,
  Undo2,
  Redo2,
  Palette,
  Download,
} from "lucide-react";
import {
  DndContext,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  DragOverlay,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPE_CATEGORIES,
  requiresOptions,
  isGridType,
  type QuestionType,
} from "@/lib/question-types";
import { type RoutingConfig, type OptionMatchRouting } from "@/lib/routing";
import {
  findSectionForQuestion,
  moveQuestionBetweenSections,
  reorderQuestionWithinSection,
  updateRoutingOnOptionRename,
  removeRoutingForOption,
  removeSectionWithQuestions,
  FormHistory,
} from "@/lib/form-helpers";
import { type FormTheme, DEFAULT_THEME, parseTheme, serializeTheme, COLOR_PRESETS, BG_PRESETS, HEADER_IMAGE_MAX_BYTES, ALLOWED_IMAGE_TYPES, BUILT_IN_FONTS } from "@/lib/theme";
import GoogleFormEditor from "@/components/GoogleFormEditor";
import SearchableSelect from "@/components/SearchableSelect";
import { sanitizeRichText, isRichTextEmpty } from "@/lib/rich-text";

interface OptionData {
  id: string;
  value: string;
  order: number;
  group: string;
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
  type: QuestionType;
  label: string;
  isRequired: boolean;
  order: number;
  options: OptionData[];
  config: QuestionConfig;
}

interface SectionRoutingConfig {
  defaultRoute?: string; // "NEXT" | "SUBMIT" | sectionId
}

interface SectionData {
  id: string;
  title: string;
  description: string;
  order: number;
  routingConfig: SectionRoutingConfig;
  questions: QuestionData[];
}

interface FormData {
  id: string;
  title: string;
  description: string;
  published: boolean;
  shortCode: string | null;
  collectPhone: boolean;
  phoneDescription: string;
  phoneTitle: string;
  phonePlaceholder: string;
  theme: FormTheme;
  notifyEmails: string;
  sections: SectionData[];
  questions: QuestionData[];
}

interface ResponseEntry {
  id: string;
  shortCode: string;
  phoneNumber: string | null;
  createdAt: string;
  updatedAt: string;
  editToken: string;
  form: { title: string; id: string };
  answers: {
    id: string;
    value: string;
    question: {
      label: string;
      type: string;
      config: string | QuestionConfig;
    };
  }[];
}

let tempIdCounter = 0;
function tempId() {
  return `temp-${++tempIdCounter}`;
}

function SectionContainer({ id, children, className, onClick, onFocus }: { id: string; children: React.ReactNode; className?: string; onClick?: () => void; onFocus?: () => void }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className} onClick={onClick} onFocusCapture={onFocus}>
      {children}
    </div>
  );
}

function SortableQuestion({
  question,
  sectionIndex,
  qIndex,
  visualIndex,
  sections,
  updateQuestion,
  removeQuestion,
  duplicateQuestion,
  addOption,
  updateOption,
  removeOption,
  regUserHeaders,
  regUserMapping,
  regUserFirstRow,
  onMappingChange,
  isLookupQuestion,
}: {
  question: QuestionData;
  sectionIndex: number;
  qIndex: number;
  visualIndex: number;
  sections: SectionData[];
  updateQuestion: (sectionIndex: number, qIndex: number, updates: Partial<QuestionData>) => void;
  removeQuestion: (sectionIndex: number, qIndex: number) => void;
  duplicateQuestion: (sectionIndex: number, qIndex: number) => void;
  addOption: (sectionIndex: number, qIndex: number, insertAtIndex?: number) => void;
  updateOption: (sectionIndex: number, qIndex: number, oIndex: number, value: string) => void;
  removeOption: (sectionIndex: number, qIndex: number, oIndex: number) => void;
  regUserHeaders?: string[];
  regUserMapping?: string;
  regUserFirstRow?: Record<string, string> | null;
  onMappingChange?: (questionId: string, columnName: string) => void;
  isLookupQuestion?: boolean;
}) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [focusedOptionIndex, setFocusedOptionIndex] = useState<number | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const [focusedColIndex, setFocusedColIndex] = useState<number | null>(null);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: question.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: "relative" as const,
  };

  const isTitle = Boolean(question.config && typeof question.config === "object" && (question.config as any).isTitle);

  // Google Forms-style Title & Description card
  if (isTitle) {
    return (
      <div
        id={`question-${question.id}`}
        ref={setNodeRef}
        style={style}
        className={`rounded-lg border bg-white p-3 shadow-sm sm:rounded-xl sm:p-5 ${
          isDragging ? "shadow-lg ring-2 ring-indigo-500 ring-opacity-50" : ""
        }`}
      >
        <div className="flex items-start gap-2">
          <button
            {...attributes}
            {...listeners}
            className="mt-1 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 touch-none cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <input
              type="text"
              value={question.label}
              onChange={(e) => updateQuestion(sectionIndex, qIndex, { label: e.target.value })}
              className="w-full border-b-2 border-transparent text-base font-medium text-gray-900 focus:border-[#2e7d32] focus:outline-none"
              placeholder="Untitled Title"
            />
            <div className="mt-2">
              <GoogleFormEditor
                value={(question.config as any).titleDescription || ""}
                onChange={(html) => updateQuestion(sectionIndex, qIndex, { config: { ...(question.config as any), titleDescription: html } })}
                placeholder="Description (optional)"
              />
            </div>
          </div>
          <button
            onClick={() => removeQuestion(sectionIndex, qIndex)}
            className="mt-1 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      id={`question-${question.id}`}
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-white p-3 shadow-sm sm:rounded-xl sm:p-5 ${
        isDragging ? "shadow-lg ring-2 ring-indigo-500 ring-opacity-50" : ""
      }`}
    >
      <div className="mb-4 flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex items-center sm:items-start gap-2 w-full sm:w-auto">
          <div className="mt-0 sm:mt-2 flex flex-col gap-1">
            <button
              {...attributes}
              {...listeners}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 touch-none cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 sm:hidden">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-500">
                Q{visualIndex + 1}
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 w-full">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={question.label}
              onChange={(e) =>
                updateQuestion(sectionIndex, qIndex, { label: e.target.value })
              }
              className="flex-1 border-b border-transparent text-base font-medium text-gray-900 focus:border-indigo-500 focus:outline-none"
              placeholder="Question"
            />
            {question.config?.showOnSuccessPage && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200" title="Shown on success page">
                <Eye className="h-3 w-3" /> Success
              </span>
            )}
          </div>

          {/* Type selector */}
          <div className="mt-3 flex items-center gap-3 w-full sm:w-auto">
            <select
              value={question.type}
              onChange={(e) =>
                updateQuestion(sectionIndex, qIndex, {
                  type: e.target.value as QuestionType,
                  options: requiresOptions(
                    e.target.value as QuestionType
                  )
                    ? question.options.length > 0
                      ? question.options
                      : [
                          {
                            id: tempId(),
                            value: "Option 1",
                            order: 0,
                            group: "default",
                          },
                        ]
                    : [],
                })
              }
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
            >
              {Object.entries(QUESTION_TYPE_CATEGORIES).map(
                ([category, types]) => (
                  <optgroup key={category} label={category}>
                    {types.map((t) => (
                      <option key={t} value={t}>
                        {QUESTION_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </optgroup>
                )
              )}
            </select>
          </div>

          {/* Question preview / input area */}
          <div className="mt-3">
            {question.type === "SHORT_TEXT" && (
              <div className="rounded border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-400">
                Short answer text
              </div>
            )}

            {question.type === "PARAGRAPH" && (
              <div className="rounded border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-400">
                Long answer text
              </div>
            )}

            {requiresOptions(question.type) && (
              <div className="space-y-2">
                {question.options.map((opt, oIndex) => {
                  const hasDefault = question.config?.defaultValue !== undefined;
                  const isDefaultSelected = hasDefault && (
                    question.type === "CHECKBOX"
                      ? (() => { try { return (JSON.parse(question.config.defaultValue as string) as string[]).includes(opt.value); } catch { return false; } })()
                      : question.config.defaultValue === opt.value
                  );
                  const toggleDefault = () => {
                    if (!hasDefault) return;
                    const newConfig = { ...question.config };
                    if (question.type === "CHECKBOX") {
                      let vals: string[] = [];
                      try { vals = JSON.parse(newConfig.defaultValue as string); } catch { /* */ }
                      if (vals.includes(opt.value)) {
                        vals = vals.filter((v) => v !== opt.value);
                      } else {
                        vals.push(opt.value);
                      }
                      newConfig.defaultValue = JSON.stringify(vals);
                    } else {
                      newConfig.defaultValue = isDefaultSelected ? "" : opt.value;
                    }
                    updateQuestion(sectionIndex, qIndex, { config: newConfig });
                  };
                  return (
                  <div
                    key={opt.id}
                    className="space-y-1"
                    onFocusCapture={() => { if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current); setFocusedOptionIndex(oIndex); }}
                    onBlurCapture={() => { focusTimeoutRef.current = setTimeout(() => setFocusedOptionIndex(null), 150); }}
                  >
                    <div
                      className={`flex items-center gap-2 rounded-lg px-1 -mx-1 ${question.type === "DROPDOWN" && hasDefault && isDefaultSelected ? "bg-indigo-50 ring-1 ring-indigo-200" : ""}`}
                      onClick={question.type === "DROPDOWN" && hasDefault ? toggleDefault : undefined}
                      style={question.type === "DROPDOWN" && hasDefault ? { cursor: "pointer" } : undefined}
                      title={question.type === "DROPDOWN" && hasDefault ? (isDefaultSelected ? "Remove as default" : "Set as default") : undefined}
                    >
                      {question.type === "MULTIPLE_CHOICE" && (
                        <button
                          type="button"
                          onClick={toggleDefault}
                          className={`h-4 w-4 shrink-0 rounded-full border-2 ${hasDefault ? "cursor-pointer" : "cursor-default"} ${isDefaultSelected ? "border-indigo-500 bg-indigo-500" : "border-gray-300"}`}
                          title={hasDefault ? (isDefaultSelected ? "Remove as default" : "Set as default") : ""}
                        >
                          {isDefaultSelected && <div className="mx-auto mt-[3px] h-1.5 w-1.5 rounded-full bg-white" />}
                        </button>
                      )}
                      {question.type === "CHECKBOX" && (
                        <button
                          type="button"
                          onClick={toggleDefault}
                          className={`h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center ${hasDefault ? "cursor-pointer" : "cursor-default"} ${isDefaultSelected ? "border-indigo-500 bg-indigo-500" : "border-gray-300"}`}
                          title={hasDefault ? (isDefaultSelected ? "Remove as default" : "Set as default") : ""}
                        >
                          {isDefaultSelected && <Check className="h-3 w-3 text-white" />}
                        </button>
                      )}
                      {question.type === "DROPDOWN" && (
                        <span className={`text-sm shrink-0 ${isDefaultSelected ? "font-bold text-indigo-600" : "text-gray-400"}`}>
                          {oIndex + 1}.
                        </span>
                      )}
                      <input
                        type="text"
                        value={opt.value}
                        onChange={(e) =>
                          updateOption(sectionIndex, qIndex, oIndex, e.target.value)
                        }
                        className="min-w-0 flex-1 border-b border-transparent text-sm text-gray-700 focus:border-indigo-500 focus:outline-none bg-transparent"
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); removeOption(sectionIndex, qIndex, oIndex); }}
                        className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {question.config?.routing?.enabled && (
                      <div className="pl-6">
                        <select
                          value={(question.config.routing as OptionMatchRouting).rules[opt.value] || "NEXT"}
                          onChange={(e) => {
                            const newConfig = { ...question.config };
                            const routing = { ...(newConfig.routing as OptionMatchRouting) };
                            routing.rules = { ...routing.rules };
                            if (e.target.value === "NEXT") {
                              delete routing.rules[opt.value];
                            } else {
                              routing.rules[opt.value] = e.target.value;
                            }
                            newConfig.routing = routing;
                            updateQuestion(sectionIndex, qIndex, { config: newConfig });
                          }}
                          className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="NEXT">Continue to next section</option>
                          <option value="SUBMIT">Submit form</option>
                          {sections
                            .filter((_, i) => i !== sectionIndex)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                Go to section: {s.title || `Section ${s.order + 1}`}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                    {focusedOptionIndex === oIndex && (
                      <div className="flex justify-center -my-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); addOption(sectionIndex, qIndex, oIndex + 1); }}
                          className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-0.5 py-1 px-2 rounded hover:bg-indigo-50 transition-colors"
                          title="Insert option below"
                        >
                          <Plus className="h-3 w-3" /> Insert
                        </button>
                      </div>
                    )}
                  </div>
                  );
                })}
                {/* "Other" option row (non-editable label, removable) */}
                {question.config?.hasOtherOption && (question.type === "MULTIPLE_CHOICE" || question.type === "CHECKBOX") && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {question.type === "MULTIPLE_CHOICE" && (
                        <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                      )}
                      {question.type === "CHECKBOX" && (
                        <div className="h-4 w-4 rounded border-2 border-gray-300" />
                      )}
                      <span className="text-sm text-gray-500 italic">Other...</span>
                      <div className="flex-1 border-b border-dashed border-gray-300" />
                      <button
                        onClick={() => {
                          const newConfig = { ...question.config, hasOtherOption: false };
                          if (newConfig.routing?.enabled && (newConfig.routing as OptionMatchRouting).rules?.["__OTHER__"]) {
                            const routing = { ...(newConfig.routing as OptionMatchRouting) };
                            routing.rules = { ...routing.rules };
                            delete routing.rules["__OTHER__"];
                            newConfig.routing = routing;
                          }
                          updateQuestion(sectionIndex, qIndex, { config: newConfig });
                        }}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {question.config?.routing?.enabled && (
                      <div className="pl-6">
                        <select
                          value={(question.config.routing as OptionMatchRouting).rules["__OTHER__"] || "NEXT"}
                          onChange={(e) => {
                            const newConfig = { ...question.config };
                            const routing = { ...(newConfig.routing as OptionMatchRouting) };
                            routing.rules = { ...routing.rules };
                            if (e.target.value === "NEXT") {
                              delete routing.rules["__OTHER__"];
                            } else {
                              routing.rules["__OTHER__"] = e.target.value;
                            }
                            newConfig.routing = routing;
                            updateQuestion(sectionIndex, qIndex, { config: newConfig });
                          }}
                          className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="NEXT">Continue to next section</option>
                          <option value="SUBMIT">Submit form</option>
                          {sections
                            .filter((_, i) => i !== sectionIndex)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                Go to section: {s.title || `Section ${s.order + 1}`}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => addOption(sectionIndex, qIndex)}
                    className="text-sm text-indigo-600 hover:text-indigo-500"
                  >
                    + Add option
                  </button>
                  {!question.config?.hasOtherOption && (question.type === "MULTIPLE_CHOICE" || question.type === "CHECKBOX") && (
                    <>
                      <span className="text-sm text-gray-400">or</span>
                      <button
                        onClick={() => updateQuestion(sectionIndex, qIndex, { config: { ...question.config, hasOtherOption: true } })}
                        className="text-sm text-indigo-600 hover:text-indigo-500"
                      >
                        add &quot;Other&quot;
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {question.type === "LINEAR_SCALE" && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                1 ─── 2 ─── 3 ─── 4 ─── 5
              </div>
            )}

            {question.type === "RATING" && (
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className="h-5 w-5 text-gray-300"
                  />
                ))}
              </div>
            )}

            {question.type === "DATE" && (
              <div className="rounded border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-400">
                Month / Day / Year
              </div>
            )}

            {isGridType(question.type) && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Rows Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Rows</h4>
                    </div>
                    <div className="space-y-2">
                      {(question.config.grid?.rows || [
                        { id: crypto.randomUUID(), value: "Row 1" }
                      ]).map((row, rIndex) => (
                        <div
                          key={row.id}
                          className="space-y-1"
                          onFocusCapture={() => { if (rowFocusTimeoutRef.current) clearTimeout(rowFocusTimeoutRef.current); setFocusedRowIndex(rIndex); }}
                          onBlurCapture={() => { rowFocusTimeoutRef.current = setTimeout(() => setFocusedRowIndex(null), 150); }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 w-4">{rIndex + 1}.</span>
                            <input
                              type="text"
                              value={row.value}
                              onChange={(e) => {
                                const newGrid = { 
                                  rows: [...(question.config.grid?.rows || [{ id: crypto.randomUUID(), value: "Row 1" }])],
                                  columns: [...(question.config.grid?.columns || [{ id: crypto.randomUUID(), value: "Column 1" }])]
                                };
                                newGrid.rows[rIndex] = { ...row, value: e.target.value };
                                updateQuestion(sectionIndex, qIndex, { config: { ...question.config, grid: newGrid } });
                              }}
                              className="flex-1 border-b border-transparent text-sm text-gray-700 focus:border-indigo-500 focus:outline-none"
                              placeholder={`Row ${rIndex + 1}`}
                            />
                            <button
                              onClick={() => {
                                const rows = question.config.grid?.rows || [];
                                if (rows.length <= 1) return;
                                const newGrid = { 
                                  rows: rows.filter((_, i) => i !== rIndex),
                                  columns: question.config.grid?.columns || []
                                };
                                updateQuestion(sectionIndex, qIndex, { config: { ...question.config, grid: newGrid } });
                              }}
                              disabled={(question.config.grid?.rows?.length || 0) <= 1}
                              className={`rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-0`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {focusedRowIndex === rIndex && (
                            <div className="flex justify-center -my-0.5">
                              <button
                                onClick={() => {
                                  const currentGrid = question.config.grid || { rows: [], columns: [] };
                                  const rows = [...(currentGrid.rows.length ? currentGrid.rows : [{ id: crypto.randomUUID(), value: "Row 1" }])];
                                  rows.splice(rIndex + 1, 0, { id: crypto.randomUUID(), value: `Row ${rows.length + 1}` });
                                  const newGrid = { rows, columns: currentGrid.columns.length ? currentGrid.columns : [{ id: crypto.randomUUID(), value: "Column 1" }] };
                                  updateQuestion(sectionIndex, qIndex, { config: { ...question.config, grid: newGrid } });
                                }}
                                className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-0.5 py-1 px-2 rounded hover:bg-indigo-50 transition-colors"
                                title="Insert row below"
                              >
                                <Plus className="h-3 w-3" /> Insert
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const currentGrid = question.config.grid || { rows: [], columns: [] };
                          const newGrid = {
                            rows: [...(currentGrid.rows.length ? currentGrid.rows : [{ id: crypto.randomUUID(), value: "Row 1" }]), { id: crypto.randomUUID(), value: `Row ${(currentGrid.rows.length || 1) + 1}` }],
                            columns: currentGrid.columns.length ? currentGrid.columns : [{ id: crypto.randomUUID(), value: "Column 1" }]
                          };
                          updateQuestion(sectionIndex, qIndex, { config: { ...question.config, grid: newGrid } });
                        }}
                        className="text-sm text-indigo-600 hover:text-indigo-500 flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> Add row
                      </button>
                    </div>
                  </div>

                  {/* Columns Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Columns</h4>
                    </div>
                    <div className="space-y-2">
                      {(question.config.grid?.columns || [
                        { id: crypto.randomUUID(), value: "Column 1" }
                      ]).map((col, cIndex) => (
                        <div
                          key={col.id}
                          className="space-y-1"
                          onFocusCapture={() => { if (colFocusTimeoutRef.current) clearTimeout(colFocusTimeoutRef.current); setFocusedColIndex(cIndex); }}
                          onBlurCapture={() => { colFocusTimeoutRef.current = setTimeout(() => setFocusedColIndex(null), 150); }}
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-4 flex-shrink-0">
                              {question.type === "MULTIPLE_CHOICE_GRID" ? (
                                <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                              ) : (
                                <div className="h-4 w-4 rounded border-2 border-gray-300" />
                              )}
                            </div>
                            <input
                              type="text"
                              value={col.value}
                              onChange={(e) => {
                                const newGrid = { 
                                  rows: [...(question.config.grid?.rows || [{ id: crypto.randomUUID(), value: "Row 1" }])],
                                  columns: [...(question.config.grid?.columns || [{ id: crypto.randomUUID(), value: "Column 1" }])]
                                };
                                newGrid.columns[cIndex] = { ...col, value: e.target.value };
                                updateQuestion(sectionIndex, qIndex, { config: { ...question.config, grid: newGrid } });
                              }}
                              className="flex-1 border-b border-transparent text-sm text-gray-700 focus:border-indigo-500 focus:outline-none"
                              placeholder={`Column ${cIndex + 1}`}
                            />
                            <button
                              onClick={() => {
                                const cols = question.config.grid?.columns || [];
                                if (cols.length <= 1) return;
                                const newGrid = { 
                                  rows: question.config.grid?.rows || [],
                                  columns: cols.filter((_, i) => i !== cIndex)
                                };
                                updateQuestion(sectionIndex, qIndex, { config: { ...question.config, grid: newGrid } });
                              }}
                              disabled={(question.config.grid?.columns?.length || 0) <= 1}
                              className={`rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-0`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {focusedColIndex === cIndex && (
                            <div className="flex justify-center -my-0.5">
                              <button
                                onClick={() => {
                                  const currentGrid = question.config.grid || { rows: [], columns: [] };
                                  const columns = [...(currentGrid.columns.length ? currentGrid.columns : [{ id: crypto.randomUUID(), value: "Column 1" }])];
                                  columns.splice(cIndex + 1, 0, { id: crypto.randomUUID(), value: `Column ${columns.length + 1}` });
                                  const newGrid = { rows: currentGrid.rows.length ? currentGrid.rows : [{ id: crypto.randomUUID(), value: "Row 1" }], columns };
                                  updateQuestion(sectionIndex, qIndex, { config: { ...question.config, grid: newGrid } });
                                }}
                                className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-0.5 py-1 px-2 rounded hover:bg-indigo-50 transition-colors"
                                title="Insert column below"
                              >
                                <Plus className="h-3 w-3" /> Insert
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const currentGrid = question.config.grid || { rows: [], columns: [] };
                          const newGrid = {
                            rows: currentGrid.rows.length ? currentGrid.rows : [{ id: crypto.randomUUID(), value: "Row 1" }],
                            columns: [...(currentGrid.columns.length ? currentGrid.columns : [{ id: crypto.randomUUID(), value: "Column 1" }]), { id: crypto.randomUUID(), value: `Column ${(currentGrid.columns.length || 1) + 1}` }]
                          };
                          updateQuestion(sectionIndex, qIndex, { config: { ...question.config, grid: newGrid } });
                        }}
                        className="text-sm text-indigo-600 hover:text-indigo-500 flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> Add column
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {question.type === "FILE_UPLOAD" && (
              <div className="rounded border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-400">
                File upload input
              </div>
            )}

            {question.type === "SELFIE" && (
              <div className="rounded border border-dashed border-gray-300 px-3 py-8 flex flex-col items-center justify-center gap-2 text-sm text-gray-400">
                <Camera className="h-8 w-8 text-gray-300" />
                <span>Selfie / Camera Capture</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full sm:w-auto items-center justify-end gap-2 sm:border-l sm:pl-3 pt-3 sm:pt-0 border-t sm:border-t-0 mt-3 sm:mt-0">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <span>Required</span>
            <button
              onClick={() =>
                updateQuestion(sectionIndex, qIndex, {
                  isRequired: !question.isRequired,
                })
              }
              className={`relative h-5 w-9 rounded-full transition-colors ${
                question.isRequired
                  ? "bg-indigo-600"
                  : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  question.isRequired
                    ? "translate-x-4"
                    : "translate-x-0"
                }`}
              />
            </button>
          </label>
          
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu((prev) => !prev)}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)} />
                <div className="absolute bottom-full right-0 mb-2 w-64 rounded-lg bg-white shadow-xl ring-1 ring-black ring-opacity-5 z-20">
                <div className="py-1">
                {(question.type === "MULTIPLE_CHOICE" || question.type === "DROPDOWN") && (
                  <button
                    onClick={() => {
                      const newConfig = { ...question.config };
                      if (newConfig.routing?.enabled) {
                        delete newConfig.routing;
                        delete newConfig.autoAdvance;
                      } else {
                        newConfig.routing = {
                          enabled: true,
                          type: "OPTION_MATCH",
                          rules: {},
                        };
                      }
                      updateQuestion(sectionIndex, qIndex, { config: newConfig });
                      setShowMoreMenu(false);
                    }}
                    className="flex w-full items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <span>Go to section based on answer</span>
                    {question.config?.routing?.enabled && <Check className="h-3 w-3 text-indigo-600" />}
                  </button>
                )}
                {(question.type === "MULTIPLE_CHOICE" || question.type === "DROPDOWN") && question.config?.routing?.enabled && (
                    <button
                      onClick={() => {
                        const newConfig = { ...question.config };
                        newConfig.autoAdvance = !newConfig.autoAdvance;
                        updateQuestion(sectionIndex, qIndex, { config: newConfig });
                        setShowMoreMenu(false);
                      }}
                      className="flex w-full items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 pl-8"
                    >
                      <span>Auto-advance on select</span>
                      {(question.config?.autoAdvance !== false) && <Check className="h-3 w-3 text-indigo-600" />}
                    </button>
                )}
                {(question.type === "MULTIPLE_CHOICE" || question.type === "CHECKBOX" || question.type === "DROPDOWN") && (
                  <button
                    onClick={() => {
                      const newConfig = { ...question.config };
                      if (newConfig.defaultValue !== undefined) {
                        delete newConfig.defaultValue;
                      } else {
                        newConfig.defaultValue = question.type === "CHECKBOX" ? "[]" : "";
                      }
                      updateQuestion(sectionIndex, qIndex, { config: newConfig });
                      setShowMoreMenu(false);
                    }}
                    className="flex w-full items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <span>Set default value</span>
                    {question.config?.defaultValue !== undefined && <Check className="h-3 w-3 text-indigo-600" />}
                  </button>
                )}
                {(question.type === "SHORT_TEXT" || question.type === "PARAGRAPH" || question.type === "CHECKBOX") && (
                  <button
                    onClick={() => {
                      const newConfig = { ...question.config };
                      newConfig.validationEnabled = !newConfig.validationEnabled;
                      if (!newConfig.validationEnabled) {
                        delete newConfig.validation;
                      } else {
                        // Set defaults based on type
                        if (question.type === "CHECKBOX") {
                          newConfig.validation = { type: "CHECKBOX", rule: "AT_LEAST", value: "1", errorMessage: "" };
                        } else {
                          newConfig.validation = { type: "NUMBER", rule: "GREATER_THAN", value: "", errorMessage: "" };
                        }
                      }
                      updateQuestion(sectionIndex, qIndex, { config: newConfig });
                      setShowMoreMenu(false);
                    }}
                    className="flex w-full items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <span>Response validation</span>
                    {question.config?.validationEnabled && <Check className="h-3 w-3 text-indigo-600" />}
                  </button>
                )}
                <button
                  onClick={() => {
                    const newConfig = { ...question.config };
                    newConfig.showOnSuccessPage = !newConfig.showOnSuccessPage;
                    updateQuestion(sectionIndex, qIndex, { config: newConfig });
                    setShowMoreMenu(false);
                  }}
                  className="flex w-full items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <span>Show on success page</span>
                  {question.config?.showOnSuccessPage && <Check className="h-3 w-3 text-indigo-600" />}
                </button>
              </div>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => duplicateQuestion(sectionIndex, qIndex)}
            className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-500"
            title="Duplicate"
          >
            <ClipboardCopy className="h-4 w-4" />
          </button>
          <button
            onClick={() => removeQuestion(sectionIndex, qIndex)}
            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Column Mapping (Registered User Profile) */}
      {regUserHeaders && regUserHeaders.length > 0 && onMappingChange && !isTitle && (
        <div className="mt-3 border-t border-gray-100 pt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Profile Column:</span>
          {isLookupQuestion ? (
            <span className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
              {regUserMapping || "None"}
            </span>
          ) : (
            <SearchableSelect
              value={regUserMapping || ""}
              onChange={(val) => onMappingChange(question.id, val)}
              options={regUserHeaders}
              emptyLabel="— None —"
              className="w-44"
            />
          )}
          {regUserMapping && regUserFirstRow && regUserFirstRow[regUserMapping] !== undefined && (
            <span className="text-xs text-gray-400 italic truncate max-w-[14rem]" title={regUserFirstRow[regUserMapping]}>
              e.g. {regUserFirstRow[regUserMapping] || "—"}
            </span>
          )}
        </div>
      )}

      {/* Response Validation Settings */}
      {question.config?.validationEnabled && (
        <div className="mt-4 border-t border-gray-100 pt-4 flex flex-wrap items-center gap-3">
          <select
            value={question.config.validation?.type || "NUMBER"}
            onChange={(e) => {
              const type = e.target.value;
              const newConfig = { ...question.config };
              let rule = "GREATER_THAN";
              if (type === "TEXT") rule = "CONTAINS";
              if (type === "LENGTH") rule = "MIN_CHARS";
              if (type === "REGEX") rule = "MATCHES";
              if (type === "CHECKBOX") rule = "AT_LEAST";
              
              newConfig.validation = { ...newConfig.validation, type, rule };
              updateQuestion(sectionIndex, qIndex, { config: newConfig });
            }}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 focus:border-indigo-500 focus:outline-none"
          >
            {question.type === "CHECKBOX" ? (
              <option value="CHECKBOX">Select at least</option>
            ) : (
              <>
                <option value="NUMBER">Number</option>
                <option value="TEXT">Text</option>
                <option value="LENGTH">Length</option>
                <option value="REGEX">Regular expression</option>
              </>
            )}
          </select>

          <select
            value={question.config.validation?.rule || ""}
            onChange={(e) => {
              const newConfig = { ...question.config };
              newConfig.validation = { ...newConfig.validation, rule: e.target.value };
              updateQuestion(sectionIndex, qIndex, { config: newConfig });
            }}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 focus:border-indigo-500 focus:outline-none"
          >
            {question.config.validation?.type === "NUMBER" && (
              <>
                <option value="GREATER_THAN">Greater than</option>
                <option value="GREATER_THAN_OR_EQUAL">Greater than or equal to</option>
                <option value="LESS_THAN">Less than</option>
                <option value="LESS_THAN_OR_EQUAL">Less than or equal to</option>
                <option value="EQUAL_TO">Equal to</option>
                <option value="NOT_EQUAL_TO">Not equal to</option>
                <option value="BETWEEN">Between</option>
                <option value="NOT_BETWEEN">Not between</option>
                <option value="IS_NUMBER">Is number</option>
                <option value="WHOLE_NUMBER">Whole number</option>
              </>
            )}
            {question.config.validation?.type === "TEXT" && (
              <>
                <option value="CONTAINS">Contains</option>
                <option value="DOES_NOT_CONTAIN">Doesn't contain</option>
                <option value="EMAIL">Email</option>
                <option value="URL">URL</option>
              </>
            )}
            {question.config.validation?.type === "LENGTH" && (
              <>
                <option value="MAX_CHARS">Maximum character count</option>
                <option value="MIN_CHARS">Minimum character count</option>
              </>
            )}
            {question.config.validation?.type === "REGEX" && (
              <>
                <option value="CONTAINS">Contains</option>
                <option value="DOES_NOT_CONTAIN">Doesn't contain</option>
                <option value="MATCHES">Matches</option>
                <option value="DOES_NOT_MATCH">Doesn't match</option>
              </>
            )}
            {question.config.validation?.type === "CHECKBOX" && (
              <>
                <option value="AT_LEAST">Select at least</option>
                <option value="AT_MOST">Select at most</option>
                <option value="EXACTLY">Select exactly</option>
              </>
            )}
          </select>

          {question.config.validation?.rule && ["BETWEEN", "NOT_BETWEEN"].includes(question.config.validation.rule) ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={question.config.validation?.value || ""}
                onChange={(e) => {
                  const newConfig = { ...question.config };
                  newConfig.validation = { ...newConfig.validation, value: e.target.value };
                  updateQuestion(sectionIndex, qIndex, { config: newConfig });
                }}
                className="w-20 rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                placeholder="Number"
              />
              <span className="text-xs text-gray-500">and</span>
              <input
                type="text"
                value={question.config.validation?.maxValue || ""}
                onChange={(e) => {
                  const newConfig = { ...question.config };
                  newConfig.validation = { ...newConfig.validation, maxValue: e.target.value };
                  updateQuestion(sectionIndex, qIndex, { config: newConfig });
                }}
                className="w-20 rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                placeholder="Number"
              />
            </div>
          ) : question.config.validation?.rule && !["IS_NUMBER", "WHOLE_NUMBER", "EMAIL", "URL"].includes(question.config.validation.rule) && (
            <input
              type="text"
              value={question.config.validation?.value || ""}
              onChange={(e) => {
                const newConfig = { ...question.config };
                newConfig.validation = { ...newConfig.validation, value: e.target.value };
                updateQuestion(sectionIndex, qIndex, { config: newConfig });
              }}
              className="flex-1 min-w-[100px] rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
              placeholder={question.config.validation?.type === "REGEX" ? "Pattern" : "Value"}
            />
          )}

          <input
            type="text"
            value={question.config.validation?.errorMessage || ""}
            onChange={(e) => {
              const newConfig = { ...question.config };
              newConfig.validation = { ...newConfig.validation, errorMessage: e.target.value };
              updateQuestion(sectionIndex, qIndex, { config: newConfig });
            }}
            className="flex-1 min-w-[150px] rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
            placeholder="Custom error text"
          />
          <button
            onClick={() => {
              const newConfig = { ...question.config };
              newConfig.validationEnabled = false;
              delete newConfig.validation;
              updateQuestion(sectionIndex, qIndex, { config: newConfig });
            }}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
            title="Remove validation"
            aria-label="Remove validation"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function FormBuilderPageInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const formId = params.id as string;

  const [form, setForm] = useState<FormData | null>(null);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [activeTab, setActiveTab] = useState<"questions" | "responses" | "collaborators" | "userProfile">(
    searchParams.get("tab") === "responses" ? "responses" : "questions"
  );
  const [showPreview, setShowPreview] = useState(false);
  const [responses, setResponses] = useState<ResponseEntry[]>([]);
  const [responsesLoading, setResponsesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [collaborators, setCollaborators] = useState<Array<{
    id: string;
    userId: string;
    role: string;
    createdAt: string;
    user: { id: string; email: string; nickname: string; status: string };
  }>>([]);
  const [allUsers, setAllUsers] = useState<Array<{ id: string; email: string; nickname: string; role: string; status: string }>>([]);
  const [collabLoading, setCollabLoading] = useState(false);
  const [collabSearch, setCollabSearch] = useState("");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [showThemeEditor, setShowThemeEditor] = useState(false);
  const [customFonts, setCustomFonts] = useState<{ id: string; name: string; filename: string }[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [regUserData, setRegUserData] = useState<{
    id: string;
    headers: string[];
    rowCount: number;
    firstRow: Record<string, string> | null;
    lookupColumn: string;
    lookupQuestionId: string;
    secondaryLookupColumn: string;
    secondaryLookupQuestionId: string;
    mappings: Record<string, string>;
  } | null>(null);
  const [regUserLoading, setRegUserLoading] = useState(false);
  const [regUserUploading, setRegUserUploading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importForms, setImportForms] = useState<Array<{ id: string; title: string; _count: { questions: number } }>>([]);
  const [importFormSearch, setImportFormSearch] = useState("");
  const [importSelectedFormId, setImportSelectedFormId] = useState<string | null>(null);
  const [importQuestions, setImportQuestions] = useState<QuestionData[]>([]);
  const [importSelectedQIds, setImportSelectedQIds] = useState<Set<string>>(new Set());
  const [importLoading, setImportLoading] = useState(false);
  const historyRef = useRef(new FormHistory<FormData>(50));
  const undoRedoRef = useRef(false);
  const historyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdmin = currentUserRole === "ADMIN";

  const filteredResponses = useMemo(() => {
    if (!searchQuery.trim()) return responses;
    const query = searchQuery.toLowerCase();
    return responses.filter((resp) => {
      // Search in shortCode
      if (resp.shortCode?.toLowerCase().includes(query)) return true;
      // Search in phoneNumber
      if (resp.phoneNumber?.toLowerCase().includes(query)) return true;
      // Search in answers
      return resp.answers.some((ans) =>
        ans.value.toLowerCase().includes(query) ||
        ans.question.label.toLowerCase().includes(query)
      );
    });
  }, [responses, searchQuery]);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(u => {
      if (u) setCurrentUserRole(u.role);
    });
    fetch("/api/admin/fonts").then(r => r.ok ? r.json() : []).then(setCustomFonts).catch(() => {});
  }, []);

  const loadedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setForm((prev) => {
      if (!prev) return prev;
      const result = moveQuestionBetweenSections(prev.sections, active.id as string, over.id as string);
      return result ? { ...prev, sections: result } : prev;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setForm((prev) => {
      if (!prev) return prev;
      const result = reorderQuestionWithinSection(prev.sections, active.id as string, over.id as string);
      return result ? { ...prev, sections: result } : prev;
    });
  };

  const fetchForm = useCallback(async () => {
    const res = await fetch(`/api/forms/${formId}`);
    if (res.ok) {
      const data = await res.json();
      const questions = (data.questions || []).map((q: QuestionData & { config: string }) => ({
        ...q,
        config: typeof q.config === "string" ? JSON.parse(q.config) : q.config,
      }));
      const sections: SectionData[] = (data.sections || []).map((s: any) => ({
        ...s,
        routingConfig: typeof s.routingConfig === "string" ? JSON.parse(s.routingConfig) : (s.routingConfig || {}),
        questions: (s.questions || []).map((q: any) => ({
          ...q,
          config: typeof q.config === "string" ? JSON.parse(q.config) : q.config,
        })),
      }));
      // If no sections exist, create a default one from flat questions
      if (sections.length === 0 && questions.length > 0) {
        sections.push({
          id: tempId(),
          title: "Section 1",
          description: "",
          order: 0,
          routingConfig: {},
          questions,
        });
      }
      setForm({ ...data, theme: parseTheme(data.theme), notifyEmails: data.notifyEmails || "", sections, questions });
    }
  }, [formId]);

  useEffect(() => {
    fetchForm().finally(() => {
      setLoading(false);
      // Mark loaded after a tick so the first setForm from fetch doesn't trigger auto-save
      setTimeout(() => { loadedRef.current = true; }, 100);
    });
    fetchRegUserData();
  }, [fetchForm]);

  // Auto-save debounce (declared BEFORE history effect so it captures undoRedoRef first)
  useEffect(() => {
    if (!loadedRef.current || !form) return;
    const silent = undoRedoRef.current;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!silent) setSaveStatus("saving");
      try {
        const res = await fetch(`/api/forms/${formId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            description: form.description,
            published: form.published,
            collectPhone: form.collectPhone,
            phoneDescription: form.phoneDescription,
            phoneTitle: form.phoneTitle,
            phonePlaceholder: form.phonePlaceholder,
            theme: serializeTheme(form.theme),
            notifyEmails: form.notifyEmails,
            sections: form.sections.map((s) => ({
              id: s.id,
              title: s.title,
              description: s.description,
              order: s.order,
              routingConfig: s.routingConfig,
              questions: s.questions.map((q) => ({
                id: q.id,
                type: q.type,
                label: q.label,
                isRequired: q.isRequired,
                order: q.order,
                config: q.config,
                options: q.options.map((o) => ({
                  value: o.value,
                  order: o.order,
                  group: o.group,
                })),
              })),
            })),
          }),
        });
        if (res.ok) {
          const saved = await res.json();
          // Build temp→real ID mapping from the saved response
          const idMap: Record<string, string> = {};
          const savedSections = saved.sections || [];
          form.sections.forEach((ls, si) => {
            const ss = savedSections[si];
            if (!ss) return;
            if (ls.id !== ss.id) idMap[ls.id] = ss.id;
            const serverQs = ss.questions || [];
            (ls.questions || []).forEach((lq: any, qi: number) => {
              const sq = serverQs[qi];
              if (sq && lq.id !== sq.id) idMap[lq.id] = sq.id;
            });
          });
          if (Object.keys(idMap).length > 0) {
            undoRedoRef.current = true;
            setForm((prev) => {
              if (!prev) return prev;
              const mapped = {
                ...prev,
                sections: prev.sections.map((s) => ({
                  ...s,
                  id: idMap[s.id] || s.id,
                  questions: s.questions.map((q) => {
                    let cfg = { ...q.config };
                    if (cfg.routing?.enabled && (cfg.routing as any).rules) {
                      const r = { ...(cfg.routing as any), rules: { ...(cfg.routing as any).rules } };
                      for (const [optVal, target] of Object.entries(r.rules)) {
                        if (idMap[target as string]) r.rules[optVal] = idMap[target as string];
                      }
                      cfg = { ...cfg, routing: r };
                    }
                    return { ...q, id: idMap[q.id] || q.id, config: cfg };
                  }),
                })),
              };
              return mapped;
            });
          }
          setSaveStatus("saved");
        } else {
          setSaveStatus("error");
        }
      } catch {
        setSaveStatus("error");
      }
    }, 1000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  // ─── Undo / Redo history tracking ──────────────────────────────────
  function syncHistoryState() {
    setCanUndo(historyRef.current.canUndo);
    setCanRedo(historyRef.current.canRedo);
  }

  useEffect(() => {
    if (!loadedRef.current || !form) return;
    if (undoRedoRef.current) { undoRedoRef.current = false; return; }
    if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
    historyDebounceRef.current = setTimeout(() => {
      historyRef.current.push(form);
      syncHistoryState();
    }, 500);
    return () => { if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  function pushHistoryNow() {
    if (!form) return;
    if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
    historyRef.current.push(form);
    syncHistoryState();
  }

  function applySnapshot(snapshot: FormData | null) {
    if (!snapshot) return;
    if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
    undoRedoRef.current = true;
    setForm(snapshot);
    syncHistoryState();
  }

  function undo() { applySnapshot(historyRef.current.undo()); }
  function redo() { applySnapshot(historyRef.current.redo()); }

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && (e.key === "z" && e.shiftKey || e.key === "y")) { e.preventDefault(); redo(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const fetchResponses = useCallback(async () => {
    setResponsesLoading(true);
    const res = await fetch(`/api/responses?formId=${formId}`);
    if (res.ok) {
      setResponses(await res.json());
    }
    setResponsesLoading(false);
  }, [formId]);

  useEffect(() => {
    if (activeTab === "responses") {
      fetchResponses();
    }
  }, [activeTab, fetchResponses]);

  function addQuestion(type: QuestionType, sectionIndex?: number) {
    if (!form) return;
    pushHistoryNow();
    const si = sectionIndex ?? activeSectionIndex;
    if (si < 0 || si >= form.sections.length) return;
    const section = form.sections[si];
    const newId = tempId();
    const newQ: QuestionData = {
      id: newId,
      type,
      label: "",
      isRequired: false,
      order: section.questions.length,
      options: requiresOptions(type)
        ? [{ id: tempId(), value: "Option 1", order: 0, group: "default" }]
        : [],
      config: isGridType(type) ? {
        grid: {
          rows: [{ id: crypto.randomUUID(), value: "Row 1" }],
          columns: [{ id: crypto.randomUUID(), value: "Column 1" }]
        }
      } : {},
    };
    const newSections = [...form.sections];
    newSections[si] = { ...section, questions: [...section.questions, newQ] };
    setForm({ ...form, sections: newSections });
    setShowTypeMenu(false);
    setTimeout(() => {
      document.getElementById(`question-${newId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }

  function updateQuestionInSection(sectionIndex: number, qIndex: number, updates: Partial<QuestionData>) {
    if (!form) return;
    const newSections = [...form.sections];
    const section = { ...newSections[sectionIndex] };
    const questions = [...section.questions];
    questions[qIndex] = { ...questions[qIndex], ...updates };
    section.questions = questions;
    newSections[sectionIndex] = section;
    setForm({ ...form, sections: newSections });
  }

  function removeQuestionFromSection(sectionIndex: number, qIndex: number) {
    if (!form) return;
    const section = form.sections[sectionIndex];
    const q = section.questions[qIndex];
    if (q.config?.locked) {
      alert("The Phone Number field is required and cannot be removed.");
      return;
    }
    pushHistoryNow();
    const newSections = [...form.sections];
    const questions = section.questions.filter((_, i) => i !== qIndex);
    questions.forEach((q, i) => (q.order = i));
    newSections[sectionIndex] = { ...section, questions };
    setForm({ ...form, sections: newSections });
  }

  function duplicateQuestionInSection(sectionIndex: number, qIndex: number) {
    if (!form) return;
    pushHistoryNow();
    const section = form.sections[sectionIndex];
    const src = section.questions[qIndex];
    const newId = tempId();
    const newQ: QuestionData = {
      ...src,
      id: newId,
      label: `${src.label} (Copy)`,
      order: section.questions.length,
      options: src.options.map((o) => ({ ...o, id: tempId() })),
      config: { ...JSON.parse(JSON.stringify(src.config)), locked: undefined },
    };
    const newSections = [...form.sections];
    newSections[sectionIndex] = { ...section, questions: [...section.questions, newQ] };
    setForm({ ...form, sections: newSections });
    setTimeout(() => {
      document.getElementById(`question-${newId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }

  function addOptionInSection(sectionIndex: number, qIndex: number, insertAtIndex?: number) {
    if (!form) return;
    const newSections = [...form.sections];
    const section = { ...newSections[sectionIndex] };
    const questions = [...section.questions];
    const q = { ...questions[qIndex], options: [...questions[qIndex].options] };
    const newOption = {
      id: tempId(),
      value: `Option ${q.options.length + 1}`,
      order: 0,
      group: "default",
    };
    if (insertAtIndex !== undefined) {
      q.options.splice(insertAtIndex, 0, newOption);
    } else {
      q.options.push(newOption);
    }
    q.options.forEach((o, i) => (o.order = i));
    questions[qIndex] = q;
    section.questions = questions;
    newSections[sectionIndex] = section;
    setForm({ ...form, sections: newSections });
  }

  function updateOptionInSection(sectionIndex: number, qIndex: number, oIndex: number, value: string) {
    if (!form) return;
    const newSections = [...form.sections];
    const section = { ...newSections[sectionIndex] };
    const questions = [...section.questions];
    const q = { ...questions[qIndex], options: [...questions[qIndex].options] };
    const oldOptionValue = q.options[oIndex].value;
    q.config = updateRoutingOnOptionRename(q.config, oldOptionValue, value);

    q.options[oIndex] = { ...q.options[oIndex], value };
    questions[qIndex] = q;
    section.questions = questions;
    newSections[sectionIndex] = section;
    setForm({ ...form, sections: newSections });
  }

  function removeOptionFromSection(sectionIndex: number, qIndex: number, oIndex: number) {
    if (!form) return;
    pushHistoryNow();
    const newSections = [...form.sections];
    const section = { ...newSections[sectionIndex] };
    const questions = [...section.questions];
    const q = { ...questions[qIndex] };
    const removedOptionValue = q.options[oIndex].value;
    q.config = removeRoutingForOption(q.config, removedOptionValue);

    q.options = q.options.filter((_, i) => i !== oIndex);
    q.options.forEach((o, i) => (o.order = i));
    questions[qIndex] = q;
    section.questions = questions;
    newSections[sectionIndex] = section;
    setForm({ ...form, sections: newSections });
  }

  // Section management functions
  function addSection() {
    if (!form) return;
    pushHistoryNow();
    const insertAt = activeSectionIndex + 1;
    const newSection: SectionData = {
      id: tempId(),
      title: `Section ${form.sections.length + 1}`,
      description: "",
      order: insertAt,
      routingConfig: {},
      questions: [],
    };
    const newSections = [...form.sections];
    newSections.splice(insertAt, 0, newSection);
    newSections.forEach((s, i) => (s.order = i));
    setForm({ ...form, sections: newSections });
    setActiveSectionIndex(insertAt);
  }

  function updateSection(sectionIndex: number, updates: Partial<SectionData>) {
    if (!form) return;
    const newSections = [...form.sections];
    newSections[sectionIndex] = { ...newSections[sectionIndex], ...updates };
    setForm({ ...form, sections: newSections });
  }

  function removeSection(sectionIndex: number) {
    if (!form) return;
    if (form.sections.length <= 1) {
      alert("You must have at least one section.");
      return;
    }
    pushHistoryNow();
    const deletedId = form.sections[sectionIndex].id;
    const result = removeSectionWithQuestions(form.sections, sectionIndex);
    if (result) {
      // Clean up stale routing references pointing to the deleted section
      const remainingIds = new Set(result.map((s) => s.id));
      const cleaned = result.map((s) => {
        const route = s.routingConfig?.defaultRoute;
        if (route && route !== "NEXT" && route !== "SUBMIT" && !remainingIds.has(route)) {
          return { ...s, routingConfig: { ...s.routingConfig, defaultRoute: "NEXT" } };
        }
        return s;
      });
      setForm({ ...form, sections: cleaned });
      setActiveSectionIndex((prev) => Math.min(prev, cleaned.length - 1));
    }
  }

  function moveSectionUp(sectionIndex: number) {
    if (!form || sectionIndex <= 0) return;
    pushHistoryNow();
    const newSections = [...form.sections];
    [newSections[sectionIndex], newSections[sectionIndex - 1]] = [newSections[sectionIndex - 1], newSections[sectionIndex]];
    newSections.forEach((s, i) => (s.order = i));
    setForm({ ...form, sections: newSections });
  }

  function moveSectionDown(sectionIndex: number) {
    if (!form || sectionIndex >= form.sections.length - 1) return;
    pushHistoryNow();
    const newSections = [...form.sections];
    [newSections[sectionIndex], newSections[sectionIndex + 1]] = [newSections[sectionIndex + 1], newSections[sectionIndex]];
    newSections.forEach((s, i) => (s.order = i));
    setForm({ ...form, sections: newSections });
  }

  async function handleDeleteResponse(responseId: string) {
    if (!confirm("Delete this response?")) return;
    const res = await fetch(`/api/responses/${responseId}`, { method: "DELETE" });
    if (res.ok) {
      setResponses((prev) => prev.filter((r) => r.id !== responseId));
    }
  }

  function getEditLink(responseId: string, editToken: string) {
    return `${window.location.origin}/edit/${responseId}?token=${editToken}`;
  }

  async function openImportModal() {
    setShowImportModal(true);
    setImportSelectedFormId(null);
    setImportQuestions([]);
    setImportSelectedQIds(new Set());
    setImportFormSearch("");
    setImportLoading(true);
    try {
      const res = await fetch("/api/forms");
      if (res.ok) {
        const data = await res.json();
        setImportForms(data.filter((f: any) => f.id !== formId));
      }
    } catch { /* ignore */ } finally {
      setImportLoading(false);
    }
  }

  async function selectImportForm(id: string) {
    setImportSelectedFormId(id);
    setImportQuestions([]);
    setImportSelectedQIds(new Set());
    setImportLoading(true);
    try {
      const res = await fetch(`/api/forms/${id}`);
      if (res.ok) {
        const data = await res.json();
        const questions: QuestionData[] = (data.sections || []).flatMap((s: any) =>
          (s.questions || []).map((q: any) => ({
            ...q,
            config: typeof q.config === "string" ? JSON.parse(q.config) : (q.config || {}),
            options: (q.options || []).map((o: any) => ({ id: o.id, value: o.value, order: o.order, group: o.group || "" })),
          }))
        );
        setImportQuestions(questions.filter(q => !q.config?.isPhoneNumber));
      }
    } catch { /* ignore */ } finally {
      setImportLoading(false);
    }
  }

  function handleImportQuestions() {
    if (!form || importSelectedQIds.size === 0) return;
    pushHistoryNow();
    const section = form.sections[activeSectionIndex];
    const selected = importQuestions.filter(q => importSelectedQIds.has(q.id));
    const newQuestions = selected.map((q, i) => ({
      ...q,
      id: tempId(),
      order: section.questions.length + i,
      options: (q.options || []).map((o: OptionData) => ({ ...o, id: tempId() })),
    }));
    const newSections = [...form.sections];
    newSections[activeSectionIndex] = { ...section, questions: [...section.questions, ...newQuestions] };
    setForm({ ...form, sections: newSections });
    setShowImportModal(false);
  }

  async function fetchRegUserData() {
    setRegUserLoading(true);
    try {
      const res = await fetch(`/api/forms/${formId}/registered-user-data`);
      if (res.ok) {
        const data = await res.json();
        setRegUserData(data);
      }
    } catch { /* ignore */ }
    setRegUserLoading(false);
  }

  async function uploadRegUserFile(file: File) {
    setRegUserUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/forms/${formId}/registered-user-data`, {
        method: "POST",
        body: fd,
      });
      if (res.ok) {
        const data = await res.json();
        setRegUserData(data);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to upload file.");
      }
    } catch {
      alert("Failed to upload file.");
    }
    setRegUserUploading(false);
  }

  async function updateRegUserConfig(updates: { lookupColumn?: string; lookupQuestionId?: string; secondaryLookupColumn?: string; secondaryLookupQuestionId?: string; mappings?: Record<string, string> }) {
    if (!regUserData) return;
    try {
      const res = await fetch(`/api/forms/${formId}/registered-user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setRegUserData(data);
      }
    } catch { /* ignore */ }
  }

  async function deleteRegUserData() {
    if (!confirm("Remove the uploaded user profile data? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/forms/${formId}/registered-user-data`, { method: "DELETE" });
      if (res.ok) {
        setRegUserData(null);
      }
    } catch { /* ignore */ }
  }

  async function fetchCollaborators() {
    setCollabLoading(true);
    try {
      const res = await fetch(`/api/forms/${formId}/collaborators`);
      if (res.ok) {
        setCollaborators(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setCollabLoading(false);
    }
  }

  async function fetchAllUsers() {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const users = await res.json();
        setAllUsers(users.map((u: { id: string; email: string; nickname: string; role: string; status: string }) => ({
          id: u.id,
          email: u.email,
          nickname: u.nickname,
          role: u.role,
          status: u.status,
        })));
      }
    } catch {
      // ignore
    }
  }

  async function addCollaborator(userId: string) {
    try {
      const res = await fetch(`/api/forms/${formId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setCollabSearch("");
        fetchCollaborators();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to add collaborator.");
      }
    } catch {
      alert("Failed to add collaborator.");
    }
  }

  async function removeCollaborator(userId: string) {
    if (!confirm("Remove this collaborator's access to this form?")) return;
    try {
      const res = await fetch(`/api/forms/${formId}/collaborators/${userId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchCollaborators();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to remove collaborator.");
      }
    } catch {
      alert("Failed to remove collaborator.");
    }
  }

  function getTypeIcon(type: QuestionType) {
    switch (type) {
      case "SHORT_TEXT":
      case "PARAGRAPH":
        return <Type className="h-4 w-4" />;
      case "MULTIPLE_CHOICE":
      case "CHECKBOX":
      case "DROPDOWN":
        return <List className="h-4 w-4" />;
      case "FILE_UPLOAD":
        return <Upload className="h-4 w-4" />;
      case "SELFIE":
        return <Camera className="h-4 w-4" />;
      case "LINEAR_SCALE":
        return <ToggleLeft className="h-4 w-4" />;
      case "RATING":
        return <Star className="h-4 w-4" />;
      case "DATE":
        return <Calendar className="h-4 w-4" />;
      case "TIME":
        return <Clock className="h-4 w-4" />;
      default:
        return <List className="h-4 w-4" />;
    }
  }

  if (loading || !form) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">Loading form...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push("/admin")}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            {/* Auto-save status (mobile) */}
            <span className="flex items-center gap-1.5 text-xs text-gray-400 sm:hidden">
              {saveStatus === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saveStatus === "saved" && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
              {saveStatus === "error" && <CloudOff className="h-3.5 w-3.5 text-red-500" />}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            {/* Auto-save status (desktop) */}
            <span className="hidden items-center gap-1.5 text-xs text-gray-400 sm:flex">
              {saveStatus === "saving" && (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              )}
              {saveStatus === "saved" && (
                <>
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  Saved
                </>
              )}
              {saveStatus === "error" && (
                <>
                  <CloudOff className="h-3.5 w-3.5 text-red-500" />
                  Error
                </>
              )}
            </span>

            <div className="flex items-center gap-1 border-r pr-2 mr-1">
              <button
                onClick={undo}
                disabled={!canUndo}
                className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Undo (⌘Z)"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Redo (⌘⇧Z)"
              >
                <Redo2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setForm({ ...form, published: !form.published })
                }
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  form.published
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {form.published ? "Published" : "Draft"}
              </button>
              <button
                onClick={() => {
                  if (form.published) {
                    window.open(`/form/${form.id}`, "_blank");
                  }
                }}
                disabled={!form.published}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm ${
                  form.published
                    ? "text-gray-600 hover:bg-gray-100 cursor-pointer"
                    : "text-gray-300 cursor-not-allowed"
                }`}
                title={form.published ? "Open published form" : "Form must be published to open"}
              >
                <ExternalLink className="h-4 w-4" />
                <span className="hidden sm:inline">Open</span>
              </button>
              {form.shortCode && (
                <button
                  onClick={() => {
                    const shortUrl = `${window.location.origin}/f/${form.shortCode}`;
                    navigator.clipboard.writeText(shortUrl);
                    setSaveStatus("saved");
                    setTimeout(() => setSaveStatus("idle"), 1500);
                  }}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                  title={`Short URL: ${window.location.origin}/f/${form.shortCode}`}
                >
                  <Link2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Short URL</span>
                </button>
              )}
              <button
                onClick={() => setShowThemeEditor(!showThemeEditor)}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm ${showThemeEditor ? "bg-indigo-100 text-indigo-700" : "text-gray-600 hover:bg-gray-100"}`}
                title="Customize theme"
              >
                <Palette className="h-4 w-4" />
                <span className="hidden sm:inline">Theme</span>
              </button>
              <button
                onClick={() => setShowPreview(true)}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                title="Preview form"
              >
                <Eye className="h-4 w-4" />
                <span className="hidden sm:inline">Preview</span>
              </button>
            </div>
          </div>
        </div>
        {/* Tab bar */}
        <div className="mx-auto flex w-full max-w-4xl gap-2 border-t px-3 sm:gap-4 sm:px-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab("questions")}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === "questions"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Pencil className="h-4 w-4" />
            Questions
          </button>
          <button
            onClick={() => setActiveTab("responses")}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === "responses"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Users className="h-4 w-4" />
            Responses
          </button>
          {isAdmin && (
            <button
              onClick={() => {
                setActiveTab("collaborators");
                fetchCollaborators();
              }}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${
                activeTab === "collaborators"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Users className="h-4 w-4" />
              Collaborators
            </button>
          )}
          <button
            onClick={() => {
              setActiveTab("userProfile");
              fetchRegUserData();
            }}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === "userProfile"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Import className="h-4 w-4" />
            User Profile
          </button>
        </div>
      </header>

      {/* Theme Editor Dialog */}
      {showThemeEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowThemeEditor(false)}>
          <div className="relative w-full max-w-lg rounded-xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Theme Customization</h3>
              <button onClick={() => setShowThemeEditor(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Primary Color */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Primary Color</label>
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setForm({ ...form, theme: { ...form.theme, primaryColor: c.value } })}
                      className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${form.theme.primaryColor === c.value ? "border-gray-900 scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
              {/* Background Color */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Background</label>
                <div className="flex flex-wrap gap-1.5">
                  {BG_PRESETS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setForm({ ...form, theme: { ...form.theme, backgroundColor: c.value } })}
                      className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${form.theme.backgroundColor === c.value ? "border-gray-900 scale-110" : "border-gray-300"}`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
              {/* Font Family */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Font</label>
                <div className="flex flex-wrap gap-1.5">
                  {(["sans", "serif", "mono"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setForm({ ...form, theme: { ...form.theme, fontFamily: f } })}
                      className={`rounded-lg border px-3 py-1 text-xs capitalize ${form.theme.fontFamily === f ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                      style={{ fontFamily: f === "sans" ? "sans-serif" : f === "serif" ? "serif" : "monospace" }}
                    >
                      {f}
                    </button>
                  ))}
                  {customFonts.map((cf) => (
                    <button
                      key={cf.id}
                      onClick={() => setForm({ ...form, theme: { ...form.theme, fontFamily: cf.name } })}
                      className={`rounded-lg border px-3 py-1 text-xs ${form.theme.fontFamily === cf.name ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                    >
                      {cf.name}
                    </button>
                  ))}
                </div>
              </div>
              {/* Border Radius */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Corners</label>
                <div className="flex gap-1.5">
                  {(["sm", "md", "lg"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setForm({ ...form, theme: { ...form.theme, borderRadius: r } })}
                      className={`rounded-lg border px-3 py-1 text-xs ${form.theme.borderRadius === r ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                    >
                      {r === "sm" ? "Square" : r === "md" ? "Rounded" : "Pill"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Header Image */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Header Image</label>
              {form.theme.headerImage ? (
                <div className="relative group">
                  <img src={form.theme.headerImage} alt="Header" className="w-full rounded-lg border" />
                  <button
                    onClick={() => setForm({ ...form, theme: { ...form.theme, headerImage: "" } })}
                    className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove header image"
                  ><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-6 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                  <Upload className="h-4 w-4" />
                  <span>Upload image (max 5 MB, supports GIF)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > HEADER_IMAGE_MAX_BYTES) {
                        alert("File too large. Maximum size is 5 MB.");
                        return;
                      }
                      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
                        alert("Unsupported image format.");
                        return;
                      }
                      const fd = new FormData();
                      fd.append("file", file);
                      try {
                        const res = await fetch("/api/upload", { method: "POST", body: fd });
                        if (!res.ok) { const d = await res.json(); alert(d.error || "Upload failed"); return; }
                        const { path } = await res.json();
                        setForm({ ...form, theme: { ...form.theme, headerImage: path } });
                      } catch { alert("Upload failed"); }
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
            {form.theme.primaryColor !== DEFAULT_THEME.primaryColor || form.theme.backgroundColor !== DEFAULT_THEME.backgroundColor || form.theme.fontFamily !== DEFAULT_THEME.fontFamily || form.theme.borderRadius !== DEFAULT_THEME.borderRadius || form.theme.headerImage !== DEFAULT_THEME.headerImage ? (
              <button
                onClick={() => setForm({ ...form, theme: { ...DEFAULT_THEME } })}
                className="mt-3 text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Reset to defaults
              </button>
            ) : null}
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-4xl px-3 py-3 sm:px-4 sm:py-8">
        {activeTab === "questions" && (
          <>
        {/* Header image preview in builder */}
        {form.theme.headerImage && (
          <div className="mb-0 overflow-hidden rounded-t-lg sm:rounded-t-xl">
            <img src={form.theme.headerImage} alt="" className="w-full" />
          </div>
        )}
        {/* Form title and description */}
        <div className={`mb-3 bg-white p-3 shadow-sm sm:mb-6 sm:p-6 ${form.theme.headerImage ? "rounded-b-lg sm:rounded-b-xl" : "rounded-lg border-t-4 sm:rounded-xl"}`} style={{ borderTopColor: form.theme.headerImage ? undefined : form.theme.primaryColor }}>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full border-b border-transparent text-2xl font-bold text-gray-900 focus:border-indigo-500 focus:outline-none"
            placeholder="Form title"
          />
          <div className="mt-2">
            <GoogleFormEditor
              value={form.description}
              onChange={(html) => setForm({ ...form, description: html })}
              placeholder="Form description (optional)"
            />
          </div>
        </div>

        {/* Questions */}
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-4">
            {/* Identity Settings Block for Phone Number */}
            <div className="rounded-lg border-t-4 border-t-indigo-600 bg-white p-4 shadow-sm sm:rounded-xl sm:p-6">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">Identity Field (Phone Number)</h3>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <span>Require Phone Number</span>
                  <button
                    onClick={() => setForm({ ...form, collectPhone: !form.collectPhone })}
                    className={`relative h-5 w-9 rounded-full transition-colors ${
                      form.collectPhone ? "bg-indigo-600" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        form.collectPhone ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </label>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-gray-600 mb-4">
                  {form.collectPhone 
                    ? "This form will require respondents to enter their phone number. This is necessary if you want them to be able to edit their submission later."
                    : "This form is currently anonymous. Respondents will NOT be asked for their phone number and cannot edit their submissions later."
                  }
                </p>
                {form.collectPhone && (
                  <div className="space-y-4 mt-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-gray-700">Dialog Description</label>
                      <input
                        type="text"
                        value={form.phoneDescription || ""}
                        onChange={(e) => setForm({ ...form, phoneDescription: e.target.value })}
                        className="w-full sm:w-3/4 border-b border-gray-300 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none bg-gray-50 p-2 rounded-t"
                        placeholder="e.g. We need to keep your phone number for future reference"
                      />
                      <p className="text-xs text-gray-500">This message will be shown in a popup dialog when the user clicks Submit.</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-gray-700">Field Title</label>
                      <input
                        type="text"
                        value={form.phoneTitle || ""}
                        onChange={(e) => setForm({ ...form, phoneTitle: e.target.value })}
                        className="w-full sm:w-3/4 border-b border-gray-300 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none bg-gray-50 p-2 rounded-t"
                        placeholder="Phone Number"
                      />
                      <p className="text-xs text-gray-500">Label shown above the input field in the dialog. Default: Phone Number</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-gray-700">Field Placeholder</label>
                      <input
                        type="text"
                        value={form.phonePlaceholder || ""}
                        onChange={(e) => setForm({ ...form, phonePlaceholder: e.target.value })}
                        className="w-full sm:w-3/4 border-b border-gray-300 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none bg-gray-50 p-2 rounded-t"
                        placeholder="Enter your phone number"
                      />
                      <p className="text-xs text-gray-500">Placeholder text inside the input field. Default: Enter your phone number</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Email Notifications */}
            <div className="rounded-lg bg-white p-4 shadow-sm sm:rounded-xl sm:p-6">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-900">Email Notifications</h3>
              </div>
              <p className="text-xs text-gray-500 mb-3">Get notified by email when someone submits this form. Requires SMTP to be configured.</p>
              <input
                type="text"
                value={form.notifyEmails}
                onChange={(e) => setForm({ ...form, notifyEmails: e.target.value })}
                className="w-full border-b border-gray-300 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none bg-gray-50 p-2 rounded-t"
                placeholder="email1@example.com, email2@example.com"
              />
            </div>

            {form.sections.map((section, sIndex) => {
              let globalQIndex = 0;
              for (let si = 0; si < sIndex; si++) {
                globalQIndex += form.sections[si].questions.filter(q => !q.config?.isPhoneNumber).length;
              }
              const isActiveSection = activeSectionIndex === sIndex;
              return (
                <SectionContainer key={section.id} id={section.id} className={`space-y-3 min-h-[50px] rounded-xl transition-shadow ${form.sections.length > 1 && isActiveSection ? "ring-2 ring-indigo-300 ring-offset-2" : ""}`} onClick={() => setActiveSectionIndex(sIndex)} onFocus={() => setActiveSectionIndex(sIndex)}>
                  {/* Section header */}
                  {form.sections.length > 1 && (
                    <div className="rounded-xl border-l-4 border-l-indigo-400 bg-indigo-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={section.title}
                            onChange={(e) => updateSection(sIndex, { title: e.target.value })}
                            className="w-full border-b border-transparent bg-transparent text-lg font-semibold text-indigo-900 focus:border-indigo-500 focus:outline-none"
                            placeholder="Section title"
                          />
                          <div className="mt-1">
                            <GoogleFormEditor
                              value={section.description}
                              onChange={(html) => updateSection(sIndex, { description: html })}
                              placeholder="Section description (optional)"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => moveSectionUp(sIndex)} disabled={sIndex === 0} className="rounded p-1 text-indigo-400 hover:bg-indigo-100 disabled:opacity-30" title="Move up"><ChevronUp className="h-4 w-4" /></button>
                          <button onClick={() => moveSectionDown(sIndex)} disabled={sIndex === form.sections.length - 1} className="rounded p-1 text-indigo-400 hover:bg-indigo-100 disabled:opacity-30" title="Move down"><ChevronDown className="h-4 w-4" /></button>
                          <button onClick={() => removeSection(sIndex)} className="rounded p-1 text-red-400 hover:bg-red-100" title="Delete section"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Questions in this section */}
                  <SortableContext
                    items={section.questions.filter(q => !q.config?.isPhoneNumber).map((q) => q.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {section.questions.filter(q => !q.config?.isPhoneNumber).map((question, qIdx) => (
                      <SortableQuestion
                        key={question.id}
                        question={question}
                        sectionIndex={sIndex}
                        qIndex={section.questions.findIndex(q => q.id === question.id)}
                        visualIndex={globalQIndex + qIdx}
                        sections={form.sections}
                        updateQuestion={updateQuestionInSection}
                        removeQuestion={removeQuestionFromSection}
                        duplicateQuestion={duplicateQuestionInSection}
                        addOption={addOptionInSection}
                        updateOption={updateOptionInSection}
                        removeOption={removeOptionFromSection}
                        regUserHeaders={regUserData?.lookupColumn ? regUserData.headers : undefined}
                        regUserMapping={regUserData?.mappings[question.id]}
                        regUserFirstRow={regUserData?.firstRow}
                        isLookupQuestion={regUserData?.lookupQuestionId === question.id}
                        onMappingChange={regUserData?.lookupColumn ? (qId, col) => {
                          const newMappings = { ...regUserData.mappings };
                          if (col) {
                            newMappings[qId] = col;
                          } else {
                            delete newMappings[qId];
                          }
                          updateRegUserConfig({ mappings: newMappings });
                        } : undefined}
                      />
                    ))}
                  </SortableContext>

                  {/* Section routing — "After section X" dropdown (only for multi-section forms) */}
                  {form.sections.length > 1 && (
                    <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-2.5 text-sm text-gray-500">
                      <span className="whitespace-nowrap font-medium">After section {sIndex + 1}</span>
                      <select
                        value={section.routingConfig?.defaultRoute || "NEXT"}
                        onChange={(e) => updateSection(sIndex, { routingConfig: { ...section.routingConfig, defaultRoute: e.target.value } })}
                        className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="NEXT">Continue to next section</option>
                        {form.sections
                          .filter((_, i) => i !== sIndex)
                          .map((s, _, arr) => {
                            const realIndex = form.sections.findIndex((fs) => fs.id === s.id);
                            return (
                              <option key={s.id} value={s.id}>
                                Go to section {realIndex + 1} ({s.title || "Untitled"})
                              </option>
                            );
                          })}
                        <option value="SUBMIT">Submit form</option>
                      </select>
                    </div>
                  )}
                </SectionContainer>
              );
            })}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDragId && form ? (() => {
              const pos = findSectionForQuestion(form.sections, activeDragId);
              if (!pos) return null;
              const q = form.sections[pos.sIdx].questions[pos.qIdx];
              return (
                <div className="rounded-lg border bg-white p-3 shadow-lg ring-2 ring-indigo-500 ring-opacity-50 opacity-90 max-w-md">
                  <span className="text-sm font-medium text-gray-900">{q.label || "Untitled question"}</span>
                </div>
              );
            })() : null}
          </DragOverlay>
        </DndContext>

        {/* Floating toolbar */}
        <div className="fixed bottom-3 left-1/2 z-20 -translate-x-1/2 w-[calc(100vw-1.5rem)] max-w-md sm:bottom-6 sm:w-auto">
          <div className="flex items-center justify-center gap-1 sm:gap-2 rounded-full border bg-white px-2 sm:px-3 py-2 shadow-lg overflow-visible">
            {/* Add Question */}
            <div className="relative shrink-0">
              <button
                onClick={() => setShowTypeMenu(!showTypeMenu)}
                className="flex items-center gap-1 sm:gap-2 rounded-full bg-indigo-600 px-3 sm:px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add Question</span>
                <ChevronDown className="h-3 w-3" />
              </button>
              {showTypeMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-56 sm:w-64 rounded-xl border bg-white py-2 shadow-xl max-h-[60vh] overflow-y-auto">
                  {Object.entries(QUESTION_TYPE_CATEGORIES).map(
                    ([category, types]) => (
                      <div key={category}>
                        <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                          {category}
                        </div>
                        {types.map((t) => (
                          <button
                            key={t}
                            onClick={() => addQuestion(t)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          >
                            {getTypeIcon(t)}
                            {QUESTION_TYPE_LABELS[t]}
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            <div className="mx-1 h-6 w-px bg-gray-200" />

            {/* Import questions from other forms */}
            <button
              onClick={() => openImportModal()}
              className="rounded-full p-2 text-gray-500 hover:bg-gray-100" title="Import questions"
            >
              <Import className="h-4 w-4" />
            </button>

            {/* Add Title & Description */}
            <button
              onClick={() => {
                if (!form) return;
                const si = activeSectionIndex;
                if (si < 0 || si >= form.sections.length) return;
                const section = form.sections[si];
                const newId = tempId();
                const newQ: QuestionData = {
                  id: newId,
                  type: "SHORT_TEXT" as QuestionType,
                  label: "Untitled Title",
                  isRequired: false,
                  order: section.questions.length,
                  options: [],
                  config: { isTitle: true, titleDescription: "" },
                };
                const newSections = [...form.sections];
                newSections[si] = { ...section, questions: [...section.questions, newQ] };
                setForm({ ...form, sections: newSections });
                setTimeout(() => {
                  document.getElementById(`question-${newId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }, 100);
              }}
              className="rounded-full p-2 text-gray-500 hover:bg-gray-100" title="Add Title & Description"
            >
              <Heading className="h-4 w-4" />
            </button>

            {/* Add Image/Video */}
            <button
              onClick={() => {
                if (!form) return;
                const si = activeSectionIndex;
                if (si < 0 || si >= form.sections.length) return;
                const section = form.sections[si];
                const newId = tempId();
                const newQ: QuestionData = {
                  id: newId,
                  type: "FILE_UPLOAD" as QuestionType,
                  label: "Image / Video",
                  isRequired: false,
                  order: section.questions.length,
                  options: [],
                  config: { isMedia: true },
                };
                const newSections = [...form.sections];
                newSections[si] = { ...section, questions: [...section.questions, newQ] };
                setForm({ ...form, sections: newSections });
                setTimeout(() => {
                  document.getElementById(`question-${newId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }, 100);
              }}
              className="rounded-full p-2 text-gray-500 hover:bg-gray-100" title="Add Image/Video"
            >
              <Image className="h-4 w-4" />
            </button>

            {/* Add Section */}
            <button
              onClick={() => addSection()}
              className="rounded-full p-2 text-gray-500 hover:bg-gray-100" title="Add Section"
            >
              <SeparatorHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>
          </>
        )}

        {/* Responses tab */}
        {activeTab === "responses" && (
          <div className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                Responses ({filteredResponses.length})
              </h2>
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Search className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search submissions (ID, phone, or any answer)..."
                    className="block w-full rounded-lg border border-gray-300 bg-gray-50 py-2 pl-10 pr-3 text-sm placeholder-gray-500 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <button
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = `/api/forms/${formId}/export`;
                    a.download = "";
                    a.click();
                  }}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm"
                  title="Export responses as CSV"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Export CSV</span>
                </button>
              </div>
            </div>
            {responsesLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading responses…
              </div>
            ) : filteredResponses.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
                {searchQuery ? "No matching responses found." : "No responses yet."}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredResponses.map((resp) => (
                  <div
                    key={resp.id}
                    className="overflow-hidden rounded-lg border bg-white shadow-sm sm:rounded-xl"
                  >
                    <div className="bg-gray-50 border-b border-gray-100 px-4 py-2 sm:px-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Hash className="h-3.5 w-3.5 text-gray-400" />
                          <span className="text-xs font-mono font-bold text-indigo-600">
                            {resp.shortCode}
                          </span>
                        </div>
                        <p className="text-[10px] sm:text-xs text-gray-500">
                          Last activity: {new Date(resp.updatedAt || resp.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="p-3 sm:p-5">
                      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {resp.phoneNumber || "Anonymous"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() =>
                              router.push(`/admin/responses/${resp.id}`)
                            }
                            className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 sm:px-3 sm:text-sm"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(
                                getEditLink(resp.id, resp.editToken)
                              );
                              alert("Edit link copied!");
                            }}
                            className="flex items-center gap-1 rounded-lg bg-indigo-100 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-200 sm:px-3 sm:text-sm"
                          >
                            <ClipboardCopy className="h-3.5 w-3.5" />
                            Copy Link
                          </button>
                          <button
                            onClick={() => handleDeleteResponse(resp.id)}
                            className="flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 sm:px-3 sm:text-sm"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2 border-t border-gray-50 pt-3">
                        {resp.answers.slice(0, 3).map((a) => (
                          <div key={a.id} className="text-sm">
                            <span className="font-medium text-gray-700">
                              {a.question.label}:
                            </span>{" "}
                            <span className="text-gray-600 truncate inline-block max-w-[200px] align-bottom">
                              {(() => {
                                if (isGridType(a.question.type as any)) {
                                  return "Grid Response";
                                }
                                if (a.question.type === "SELFIE") {
                                  return (
                                    <span className="flex items-center gap-1 text-indigo-600">
                                      <Camera className="h-3 w-3" />
                                      Selfie Captured
                                    </span>
                                  );
                                }
                                return a.value;
                              })()}
                            </span>
                          </div>
                        ))}
                        {resp.answers.length > 3 && (
                          <p className="text-xs text-gray-400 italic">
                            + {resp.answers.length - 3} more fields
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Collaborators tab */}
        {activeTab === "collaborators" && isAdmin && (
          <div className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                Collaborators ({collaborators.length})
              </h2>
            </div>

            {/* Add collaborator */}
            <div className="mb-6 rounded-lg border bg-gray-50 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Collaborator</h3>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={collabSearch}
                    onChange={(e) => {
                      setCollabSearch(e.target.value);
                      if (allUsers.length === 0) fetchAllUsers();
                    }}
                    onFocus={() => { if (allUsers.length === 0) fetchAllUsers(); }}
                    placeholder="Search users by email..."
                    className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
              {collabSearch && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border bg-white">
                  {allUsers
                    .filter(u => u.role !== "ADMIN")
                    .filter(u => !collaborators.some(c => c.userId === u.id))
                    .filter(u => u.email.toLowerCase().includes(collabSearch.toLowerCase()) || u.nickname.toLowerCase().includes(collabSearch.toLowerCase()))
                    .map(u => (
                      <button
                        key={u.id}
                        onClick={() => addCollaborator(u.id)}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-indigo-50 transition-colors"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{u.nickname || u.email}</p>
                          {u.nickname && <p className="text-xs text-gray-500">{u.email}</p>}
                        </div>
                        <span className="text-xs font-medium text-indigo-600">+ Add</span>
                      </button>
                    ))}
                  {allUsers
                    .filter(u => u.role !== "ADMIN")
                    .filter(u => !collaborators.some(c => c.userId === u.id))
                    .filter(u => u.email.toLowerCase().includes(collabSearch.toLowerCase()) || u.nickname.toLowerCase().includes(collabSearch.toLowerCase()))
                    .length === 0 && (
                    <div className="px-4 py-3 text-sm text-gray-500">No matching users found.</div>
                  )}
                </div>
              )}
            </div>

            {/* Current collaborators */}
            {collabLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading collaborators…
              </div>
            ) : collaborators.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
                No collaborators yet. Add users above to grant them edit access to this form.
              </div>
            ) : (
              <div className="divide-y rounded-lg border">
                {collaborators.map((collab) => (
                  <div key={collab.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                    <div>
                      <p className="font-medium text-gray-900">
                        {collab.user.nickname || collab.user.email}
                      </p>
                      {collab.user.nickname && (
                        <p className="text-xs text-gray-500">{collab.user.email}</p>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          Editor
                        </span>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          collab.user.status === "ACTIVATED" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                        }`}>
                          {collab.user.status === "ACTIVATED" ? "Active" : "Pending"}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeCollaborator(collab.userId)}
                      className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                      title="Remove collaborator"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Registered User Profile tab */}
        {activeTab === "userProfile" && (
          <div className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Registered User Profile</h2>
            <p className="text-sm text-gray-500 mb-6">
              Upload a user list (XLSX). When a user enters their lookup key, mapped fields will auto-fill.
            </p>

            {regUserLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
              </div>
            ) : !regUserData ? (
              <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
                <Upload className="mx-auto h-10 w-10 text-gray-400 mb-3" />
                <p className="text-sm text-gray-600 mb-4">No user profile uploaded yet.</p>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                  {regUserUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {regUserUploading ? "Uploading…" : "Upload XLSX"}
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    disabled={regUserUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadRegUserFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            ) : (
              <div className="space-y-6">
                {/* File info */}
                <div className="flex items-center justify-between rounded-lg border bg-gray-50 p-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {regUserData.headers.length} columns · {regUserData.rowCount} rows
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 max-w-md truncate">
                      {regUserData.headers.join(", ")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      {regUserUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Replace
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        disabled={regUserUploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadRegUserFile(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      onClick={deleteRegUserData}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>

                {/* Lookup Column */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Lookup Column</label>
                  <p className="text-xs text-gray-500 mb-2">
                    Which column should be used to match the user&apos;s input? (e.g., IC Number, User ID)
                  </p>
                  <select
                    value={regUserData.lookupColumn}
                    onChange={(e) => {
                      const newCol = e.target.value;
                      const newMappings = { ...regUserData.mappings };
                      if (regUserData.lookupQuestionId) {
                        if (newCol) {
                          newMappings[regUserData.lookupQuestionId] = newCol;
                        } else {
                          delete newMappings[regUserData.lookupQuestionId];
                        }
                      }
                      updateRegUserConfig({ lookupColumn: newCol, mappings: newMappings });
                    }}
                    className="block w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">— Select column —</option>
                    {regUserData.headers.map((h: string) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Lookup Question */}
                {regUserData.lookupColumn && form && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Lookup Question</label>
                    <p className="text-xs text-gray-500 mb-2">
                      Which form question should the user type their lookup key into? (e.g., the &quot;IC Number&quot; question)
                    </p>
                    <select
                      value={regUserData.lookupQuestionId}
                      onChange={(e) => {
                        const newQId = e.target.value;
                        const newMappings = { ...regUserData.mappings };
                        // Unmap old lookup question if it was mapped to the lookup column
                        if (regUserData.lookupQuestionId && newMappings[regUserData.lookupQuestionId] === regUserData.lookupColumn) {
                          delete newMappings[regUserData.lookupQuestionId];
                        }
                        // Auto-map new lookup question to the lookup column
                        if (newQId && regUserData.lookupColumn) {
                          newMappings[newQId] = regUserData.lookupColumn;
                        }
                        updateRegUserConfig({ lookupQuestionId: newQId, mappings: newMappings });
                      }}
                      className="block w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">— Select question —</option>
                      {form.sections.flatMap((s) => s.questions).filter((q) => !q.config?.isTitle && !q.config?.isPhoneNumber && q.label?.trim()).map((q) => (
                        <option key={q.id} value={q.id}>{q.label} ({q.type})</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Secondary Verification (Anti-Brute-Force) */}
                {regUserData.lookupColumn && form && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-0.5">Secondary Verification Column <span className="text-xs font-normal text-gray-400">(optional)</span></label>
                      <p className="text-xs text-gray-500 mb-2">
                        Require a second field to match before auto-filling. This prevents attackers from brute-forcing lookup values to steal profile data.
                      </p>
                      <select
                        value={regUserData.secondaryLookupColumn}
                        onChange={(e) => updateRegUserConfig({ secondaryLookupColumn: e.target.value, secondaryLookupQuestionId: "" })}
                        className="block w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">— None (single-field lookup) —</option>
                        {regUserData.headers.filter((h: string) => h !== regUserData.lookupColumn).map((h: string) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                    {regUserData.secondaryLookupColumn && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Secondary Verification Question</label>
                        <p className="text-xs text-gray-500 mb-2">
                          Which form question should the user type their secondary verification into?
                        </p>
                        <select
                          value={regUserData.secondaryLookupQuestionId}
                          onChange={(e) => updateRegUserConfig({ secondaryLookupQuestionId: e.target.value })}
                          className="block w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="">— Select question —</option>
                          {form.sections.flatMap((s) => s.questions).filter((q) => !q.config?.isTitle && !q.config?.isPhoneNumber && q.label?.trim() && q.id !== regUserData.lookupQuestionId).map((q) => (
                            <option key={q.id} value={q.id}>{q.label} ({q.type})</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Mapping summary & auto-match */}
                {regUserData.lookupColumn && form && (
                  <div className="rounded-lg border bg-indigo-50/50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700">Column Mapping</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {Object.keys(regUserData.mappings).length} of {form.sections.flatMap((s) => s.questions).filter((q) => !q.config?.isTitle && !q.config?.isPhoneNumber && q.label?.trim()).length} questions mapped.
                          Go to the <button type="button" onClick={() => setActiveTab("questions")} className="text-indigo-600 underline hover:text-indigo-800">Questions</button> tab to map each question to a column.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          const allQ = form.sections.flatMap((s) => s.questions).filter((q) => !q.config?.isTitle && !q.config?.isPhoneNumber && q.label?.trim());
                          const headerSet = new Set(regUserData.headers);
                          const newMappings: Record<string, string> = { ...regUserData.mappings };
                          let matched = 0;
                          for (const q of allQ) {
                            if (!newMappings[q.id] && q.label && headerSet.has(q.label)) {
                              newMappings[q.id] = q.label;
                              matched++;
                            }
                          }
                          if (matched > 0) {
                            updateRegUserConfig({ mappings: newMappings });
                          } else {
                            alert("No exact matches found between question labels and column headers.");
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Auto-Match
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Import from Forms modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowImportModal(false)}>
          <div className="relative w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="text-sm font-semibold text-gray-900">
                {importSelectedFormId ? "Select Questions" : "Import Questions from Form"}
              </h3>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {importLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-500">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
                </div>
              ) : !importSelectedFormId ? (
                <>
                  <div className="relative mb-3">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={importFormSearch}
                      onChange={(e) => setImportFormSearch(e.target.value)}
                      placeholder="Search forms…"
                      className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  {importForms.filter(f => !importFormSearch || f.title.toLowerCase().includes(importFormSearch.toLowerCase())).length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-400">No other forms found.</p>
                  ) : (
                    <div className="space-y-1">
                      {importForms
                        .filter(f => !importFormSearch || f.title.toLowerCase().includes(importFormSearch.toLowerCase()))
                        .map(f => (
                          <button
                            key={f.id}
                            onClick={() => selectImportForm(f.id)}
                            className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-gray-50"
                          >
                            <span className="text-sm font-medium text-gray-800 truncate">{f.title}</span>
                            <span className="ml-2 shrink-0 text-xs text-gray-400">{f._count.questions} questions</span>
                          </button>
                        ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={() => setImportSelectedFormId(null)}
                    className="mb-3 flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                  >
                    <ArrowLeft className="h-3 w-3" /> Back to forms
                  </button>
                  {importQuestions.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-400">No questions in this form.</p>
                  ) : (
                    <>
                      <label className="mb-2 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={importSelectedQIds.size === importQuestions.length}
                          onChange={() => {
                            if (importSelectedQIds.size === importQuestions.length) {
                              setImportSelectedQIds(new Set());
                            } else {
                              setImportSelectedQIds(new Set(importQuestions.map(q => q.id)));
                            }
                          }}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Select all ({importQuestions.length})
                      </label>
                      <div className="space-y-1">
                        {importQuestions.map(q => (
                          <label key={q.id} className="flex items-start gap-2 rounded-lg px-3 py-2 hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importSelectedQIds.has(q.id)}
                              onChange={() => {
                                const next = new Set(importSelectedQIds);
                                if (next.has(q.id)) next.delete(q.id); else next.add(q.id);
                                setImportSelectedQIds(next);
                              }}
                              className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div className="min-w-0">
                              <p className="text-sm text-gray-800 truncate">{q.label || "(Untitled)"}</p>
                              <p className="text-xs text-gray-400">{QUESTION_TYPE_LABELS[q.type] || q.type}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {importSelectedFormId && importSelectedQIds.size > 0 && (
              <div className="border-t px-5 py-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">{importSelectedQIds.size} question{importSelectedQIds.size > 1 ? "s" : ""} selected → Section {activeSectionIndex + 1}</span>
                <button
                  onClick={handleImportQuestions}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  Import
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="relative my-8 w-full max-w-2xl">
            <button
              onClick={() => setShowPreview(false)}
              className="absolute -right-2 -top-2 z-10 rounded-full bg-white p-1.5 shadow-md hover:bg-gray-100"
            >
              <X className="h-5 w-5 text-gray-600" />
            </button>

            {/* Form header */}
            <div className="rounded-xl bg-gray-50 shadow-xl overflow-hidden">
              <div className="border-t-4 border-t-indigo-600 bg-white p-6 mb-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  {form.title}
                </h2>
                {form.description && !isRichTextEmpty(form.description) && (
                  <div className="mt-2 text-gray-600 prose prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_a]:text-indigo-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: sanitizeRichText(form.description) }} />
                )}
                <p className="mt-3 text-sm text-red-500">* Required</p>
              </div>

              {/* Preview questions */}
              <div className="space-y-4 px-4 pb-4">
                {form.sections.flatMap(s => s.questions).map((question) => {
                  const config = question.config;
                  const isPhone = Boolean(config?.isPhoneNumber);
                  if (config?.isTitle) {
                    const desc = (config.titleDescription as string) || "";
                    return (
                      <div key={question.id} className="rounded-xl bg-white p-6 shadow-sm border">
                        <h3 className="text-base font-medium text-gray-900">{question.label || "(Untitled)"}</h3>
                        {desc && !isRichTextEmpty(desc) && (
                          <div className="mt-1 text-sm text-gray-600 prose prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_a]:text-indigo-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: sanitizeRichText(desc) }} />
                        )}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={question.id}
                      className="rounded-xl bg-white p-6 shadow-sm border"
                    >
                      <label className="block text-base font-medium text-gray-900">
                        {question.label || "(Untitled)"}
                        {question.isRequired && (
                          <span className="text-red-500"> *</span>
                        )}
                      </label>
                      <div className="mt-3">
                        {(question.type === "SHORT_TEXT" || isPhone) && (
                          <input
                            type={isPhone ? "tel" : "text"}
                            disabled
                            className="block w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-400"
                            placeholder={isPhone ? "Phone number" : "Short answer"}
                          />
                        )}
                        {question.type === "PARAGRAPH" && !isPhone && (
                          <textarea
                            disabled
                            rows={3}
                            className="block w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-400"
                            placeholder="Long answer"
                          />
                        )}
                        {question.type === "MULTIPLE_CHOICE" && (
                          <div className="space-y-2">
                            {question.options.map((opt) => (
                              <label key={opt.id} className="flex items-center gap-3 p-1">
                                <input type="radio" disabled checked={config?.defaultValue === opt.value} className="h-4 w-4" />
                                <span className="text-sm text-gray-600">{opt.value}</span>
                              </label>
                            ))}
                          </div>
                        )}
                        {question.type === "CHECKBOX" && (
                          <div className="space-y-2">
                            {question.options.map((opt) => {
                              let cbChecked = false;
                              try { cbChecked = config?.defaultValue ? (JSON.parse(config.defaultValue as string) as string[]).includes(opt.value) : false; } catch { /* */ }
                              return (
                              <label key={opt.id} className="flex items-center gap-3 p-1">
                                <input type="checkbox" disabled checked={cbChecked} className="h-4 w-4 rounded" />
                                <span className="text-sm text-gray-600">{opt.value}</span>
                              </label>
                              );
                            })}
                          </div>
                        )}
                        {question.type === "DROPDOWN" && (
                          <select disabled value={config?.defaultValue as string || ""} className="block w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                            <option value="">Choose</option>
                            {question.options.map((opt) => (
                              <option key={opt.id} value={opt.value}>{opt.value}</option>
                            ))}
                          </select>
                        )}
                        {question.type === "LINEAR_SCALE" && (
                          <div className="flex items-center gap-3">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <label key={n} className="flex flex-col items-center gap-1">
                                <input type="radio" disabled className="h-4 w-4" />
                                <span className="text-xs text-gray-500">{n}</span>
                              </label>
                            ))}
                          </div>
                        )}
                        {isGridType(question.type) && (
                          <div className="overflow-x-auto mt-4">
                            <table className="w-full border-collapse text-left text-sm">
                              <thead>
                                <tr>
                                  <th className="border-b border-gray-200 py-3 pr-4 font-medium text-gray-500"></th>
                                  {question.config.grid?.columns?.map((col: { id: string, value: string }) => (
                                    <th key={col.id} className="border-b border-gray-200 px-4 py-3 text-center font-medium text-gray-500">
                                      {col.value}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {question.config.grid?.rows?.map((row: { id: string, value: string }) => (
                                  <tr key={row.id}>
                                    <td className="py-4 pr-4 font-medium text-gray-900">{row.value}</td>
                                    {question.config.grid?.columns?.map((col: { id: string, value: string }) => (
                                      <td key={col.id} className="px-4 py-4 text-center">
                                        <input
                                          type={question.type === "MULTIPLE_CHOICE_GRID" ? "radio" : "checkbox"}
                                          disabled
                                          className={`h-4 w-4 text-indigo-600 focus:ring-indigo-500 ${question.type === "CHECKBOX_GRID" ? "rounded" : ""}`}
                                        />
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {question.type === "RATING" && (
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star key={n} className="h-6 w-6 text-gray-300" />
                            ))}
                          </div>
                        )}
                        {question.type === "DATE" && (
                          <input type="date" disabled className="block w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-400" />
                        )}
                        {question.type === "TIME" && (
                          <input type="time" disabled className="block w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-400" />
                        )}
                        {question.type === "FILE_UPLOAD" && (
                          <div className="rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-center text-sm text-gray-400">
                            <Upload className="mx-auto mb-1 h-5 w-5" />
                            File upload
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 bg-gray-50">
                <button
                  disabled
                  className="rounded-lg bg-indigo-400 px-6 py-2.5 text-sm font-semibold text-white opacity-60"
                >
                  Submit (Preview)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FormBuilderPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="text-gray-500">Loading...</div></div>}>
      <FormBuilderPageInner />
    </Suspense>
  );
}
