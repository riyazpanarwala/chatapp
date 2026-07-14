import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;

const ALLOWED_TYPES = new Map([
  ['.jpg', new Set(['image/jpeg'])],
  ['.jpeg', new Set(['image/jpeg'])],
  ['.png', new Set(['image/png'])],
  ['.gif', new Set(['image/gif'])],
  ['.webp', new Set(['image/webp'])],
  ['.pdf', new Set(['application/pdf'])],
  ['.txt', new Set(['text/plain'])],
  ['.csv', new Set(['text/csv', 'application/vnd.ms-excel'])],
  ['.zip', new Set(['application/zip', 'application/x-zip-compressed'])],
  ['.doc', new Set(['application/msword'])],
  ['.docx', new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])],
  ['.xls', new Set(['application/vnd.ms-excel'])],
  ['.xlsx', new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])],
  ['.ppt', new Set(['application/vnd.ms-powerpoint'])],
  ['.pptx', new Set(['application/vnd.openxmlformats-officedocument.presentationml.presentation'])],
]);

function validationError(file) {
  const extension = path.extname(file.name || '').toLowerCase();
  const allowedMimes = ALLOWED_TYPES.get(extension);
  if (!allowedMimes || !allowedMimes.has(file.type)) {
    return `${file.name || 'File'} has an unsupported file type`;
  }
  if (file.size <= 0) return `${file.name} is empty`;
  if (file.size > MAX_FILE_SIZE) return `${file.name} exceeds the 10 MB limit`;
  return null;
}

export async function POST(request) {
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_FILES * MAX_FILE_SIZE + 1024 * 1024) {
      return NextResponse.json({ error: 'Upload request is too large' }, { status: 413 });
    }

    const formData = await request.formData();
    const files = formData.getAll('file').filter(value => value instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: 'No files were provided' }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Upload at most ${MAX_FILES} files at once` }, { status: 400 });
    }

    for (const file of files) {
      const error = validationError(file);
      if (error) return NextResponse.json({ error }, { status: 415 });
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadDir, { recursive: true });

    const results = [];
    for (const file of files) {
      const extension = path.extname(file.name).toLowerCase();
      const filename = `${Date.now()}-${randomUUID()}${extension}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(uploadDir, filename), buffer, { flag: 'wx' });
      results.push({ url: `/uploads/${filename}`, name: path.basename(file.name), size: file.size });
    }

    return NextResponse.json({ files: results });
  } catch (error) {
    console.error('Upload failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
