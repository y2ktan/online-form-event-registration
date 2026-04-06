import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, canEditForm } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  buildSummaryFromGrouped,
  parseConfig,
  type QuestionRecord,
  type GroupedCount,
  type SectionSummary,
} from "@/lib/summary-helpers";
import { ensureRegisteredUserDataTable } from "../registered-user-data/_ensure-table";

// Text/file types that need sample values instead of full groupBy
const SAMPLE_TYPES = new Set([
  "SHORT_TEXT",
  "PARAGRAPH",
  "DATE",
  "TIME",
  "FILE_UPLOAD",
  "SELFIE",
]);

/**
 * GET /api/forms/[id]/summary
 *
 * Returns server-aggregated question summaries grouped by section,
 * plus total response count and optional user-profile count.
 *
 * Response shape:
 * {
 *   sections: SectionSummary[],
 *   totalResponses: number,
 *   userProfileCount: number | null
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: formId } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`summary:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const hasAccess = await canEditForm(session.userId, session.role, formId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // 1. Sections + questions + options (single joined query)
    const sections = await prisma.section.findMany({
      where: { formId },
      orderBy: { order: "asc" },
      include: {
        questions: {
          orderBy: { order: "asc" },
          include: { options: { orderBy: { order: "asc" } } },
        },
      },
    });

    // Build a flat question list for the aggregation helper
    const allQuestions: (QuestionRecord & { sectionId: string | null })[] = [];
    for (const section of sections) {
      for (const q of section.questions) {
        allQuestions.push({
          id: q.id,
          type: q.type,
          label: q.label,
          config: parseConfig(q.config),
          sectionId: section.id,
        });
      }
    }

    // 2. groupBy for choice/scale/grid counts (one round-trip for all)
    const questionIds = allQuestions.map((q) => q.id);
    const grouped = await (prisma.answer.groupBy as Function)({
      by: ["questionId", "value"],
      where: {
        questionId: { in: questionIds },
      },
      _count: { value: true },
    }) as Array<{ questionId: string; value: string; _count: { value: number } }>;

    // Normalise _count shape to flat { _count: number }
    const normalisedGrouped: GroupedCount[] = grouped.map((g) => ({
      questionId: g.questionId,
      value: g.value,
      _count: g._count.value,
    }));

    // 3. Sample values for text/file questions (capped at 300 each)
    const sampleQuestionIds = allQuestions
      .filter((q) => SAMPLE_TYPES.has(q.type))
      .map((q) => q.id);

    const samplesByQuestion = new Map<string, string[]>();
    if (sampleQuestionIds.length > 0) {
      const sampleAnswers = await prisma.answer.findMany({
        where: {
          questionId: { in: sampleQuestionIds },
          value: { not: "" },
        },
        select: { questionId: true, value: true },
        orderBy: { id: "desc" },
        take: sampleQuestionIds.length * 300,
      });
      for (const a of sampleAnswers) {
        if (!samplesByQuestion.has(a.questionId))
          samplesByQuestion.set(a.questionId, []);
        const arr = samplesByQuestion.get(a.questionId)!;
        if (arr.length < 300) arr.push(a.value);
      }
    }

    // 4. Build per-question summaries
    const allSummaries = buildSummaryFromGrouped(
      normalisedGrouped,
      allQuestions,
      samplesByQuestion
    );

    // Index summaries by questionId for O(1) lookup
    const summaryMap = new Map(allSummaries.map((s) => [s.questionId, s]));

    // 5. Group into sections
    const sectionSummaries: SectionSummary[] = sections.map((sec) => ({
      id: sec.id,
      title: sec.title,
      order: sec.order,
      questions: sec.questions
        .map((q) => summaryMap.get(q.id))
        .filter((s): s is NonNullable<typeof s> => !!s),
    }));

    // 6. Total response count
    const totalResponses = await prisma.response.count({ where: { formId } });

    // 7. Cross-reference registered users vs actual responses
    let userProfileCount: number | null = null;
    let respondedRegistered = 0;
    let notYetRegistered = 0;
    let newUsers = 0;
    try {
      await ensureRegisteredUserDataTable();
      const regData = await (prisma as any).registeredUserData.findUnique({
        where: { formId },
        select: { rows: true, lookupColumn: true, lookupQuestionId: true },
      });
      if (regData) {
        const rows: Record<string, string>[] = JSON.parse(regData.rows);
        userProfileCount = rows.length;
        const lookupCol: string = regData.lookupColumn || "";
        const lookupQid: string = regData.lookupQuestionId || "";
        if (lookupCol && lookupQid) {
          const registeredValues = new Set<string>();
          for (const row of rows) {
            const v = String(row[lookupCol] ?? "").trim().toLowerCase();
            if (v) registeredValues.add(v);
          }
          const answerRows = await prisma.answer.findMany({
            where: { questionId: lookupQid, response: { formId } },
            select: { value: true },
          });
          const respondedValues = new Set<string>();
          for (const a of answerRows) {
            const v = (a.value ?? "").trim().toLowerCase();
            if (v) respondedValues.add(v);
          }
          for (const rv of registeredValues) {
            if (respondedValues.has(rv)) respondedRegistered++;
            else notYetRegistered++;
          }
          // Any response not matched to a registered user = new user
          // (includes blank/missing lookup answers)
          newUsers = totalResponses - respondedRegistered;
        }
      }
    } catch {
      // Table may not exist yet — safe to ignore
    }

    return NextResponse.json({
      sections: sectionSummaries,
      totalResponses,
      userProfileCount,
      respondedRegistered,
      notYetRegistered,
      newUsers,
    });
  } catch (err) {
    console.error("GET /api/forms/[id]/summary error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
