import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { getSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as Blob | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `${uuidv4()}.jpg`;
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
