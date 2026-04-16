import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('file');

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!existsSync(uploadDir)) await mkdir(uploadDir, { recursive: true });

    const results = [];
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const ext = path.extname(file.name) || '';
      const fname = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      await writeFile(path.join(uploadDir, fname), buffer);
      results.push({ url: `/uploads/${fname}`, name: file.name, size: file.size });
    }

    return NextResponse.json({ files: results });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


