import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { getSession } from "@/lib/auth";
import { HEADER_IMAGE_MAX_BYTES, ALLOWED_IMAGE_TYPES, ALLOWED_IMAGE_EXTENSIONS } from "@/lib/theme";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Size check: 5 MB max
    if (buffer.length > HEADER_IMAGE_MAX_BYTES) {
      return NextResponse.json({ error: "File too large. Maximum size is 5 MB." }, { status: 400 });
    }

    // Derive extension from original filename, fallback to jpg
    let ext = "jpg";
    if (file.name) {
      const parts = file.name.split(".");
      if (parts.length > 1) {
        const rawExt = parts.pop()!.toLowerCase();
        if (ALLOWED_IMAGE_EXTENSIONS.has(rawExt)) ext = rawExt;
      }
    }

    const filename = `${uuidv4()}.${ext}`;
    const uploadDir = join(process.cwd(), "public", "uploads");

    // Ensure upload directory exists
    try {
      await mkdir(uploadDir, { recursive: true });
    } catch (err) {
      // Ignore if directory already exists
    }

    const filePath = join(uploadDir, filename);
    await writeFile(filePath, buffer);

    const publicPath = `/uploads/${filename}`;
    return NextResponse.json({ path: publicPath });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
