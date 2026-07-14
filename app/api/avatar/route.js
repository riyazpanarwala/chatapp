import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATARS = new Map([
  ['.jpg', new Set(['image/jpeg'])],
  ['.jpeg', new Set(['image/jpeg'])],
  ['.png', new Set(['image/png'])],
  ['.gif', new Set(['image/gif'])],
  ['.webp', new Set(['image/webp'])],
]);

export async function POST(request) {
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_AVATAR_SIZE + 256 * 1024) {
      return NextResponse.json({ error: 'Avatar upload is too large' }, { status: 413 });
    }

    const formData = await request.formData();
    const files = formData.getAll('file').filter(value => value instanceof File);
    if (files.length !== 1) {
      return NextResponse.json({ error: 'Provide exactly one avatar image' }, { status: 400 });
    }

    const file = files[0];
    const extension = path.extname(file.name || '').toLowerCase();
    const allowedMimes = ALLOWED_AVATARS.get(extension);
    if (!allowedMimes?.has(file.type) || file.size <= 0 || file.size > MAX_AVATAR_SIZE) {
      return NextResponse.json({ error: 'Avatar must be a JPG, PNG, GIF, or WebP image no larger than 5 MB' }, { status: 415 });
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadDir, { recursive: true });
    const filename = `${Date.now()}-${randomUUID()}${extension}`;
    await writeFile(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()), { flag: 'wx' });
    return NextResponse.json({ files: [{ url: `/uploads/${filename}`, name: path.basename(file.name), size: file.size }] });
  } catch (error) {
    console.error('Avatar upload failed:', error);
    return NextResponse.json({ error: 'Avatar upload failed' }, { status: 500 });
  }
}
