import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const FONTS_DIR = join(process.cwd(), "public", "fonts");
const MANIFEST_PATH = join(FONTS_DIR, "fonts.json");
const MAX_FONT_SIZE = 2 * 1024 * 1024; // 2 MB

interface FontEntry {
  id: string;
  name: string;
  filename: string;
  createdAt: string;
}

async function ensureFontsDir() {
  try {
    await mkdir(FONTS_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

async function readManifest(): Promise<FontEntry[]> {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeManifest(entries: FontEntry[]) {
  await ensureFontsDir();
  await writeFile(MANIFEST_PATH, JSON.stringify(entries, null, 2));
}

// GET — list all custom fonts
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`fonts:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  // Allow any authenticated user to list fonts (needed for theme editor)
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const fonts = await readManifest();
  return NextResponse.json(fonts);
}

// POST — upload a new font (admin only)
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`fonts:${ip}`, true);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const fontName = (formData.get("name") as string || "").trim();

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!fontName) {
      return NextResponse.json({ error: "Font name is required" }, { status: 400 });
    }

    // Validate extension
    const ext = file.name?.split(".").pop()?.toLowerCase();
    if (ext !== "ttf") {
      return NextResponse.json({ error: "Only .ttf files are allowed" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (buffer.length > MAX_FONT_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 2 MB." }, { status: 400 });
    }

    // Check duplicate name
    const fonts = await readManifest();
    if (fonts.some((f) => f.name.toLowerCase() === fontName.toLowerCase())) {
      return NextResponse.json({ error: "A font with this name already exists" }, { status: 400 });
    }

    await ensureFontsDir();

    const filename = `${uuidv4()}.ttf`;
    await writeFile(join(FONTS_DIR, filename), buffer);

    const entry: FontEntry = {
      id: uuidv4(),
      name: fontName,
      filename,
      createdAt: new Date().toISOString(),
    };

    fonts.push(entry);
    await writeManifest(fonts);

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Font upload error:", error);
    return NextResponse.json({ error: "Failed to upload font" }, { status: 500 });
  }
}

// DELETE — remove a font by id (admin only)
export async function DELETE(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`fonts:${ip}`, true);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "Font id is required" }, { status: 400 });
    }

    const fonts = await readManifest();
    const font = fonts.find((f) => f.id === id);
    if (!font) {
      return NextResponse.json({ error: "Font not found" }, { status: 404 });
    }

    // Delete file
    try {
      await unlink(join(FONTS_DIR, font.filename));
    } catch {
      // file may already be gone
    }

    const updated = fonts.filter((f) => f.id !== id);
    await writeManifest(updated);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Font delete error:", error);
    return NextResponse.json({ error: "Failed to delete font" }, { status: 500 });
  }
}
