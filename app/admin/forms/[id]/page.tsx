"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
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
  Pencil,
  Users,
  ExternalLink,
  MoreVertical,
  Check,
  Search,
  Hash,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
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

function SortableQuestion({
  question,
  qIndex,
  visualIndex,
  updateQuestion,
  removeQuestion,
  addOption,
  updateOption,
  removeOption,
}: {
  question: QuestionData;
  qIndex: number;
  visualIndex: number;
  updateQuestion: (index: number, updates: Partial<QuestionData>) => void;
  removeQuestion: (index: number) => void;
  addOption: (qIndex: number) => void;
  updateOption: (qIndex: number, oIndex: number, value: string) => void;
  removeOption: (qIndex: number, oIndex: number) => void;
}) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);

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

  return (
    <div
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
                updateQuestion(qIndex, { label: e.target.value })
              }
              className="flex-1 border-b border-transparent text-base font-medium text-gray-900 focus:border-indigo-500 focus:outline-none"
              placeholder="Question"
            />
          </div>

          {/* Type selector */}
          <div className="mt-3 flex items-center gap-3 w-full sm:w-auto">
            <select
              value={question.type}
              onChange={(e) =>
                updateQuestion(qIndex, {
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
                {question.options.map((opt, oIndex) => (
                  <div
                    key={opt.id}
                    className="flex items-center gap-2"
                  >
                    {question.type === "MULTIPLE_CHOICE" && (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                    )}
                    {question.type === "CHECKBOX" && (
                      <div className="h-4 w-4 rounded border-2 border-gray-300" />
                    )}
                    {question.type === "DROPDOWN" && (
                      <span className="text-sm text-gray-400">
                        {oIndex + 1}.
                      </span>
                    )}
                    <input
                      type="text"
                      value={opt.value}
                      onChange={(e) =>
                        updateOption(qIndex, oIndex, e.target.value)
                      }
                      className="flex-1 border-b border-transparent text-sm text-gray-700 focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      onClick={() => removeOption(qIndex, oIndex)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addOption(qIndex)}
                  className="text-sm text-indigo-600 hover:text-indigo-500"
                >
                  + Add option
                </button>
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
                        <div key={row.id} className="flex items-center gap-2">
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
                              updateQuestion(qIndex, { config: { ...question.config, grid: newGrid } });
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
                              updateQuestion(qIndex, { config: { ...question.config, grid: newGrid } });
                            }}
                            disabled={(question.config.grid?.rows?.length || 0) <= 1}
                            className={`rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-0`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const currentGrid = question.config.grid || { rows: [], columns: [] };
                          const newGrid = {
                            rows: [...(currentGrid.rows.length ? currentGrid.rows : [{ id: crypto.randomUUID(), value: "Row 1" }]), { id: crypto.randomUUID(), value: `Row ${(currentGrid.rows.length || 1) + 1}` }],
                            columns: currentGrid.columns.length ? currentGrid.columns : [{ id: crypto.randomUUID(), value: "Column 1" }]
                          };
                          updateQuestion(qIndex, { config: { ...question.config, grid: newGrid } });
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
                        <div key={col.id} className="flex items-center gap-2">
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
                              updateQuestion(qIndex, { config: { ...question.config, grid: newGrid } });
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
                              updateQuestion(qIndex, { config: { ...question.config, grid: newGrid } });
                            }}
                            disabled={(question.config.grid?.columns?.length || 0) <= 1}
                            className={`rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-0`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const currentGrid = question.config.grid || { rows: [], columns: [] };
                          const newGrid = {
                            rows: currentGrid.rows.length ? currentGrid.rows : [{ id: crypto.randomUUID(), value: "Row 1" }],
                            columns: [...(currentGrid.columns.length ? currentGrid.columns : [{ id: crypto.randomUUID(), value: "Column 1" }]), { id: crypto.randomUUID(), value: `Column ${(currentGrid.columns.length || 1) + 1}` }]
                          };
                          updateQuestion(qIndex, { config: { ...question.config, grid: newGrid } });
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
              <div className="rounded border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-400">
                <Upload className="mx-auto mb-1 h-5 w-5" />
                File upload
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full sm:w-auto items-center justify-end gap-2 sm:border-l sm:pl-3 pt-3 sm:pt-0 border-t sm:border-t-0 mt-3 sm:mt-0">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <span>Required</span>
            <button
              onClick={() =>
                updateQuestion(qIndex, {
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
                <div className="absolute bottom-full right-0 mb-2 w-48 rounded-lg bg-white shadow-xl ring-1 ring-black ring-opacity-5 z-20">
              <div className="py-1">
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
                      updateQuestion(qIndex, { config: newConfig });
                      setShowMoreMenu(false);
                    }}
                    className="flex w-full items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <span>Response validation</span>
                    {question.config?.validationEnabled && <Check className="h-3 w-3 text-indigo-600" />}
                  </button>
                )}
              </div>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => removeQuestion(qIndex)}
            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

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
              updateQuestion(qIndex, { config: newConfig });
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
              updateQuestion(qIndex, { config: newConfig });
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
                  updateQuestion(qIndex, { config: newConfig });
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
                  updateQuestion(qIndex, { config: newConfig });
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
                updateQuestion(qIndex, { config: newConfig });
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
              updateQuestion(qIndex, { config: newConfig });
            }}
            className="flex-1 min-w-[150px] rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
            placeholder="Custom error text"
          />
          <button
            onClick={() => {
              const newConfig = { ...question.config };
              newConfig.validationEnabled = false;
              delete newConfig.validation;
              updateQuestion(qIndex, { config: newConfig });
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

export default function FormBuilderPage() {
  const router = useRouter();
  const params = useParams();
  const formId = params.id as string;

  const [form, setForm] = useState<FormData | null>(null);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [activeTab, setActiveTab] = useState<"questions" | "responses">("questions");
  const [showPreview, setShowPreview] = useState(false);
  const [responses, setResponses] = useState<ResponseEntry[]>([]);
  const [responsesLoading, setResponsesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setForm((prev) => {
        if (!prev) return prev;
        
        const oldIndex = prev.questions.findIndex((q) => q.id === active.id);
        const newIndex = prev.questions.findIndex((q) => q.id === over.id);

        const newQuestions = [...prev.questions];
        const [movedQuestion] = newQuestions.splice(oldIndex, 1);
        newQuestions.splice(newIndex, 0, movedQuestion);

        // Update order property
        newQuestions.forEach((q, index) => {
          q.order = index;
        });

        return { ...prev, questions: newQuestions };
      });
    }
  };

  const fetchForm = useCallback(async () => {
    const res = await fetch(`/api/forms/${formId}`);
    if (res.ok) {
      const data = await res.json();
      const questions = data.questions.map((q: QuestionData & { config: string }) => ({
        ...q,
        config: typeof q.config === "string" ? JSON.parse(q.config) : q.config,
      }));
      setForm({ ...data, questions });
    }
  }, [formId]);

  useEffect(() => {
    fetchForm().finally(() => {
      setLoading(false);
      // Mark loaded after a tick so the first setForm from fetch doesn't trigger auto-save
      setTimeout(() => { loadedRef.current = true; }, 100);
    });
  }, [fetchForm]);

  // Auto-save debounce
  useEffect(() => {
    if (!loadedRef.current || !form) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaveStatus("saving");
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
            questions: form.questions.map((q) => ({
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
          }),
        });
        if (res.ok) {
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

  function addQuestion(type: QuestionType) {
    if (!form) return;
    const newQ: QuestionData = {
      id: tempId(),
      type,
      label: "",
      isRequired: false,
      order: form.questions.length,
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
    setForm({ ...form, questions: [...form.questions, newQ] });
    setShowTypeMenu(false);
  }

  function updateQuestion(index: number, updates: Partial<QuestionData>) {
    if (!form) return;
    const questions = [...form.questions];
    questions[index] = { ...questions[index], ...updates };
    setForm({ ...form, questions });
  }

  function removeQuestion(index: number) {
    if (!form) return;
    const q = form.questions[index];
    // Don't allow removing the locked phone number field
    if (q.config?.locked) {
      alert("The Phone Number field is required and cannot be removed.");
      return;
    }
    const questions = form.questions.filter((_, i) => i !== index);
    questions.forEach((q, i) => (q.order = i));
    setForm({ ...form, questions });
  }

  function addOption(qIndex: number) {
    if (!form) return;
    const questions = [...form.questions];
    const q = questions[qIndex];
    q.options.push({
      id: tempId(),
      value: `Option ${q.options.length + 1}`,
      order: q.options.length,
      group: "default",
    });
    setForm({ ...form, questions });
  }

  function updateOption(qIndex: number, oIndex: number, value: string) {
    if (!form) return;
    const questions = [...form.questions];
    questions[qIndex].options[oIndex].value = value;
    setForm({ ...form, questions });
  }

  function removeOption(qIndex: number, oIndex: number) {
    if (!form) return;
    const questions = [...form.questions];
    questions[qIndex].options = questions[qIndex].options.filter(
      (_, i) => i !== oIndex
    );
    questions[qIndex].options.forEach((o, i) => (o.order = i));
    setForm({ ...form, questions });
  }

  function moveQuestion(index: number, direction: "up" | "down") {
    if (!form) return;
    const questions = [...form.questions];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= questions.length) return;
    [questions[index], questions[target]] = [
      questions[target],
      questions[index],
    ];
    questions.forEach((q, i) => (q.order = i));
    setForm({ ...form, questions });
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
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-3 py-3 sm:px-4 sm:py-8">
        {activeTab === "questions" && (
          <>
        {/* Form title and description */}
        <div className="mb-3 rounded-lg border-t-4 border-t-indigo-600 bg-white p-3 shadow-sm sm:mb-6 sm:rounded-xl sm:p-6">
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full border-b border-transparent text-2xl font-bold text-gray-900 focus:border-indigo-500 focus:outline-none"
            placeholder="Form title"
          />
          <input
            type="text"
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            className="mt-2 w-full border-b border-transparent text-sm text-gray-500 focus:border-indigo-500 focus:outline-none"
            placeholder="Form description"
          />
        </div>

        {/* Questions */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
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

            <SortableContext
              items={form.questions.filter(q => !q.config?.isPhoneNumber).map((q) => q.id)}
              strategy={verticalListSortingStrategy}
            >
              {form.questions.filter(q => !q.config?.isPhoneNumber).map((question, qIndex) => {
                // We need to pass the real index from the full array to the handlers
                const realIndex = form.questions.findIndex(q => q.id === question.id);
                // Also pass a visual index for the UI (Q1, Q2, etc) ignoring the phone number
                return (
                  <SortableQuestion
                    key={question.id}
                    question={question}
                    qIndex={realIndex}
                    visualIndex={qIndex}
                    updateQuestion={updateQuestion}
                    removeQuestion={removeQuestion}
                    addOption={addOption}
                    updateOption={updateOption}
                    removeOption={removeOption}
                  />
                );
              })}
            </SortableContext>
          </div>
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

            {/* Import */}
            <button
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".json";
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file || !form) return;
                  try {
                    const text = await file.text();
                    const imported = JSON.parse(text);
                    if (Array.isArray(imported.questions)) {
                      const newQuestions = imported.questions.map(
                        (q: QuestionData, i: number) => ({
                          ...q,
                          id: tempId(),
                          order: form.questions.length + i,
                          options: (q.options || []).map(
                            (o: OptionData) => ({ ...o, id: tempId() })
                          ),
                        })
                      );
                      setForm({
                        ...form,
                        questions: [...form.questions, ...newQuestions],
                      });
                    }
                  } catch {
                    alert("Invalid JSON file.");
                  }
                };
                input.click();
              }}
              className="rounded-full p-2 text-gray-500 hover:bg-gray-100" title="Import questions from JSON"
            >
              <Import className="h-4 w-4" />
            </button>

            {/* Add Title */}
            <button
              onClick={() => {
                if (!form) return;
                const newQ: QuestionData = {
                  id: tempId(),
                  type: "SHORT_TEXT" as QuestionType,
                  label: "Section Title",
                  isRequired: false,
                  order: form.questions.length,
                  options: [],
                  config: { isTitle: true },
                };
                setForm({ ...form, questions: [...form.questions, newQ] });
              }}
              className="rounded-full p-2 text-gray-500 hover:bg-gray-100" title="Add Title"
            >
              <Heading className="h-4 w-4" />
            </button>

            {/* Add Image/Video */}
            <button
              onClick={() => {
                if (!form) return;
                const newQ: QuestionData = {
                  id: tempId(),
                  type: "FILE_UPLOAD" as QuestionType,
                  label: "Image / Video",
                  isRequired: false,
                  order: form.questions.length,
                  options: [],
                  config: { isMedia: true },
                };
                setForm({ ...form, questions: [...form.questions, newQ] });
              }}
              className="rounded-full p-2 text-gray-500 hover:bg-gray-100" title="Add Image/Video"
            >
              <Image className="h-4 w-4" />
            </button>

            {/* Add Section */}
            <button
              onClick={() => {
                if (!form) return;
                const newQ: QuestionData = {
                  id: tempId(),
                  type: "SHORT_TEXT" as QuestionType,
                  label: "New Section",
                  isRequired: false,
                  order: form.questions.length,
                  options: [],
                  config: { isSection: true },
                };
                setForm({ ...form, questions: [...form.questions, newQ] });
              }}
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
              <div className="relative flex-1 max-w-md">
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
      </div>

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
                {form.description && (
                  <p className="mt-2 text-gray-600">{form.description}</p>
                )}
                <p className="mt-3 text-sm text-red-500">* Required</p>
              </div>

              {/* Preview questions */}
              <div className="space-y-4 px-4 pb-4">
                {form.questions.map((question) => {
                  const config = question.config;
                  const isPhone = Boolean(config?.isPhoneNumber);
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
                                <input type="radio" disabled className="h-4 w-4" />
                                <span className="text-sm text-gray-600">{opt.value}</span>
                              </label>
                            ))}
                          </div>
                        )}
                        {question.type === "CHECKBOX" && (
                          <div className="space-y-2">
                            {question.options.map((opt) => (
                              <label key={opt.id} className="flex items-center gap-3 p-1">
                                <input type="checkbox" disabled className="h-4 w-4 rounded" />
                                <span className="text-sm text-gray-600">{opt.value}</span>
                              </label>
                            ))}
                          </div>
                        )}
                        {question.type === "DROPDOWN" && (
                          <select disabled className="block w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                            <option>Choose</option>
                            {question.options.map((opt) => (
                              <option key={opt.id}>{opt.value}</option>
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
