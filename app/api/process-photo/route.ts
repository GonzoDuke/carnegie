import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { SpineRead } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SPINE_PROMPT = `Look at this photo of a bookshelf. For each visible book spine, reading left to right, extract:
1. Title (as printed on the spine)
2. Author (as printed on the spine)
3. Publisher (if visible)
4. Any other identifiers (edition info, series branding)

For each spine, rate your confidence:
- HIGH: title and author are clearly legible
- MEDIUM: partially readable, some guessing involved
- LOW: very difficult to read, substantial uncertainty

If a spine is completely unreadable, include it with confidence LOW and describe its physical appearance (color, size, position) so the reviewer can identify it.

Return ONLY a JSON array (no prose, no markdown fences) of objects with fields: position (1-indexed integer), title (string), author (string), publisher (string or empty), confidence ("HIGH"|"MEDIUM"|"LOW"), note (string, optional — only when confidence is LOW or there is something unusual).`;

function extractJsonArray(text: string): unknown {
  // Strip markdown fences if present
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  // Find the first [ ... ]
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('No JSON array in model response');
  return JSON.parse(t.slice(start, end + 1));
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not set' },
      { status: 500 }
    );
  }

  let imageBase64: string;
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

  try {
    const form = await req.formData();
    const file = form.get('image');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    imageBase64 = buf.toString('base64');

    const type = (file.type || '').toLowerCase();
    if (type === 'image/png') mediaType = 'image/png';
    else if (type === 'image/webp') mediaType = 'image/webp';
    else if (type === 'image/gif') mediaType = 'image/gif';
    else mediaType = 'image/jpeg';
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid form data', details: String(err) },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imageBase64 },
            },
            { type: 'text', text: SPINE_PROMPT },
          ],
        },
      ],
    });

    const textBlock = resp.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'Empty model response' }, { status: 502 });
    }

    let raw: unknown;
    try {
      raw = extractJsonArray(textBlock.text);
    } catch (err) {
      return NextResponse.json(
        { error: 'Could not parse JSON from model', text: textBlock.text },
        { status: 502 }
      );
    }

    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { error: 'Model did not return an array' },
        { status: 502 }
      );
    }

    const spines: SpineRead[] = raw.map((r: any, i: number) => {
      const title = String(r.title ?? '').trim();
      const author = String(r.author ?? '').trim();
      const publisher = String(r.publisher ?? '').trim();
      const confidence =
        r.confidence === 'HIGH' || r.confidence === 'MEDIUM' || r.confidence === 'LOW'
          ? r.confidence
          : 'LOW';
      const note = r.note ? String(r.note) : undefined;
      const position = Number.isFinite(r.position) ? Number(r.position) : i + 1;
      const rawText = [title, author].filter(Boolean).join(' — ') || (note ?? '');
      return {
        position,
        rawText,
        title,
        author,
        publisher,
        confidence,
        note,
      };
    });

    return NextResponse.json({ spines });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Vision API error', details: err?.message ?? String(err) },
      { status: 502 }
    );
  }
}
