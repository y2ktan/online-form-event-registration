import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitize } from "@/lib/sanitize";
import { isGridType } from "@/lib/question-types";
import { generateShortCode } from "@/lib/short-code";

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

function validateAnswer(
  questionLabel: string,
  questionType: string,
  value: string,
  config: QuestionConfig
): string | null {
  if (!config?.validationEnabled || !config.validation) {
    return null;
  }

  const validation = config.validation;
  const { type, rule, value: ruleValue, maxValue, errorMessage } = validation;

  const getError = (defaultMsg: string) => errorMessage || `"${questionLabel}": ${defaultMsg}`;

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
  if (type === "CHECKBOX" && questionType === "CHECKBOX") {
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

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`submit:${ip}`, true);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { formId, phoneNumber, answers } = body;

    if (!formId || !answers) {
      return NextResponse.json(
        { error: "Form ID and answers are required." },
        { status: 400 }
      );
    }

    // Verify form exists and is published
    const form = await prisma.form.findUnique({
      where: { id: formId },
      include: {
        questions: { orderBy: { order: "asc" } },
      },
    });

    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }

    if (form.collectPhone && (!phoneNumber || !sanitize(phoneNumber).trim())) {
      return NextResponse.json(
        { error: "Phone number is required." },
        { status: 400 }
      );
    }

    // Identify phone number question IDs to exclude from answer processing
    const phoneQuestionIds = new Set<string>();
    for (const question of form.questions) {
      let config: QuestionConfig = {};
      try {
        config = typeof question.config === "string" ? JSON.parse(question.config) : (question.config as QuestionConfig ?? {});
      } catch { /* ignore parse errors */ }
      if (config.isPhoneNumber) {
        phoneQuestionIds.add(question.id);
        continue;
      }

      const answer = answers[question.id];
      const answerValue = typeof answer === "string" ? answer : JSON.stringify(answer);

      // Check required field
      if (question.isRequired) {
        if (isGridType(question.type as any)) {
          try {
            const gridAnswers = JSON.parse(answerValue);
            const rows = config.grid?.rows || [];
            
            if (rows.length === 0) {
              // Should not happen with proper UI but safety first
              if (!answer || answerValue === "{}" || answerValue === "[]") {
                return NextResponse.json(
                  { error: `"${question.label}" is required.` },
                  { status: 400 }
                );
              }
            } else {
              for (const row of rows) {
                const rowAnswer = gridAnswers[row.id];
                if (!rowAnswer || (Array.isArray(rowAnswer) && rowAnswer.length === 0)) {
                  return NextResponse.json(
                    { error: `"${question.label}": Each row requires a response.` },
                    { status: 400 }
                  );
                }
              }
            }
          } catch (e) {
            return NextResponse.json(
              { error: `"${question.label}" is required.` },
              { status: 400 }
            );
          }
        } else {
          if (!answer || (typeof answer === "string" && !answer.trim()) || answer === "[]") {
            return NextResponse.json(
              { error: `"${question.label}" is required.` },
              { status: 400 }
            );
          }
        }
      }

      // Check validation rules (only if answer is provided)
      if (answer && answerValue && answerValue.trim() && answerValue !== "[]") {
        const validationError = validateAnswer(question.label, question.type, answerValue, config);
        if (validationError) {
          return NextResponse.json(
            { error: validationError },
            { status: 400 }
          );
        }
      }
    }

    // Filter out phone number question from answers before saving
    const filteredAnswers = Object.entries(answers as Record<string, unknown>).filter(
      ([questionId]) => !phoneQuestionIds.has(questionId)
    );

    // Generate unique short code for this submission
    const shortCode = await generateShortCode(formId);

    // Create response with answers
    const response = await prisma.response.create({
      data: {
        form: { connect: { id: formId } },
        shortCode,
        phoneNumber: form.collectPhone ? sanitize(phoneNumber) : null,
        answers: {
          create: filteredAnswers.map(
            ([questionId, value]) => ({
              question: { connect: { id: questionId } },
              value: typeof value === "string" ? sanitize(value) : JSON.stringify(value),
            })
          ),
        },
      },
      include: { answers: true },
    });

    return NextResponse.json({
      success: true,
      responseId: response.id,
      editToken: response.editToken,
      shortCode: response.shortCode,
    });
  } catch (error) {
    console.error("Submit error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to submit form.", details: message },
      { status: 500 }
    );
  }
}
