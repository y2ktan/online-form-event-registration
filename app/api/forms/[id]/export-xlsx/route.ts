import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, canEditForm } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { ensureRegisteredUserDataTable } from "../registered-user-data/_ensure-table";
import {
  buildSummaryFromGrouped,
  parseConfig,
  type QuestionRecord,
  type GroupedCount,
  type SectionSummary,
} from "@/lib/summary-helpers";
import {
  generateXlsxBuffer,
  type XlsxResponse,
  type XlsxQuestion,
  type UserProfileData,
} from "@/lib/xlsx-export";

// Text/file types that need sample values
const SAMPLE_TYPES = new Set([
  "SHORT_TEXT", "PARAGRAPH", "DATE", "TIME", "FILE_UPLOAD", "SELFIE",
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`export-xlsx:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const hasAccess = await canEditForm(session.userId, session.role, id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    // 1. Load form with sections + questions
    const form = await (prisma.form.findUnique as Function)({
      where: { id },
      include: {
        sections: {
          orderBy: { order: "asc" },
          include: {
            questions: {
              orderBy: { order: "asc" },
              include: { options: { orderBy: { order: "asc" } } },
            },
          },
        },
      },
    }) as {
      title: string;
      collectPhone: boolean;
      sections: {
        id: string;
        title: string;
        order: number;
        questions: {
          id: string;
          label: string;
          type: string;
          config: string;
        }[];
      }[];
    } | null;

    if (!form) {
      return NextResponse.json({ error: "Form not found." }, { status: 404 });
    }

    // Build flat questions (filter out phone/media/title)
    const allQuestions: (QuestionRecord & { sectionId: string })[] = [];
    for (const section of form.sections) {
      for (const q of section.questions) {
        const cfg = parseConfig(q.config);
        if (cfg.isPhoneNumber || cfg.isTitle || cfg.isMedia) continue;
        allQuestions.push({
          id: q.id,
          type: q.type,
          label: q.label,
          config: cfg,
          sectionId: section.id,
        });
      }
    }

    const csvQuestions: XlsxQuestion[] = allQuestions.map((q) => ({
      id: q.id,
      label: q.label,
      type: q.type,
      config: q.config,
    }));

    // 2. Load all responses
    const responses = await prisma.response.findMany({
      where: { formId: id },
      include: { answers: { select: { questionId: true, value: true } } },
      orderBy: { createdAt: "asc" },
    });
    const totalResponses = responses.length;

    const xlsxData: XlsxResponse[] = responses.map((r) => ({
      shortCode: r.shortCode,
      phoneNumber: r.phoneNumber,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      answers: r.answers.map((a) => ({ questionId: a.questionId, value: a.value })),
      isNewUser: false,
    }));

    // 3. Cross-reference registered user data
    let includeNewUser = false;
    let userProfile: UserProfileData | undefined;

    try {
      await ensureRegisteredUserDataTable();
      const regData = await (prisma as any).registeredUserData.findUnique({
        where: { formId: id },
        select: { rows: true, headers: true, lookupColumn: true, lookupQuestionId: true },
      });
      if (regData?.lookupColumn && regData?.lookupQuestionId) {
        includeNewUser = true;
        const regRows: Record<string, string>[] = JSON.parse(regData.rows);
        const regHeaders: string[] = JSON.parse(regData.headers);
        const registeredValues = new Set<string>();
        for (const row of regRows) {
          const v = String(row[regData.lookupColumn] ?? "").trim().toLowerCase();
          if (v) registeredValues.add(v);
        }

        // Mark new users in responses
        const respondedValues = new Set<string>();
        for (const entry of xlsxData) {
          const lookupAnswer = entry.answers.find(
            (a) => a.questionId === regData.lookupQuestionId
          );
          const val = (lookupAnswer?.value ?? "").trim().toLowerCase();
          entry.isNewUser = !val || !registeredValues.has(val);
          if (val) respondedValues.add(val);
        }

        let respondedRegistered = 0;
        let notYetRegistered = 0;
        for (const rv of registeredValues) {
          if (respondedValues.has(rv)) respondedRegistered++;
          else notYetRegistered++;
        }

        userProfile = {
          stats: {
            userProfileCount: regRows.length,
            respondedRegistered,
            notYetRegistered,
            newUsers: totalResponses - respondedRegistered,
            totalResponses,
          },
          headers: regHeaders,
          rows: regRows,
          lookupColumn: regData.lookupColumn,
          respondedValues,
        };
      } else if (regData) {
        // User profile uploaded but lookup not configured
        const regRows: Record<string, string>[] = JSON.parse(regData.rows);
        const regHeaders: string[] = JSON.parse(regData.headers);
        userProfile = {
          stats: {
            userProfileCount: regRows.length,
            respondedRegistered: 0,
            notYetRegistered: 0,
            newUsers: 0,
            totalResponses,
          },
          headers: regHeaders,
          rows: regRows,
          lookupColumn: "",
          respondedValues: new Set(),
        };
      }
    } catch {
      // Registered user data table may not exist — skip
    }

    // 4. Build summary data for analytics sheet
    const questionIds = allQuestions.map((q) => q.id);
    const grouped = await (prisma.answer.groupBy as Function)({
      by: ["questionId", "value"],
      where: { questionId: { in: questionIds } },
      _count: { value: true },
    }) as Array<{ questionId: string; value: string; _count: { value: number } }>;

    const normalisedGrouped: GroupedCount[] = grouped.map((g) => ({
      questionId: g.questionId,
      value: g.value,
      _count: g._count.value,
    }));

    // Sample values for text/file questions
    const sampleQuestionIds = allQuestions
      .filter((q) => SAMPLE_TYPES.has(q.type))
      .map((q) => q.id);
    const samplesByQuestion = new Map<string, string[]>();
    if (sampleQuestionIds.length > 0) {
      const sampleAnswers = await prisma.answer.findMany({
        where: { questionId: { in: sampleQuestionIds }, value: { not: "" } },
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

    const allSummaries = buildSummaryFromGrouped(
      normalisedGrouped,
      allQuestions,
      samplesByQuestion,
    );
    const summaryMap = new Map(allSummaries.map((s) => [s.questionId, s]));

    const sectionSummaries: SectionSummary[] = form.sections.map((sec) => ({
      id: sec.id,
      title: sec.title,
      order: sec.order,
      questions: sec.questions
        .map((q) => summaryMap.get(q.id))
        .filter((s): s is NonNullable<typeof s> => !!s),
    }));

    // 5. Build base URL for absolute links
    const baseUrl =
      process.env.APP_URL?.replace(/\/+$/, "") ||
      (() => {
        const proto = request.headers.get("x-forwarded-proto") || "https";
        const host = request.headers.get("host") || "localhost:3000";
        return `${proto}://${host}`;
      })();

    // 6. Generate XLSX buffer
    const xlsxBuffer = await generateXlsxBuffer({
      responses: xlsxData,
      questions: csvQuestions,
      includePhone: form.collectPhone,
      baseUrl,
      includeNewUser,
      sections: sectionSummaries,
      totalResponses,
      userProfile,
    });

    const safeTitle = (form.title || "responses").replace(/[^a-zA-Z0-9-_ ]/g, "").slice(0, 50);

    return new NextResponse(xlsxBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeTitle}.xlsx"`,
      },
    });
  } catch (err) {
    console.error("GET /api/forms/[id]/export-xlsx error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
