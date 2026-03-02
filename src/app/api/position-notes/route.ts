/**
 * GET /api/position-notes - 取得所有備註
 * PATCH /api/position-notes - 更新單筆備註 (body: { positionId, notes })
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const NOTES_PATH = path.join(process.cwd(), 'data', 'position-notes.json');

async function readNotes(): Promise<Record<string, string>> {
  try {
    const s = await fs.readFile(NOTES_PATH, 'utf-8');
    const data = JSON.parse(s);
    return typeof data === 'object' && data !== null ? data : {};
  } catch {
    return {};
  }
}

async function writeNotes(notes: Record<string, string>): Promise<void> {
  const dir = path.dirname(NOTES_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(NOTES_PATH, JSON.stringify(notes, null, 2), 'utf-8');
}

export async function GET() {
  try {
    const notes = await readNotes();
    return NextResponse.json(notes);
  } catch (error) {
    console.error('讀取備註失敗:', error);
    return NextResponse.json({ error: '讀取失敗' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { positionId, notes } = body;
    if (!positionId || typeof positionId !== 'string') {
      return NextResponse.json({ error: '缺少 positionId' }, { status: 400 });
    }
    const notesValue = typeof notes === 'string' ? notes : '';
    const all = await readNotes();
    if (notesValue) {
      all[positionId] = notesValue;
    } else {
      delete all[positionId];
    }
    await writeNotes(all);
    return NextResponse.json(all);
  } catch (error) {
    console.error('儲存備註失敗:', error);
    return NextResponse.json({ error: '儲存失敗' }, { status: 500 });
  }
}
