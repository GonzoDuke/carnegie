import { NextRequest, NextResponse } from 'next/server';
import { lookupBook } from '@/lib/book-lookup';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { title?: string; author?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = (body.title ?? '').trim();
  const author = (body.author ?? '').trim();

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const result = await lookupBook(title, author);
  return NextResponse.json(result);
}
