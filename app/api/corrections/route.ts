import { NextRequest, NextResponse } from 'next/server';
import {
  correctionsMatch,
  mergeCorrectionAdditions,
  type CorrectionEntry,
} from '@/lib/corrections-log';

export const runtime = 'nodejs';
export const maxDuration = 30;

const REPO = process.env.GITHUB_REPO || 'GonzoDuke/carnegie';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const CORRECTIONS_PATH = 'data/corrections-log.json';

interface PostBody {
  add?: CorrectionEntry[];
  remove?: CorrectionEntry[];
  clearAll?: boolean;
}

interface GhFile {
  content?: string;
  sha: string;
  encoding?: string;
}

interface GhCommitResponse {
  content?: { path: string; sha: string };
  commit?: { sha: string; html_url: string; message: string };
}

async function ghFetch(path: string, init?: RequestInit) {
  const token = process.env.GITHUB_TOKEN!;
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'carnegie-corrections-bot',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  return res;
}

function isCorrectionEntry(e: unknown): e is CorrectionEntry {
  if (!e || typeof e !== 'object') return false;
  const c = e as Partial<CorrectionEntry>;
  return (
    typeof c.title === 'string' &&
    typeof c.author === 'string' &&
    typeof c.lcc === 'string' &&
    Array.isArray(c.systemSuggestedTags) &&
    typeof c.timestamp === 'string' &&
    (typeof c.removedTag === 'string' || typeof c.addedTag === 'string')
  );
}

interface FetchedCorrections {
  entries: CorrectionEntry[];
  sha: string | null;
}

async function fetchCorrections(): Promise<FetchedCorrections> {
  const r = await ghFetch(
    `/repos/${REPO}/contents/${CORRECTIONS_PATH}?ref=${encodeURIComponent(BRANCH)}`
  );
  if (r.status === 404) {
    return { entries: [], sha: null };
  }
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`GitHub GET ${CORRECTIONS_PATH}: ${r.status} ${text.slice(0, 300)}`);
  }
  const file = (await r.json()) as GhFile;
  const decoded = file.content
    ? Buffer.from(file.content, 'base64').toString('utf8')
    : '[]';
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    parsed = [];
  }
  const entries = Array.isArray(parsed)
    ? (parsed.filter(isCorrectionEntry) as CorrectionEntry[])
    : [];
  return { entries, sha: file.sha };
}

async function putCorrections(
  entries: CorrectionEntry[],
  sha: string | null,
  message: string
): Promise<GhCommitResponse> {
  const json = JSON.stringify(entries, null, 2) + '\n';
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(json, 'utf8').toString('base64'),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  const r = await ghFetch(`/repos/${REPO}/contents/${CORRECTIONS_PATH}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`GitHub PUT ${CORRECTIONS_PATH}: ${r.status} ${text.slice(0, 300)}`);
  }
  return (await r.json()) as GhCommitResponse;
}

export async function GET() {
  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json({ available: false, entries: [] });
  }
  try {
    const { entries, sha } = await fetchCorrections();
    return NextResponse.json({
      available: true,
      entries,
      sha,
      repo: REPO,
      branch: BRANCH,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[corrections GET] failed:', message);
    return NextResponse.json(
      { available: true, error: 'GitHub API error', details: message },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json(
      { available: false, error: 'GITHUB_TOKEN not configured' },
      { status: 501 }
    );
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const additions = Array.isArray(body.add) ? body.add.filter(isCorrectionEntry) : [];
  const removals = Array.isArray(body.remove) ? body.remove.filter(isCorrectionEntry) : [];
  const clearAll = body.clearAll === true;

  if (!clearAll && additions.length === 0 && removals.length === 0) {
    return NextResponse.json({ error: 'Empty delta' }, { status: 400 });
  }

  try {
    const { entries: current, sha } = await fetchCorrections();

    let next: CorrectionEntry[] = current;
    if (clearAll) {
      next = [];
    } else {
      if (removals.length > 0) {
        next = next.filter((e) => !removals.some((r) => correctionsMatch(e, r)));
      }
      if (additions.length > 0) {
        next = mergeCorrectionAdditions(next, additions);
      }
    }

    if (
      next.length === current.length &&
      next.every((e, i) => correctionsMatch(e, current[i]))
    ) {
      return NextResponse.json({
        available: true,
        entries: next,
        sha,
        unchanged: true,
        repo: REPO,
        branch: BRANCH,
      });
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const messageParts: string[] = [];
    if (clearAll) messageParts.push('clear');
    if (removals.length > 0) {
      messageParts.push(
        `remove ${removals.length} ${removals.length === 1 ? 'entry' : 'entries'}`
      );
    }
    if (additions.length > 0) {
      messageParts.push(
        `add ${additions.length} ${additions.length === 1 ? 'entry' : 'entries'}`
      );
    }
    const message = `Corrections: ${messageParts.join('; ')} (${dateStr})`;

    const commit = await putCorrections(next, sha, message);

    return NextResponse.json({
      available: true,
      entries: next,
      sha: commit.content?.sha ?? null,
      commit: { url: commit.commit?.html_url, sha: commit.commit?.sha },
      repo: REPO,
      branch: BRANCH,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[corrections POST] failed:', message);
    return NextResponse.json(
      { available: true, error: 'GitHub API error', details: message },
      { status: 502 }
    );
  }
}
