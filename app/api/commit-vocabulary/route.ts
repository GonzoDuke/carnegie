import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const REPO = process.env.GITHUB_REPO || 'GonzoDuke/carnegie';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const VOCAB_PATH = 'lib/tag-vocabulary.json';
const CHANGELOG_PATH = 'lib/vocabulary-changelog.md';
// The placeholder marker the changelog ships with — new entries get inserted
// just above it so the auto-append note stays at the bottom.
const TRAILING_COMMENT =
  '<!-- New entries will be appended below automatically by the approve command -->';

interface CommitBody {
  vocabularyJson: string;
  changelogEntries: string;
  newTagCount: number;
  /**
   * Optional override for the commit message. Lets non-promotion edits
   * (manual add from the Vocabulary screen, tag deletion) describe
   * themselves accurately instead of being labeled "promote N new tags".
   */
  commitMessage?: string;
}

// ---------------------------------------------------------------------------
// GitHub API plumbing
//
// This route writes BOTH lib/tag-vocabulary.json and lib/vocabulary-changelog.md
// in a SINGLE Git commit via the low-level Trees API. The previous Contents-
// API implementation did two sequential PUTs, which split atomicity — a
// transient 500 on the second write left the vocabulary updated in production
// but the changelog missing the matching entry. The Trees flow eliminates that
// drift: blobs and trees are dangling-but-unreferenced until the final ref
// PATCH lands, so any pre-PATCH failure is a no-op on the visible repo state.
// ---------------------------------------------------------------------------

async function ghFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = process.env.GITHUB_TOKEN!;
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'carnegie-vocabulary-bot',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
}

async function ghFetchOrThrow(path: string, init?: RequestInit): Promise<Response> {
  const r = await ghFetch(path, init);
  if (!r.ok) {
    const text = await r.text();
    throw new Error(
      `GitHub ${init?.method ?? 'GET'} ${path}: ${r.status} ${text.slice(0, 300)}`
    );
  }
  return r;
}

interface RefResponse {
  object: { sha: string; type: string };
}
interface CommitResponse {
  sha: string;
  tree: { sha: string };
  html_url: string;
}
interface TreeResponse {
  sha: string;
  tree: { path: string; sha: string }[];
}
interface BlobResponse {
  sha: string;
}

async function getRefSha(): Promise<string> {
  const r = await ghFetchOrThrow(
    `/repos/${REPO}/git/ref/heads/${encodeURIComponent(BRANCH)}`
  );
  const data = (await r.json()) as RefResponse;
  return data.object.sha;
}

async function getCommit(sha: string): Promise<CommitResponse> {
  const r = await ghFetchOrThrow(`/repos/${REPO}/git/commits/${sha}`);
  return (await r.json()) as CommitResponse;
}

async function getTree(sha: string): Promise<TreeResponse> {
  const r = await ghFetchOrThrow(`/repos/${REPO}/git/trees/${sha}`);
  return (await r.json()) as TreeResponse;
}

async function getBlobUtf8(sha: string): Promise<string> {
  const r = await ghFetchOrThrow(`/repos/${REPO}/git/blobs/${sha}`);
  const data = (await r.json()) as { content?: string; encoding?: string };
  if (!data.content) return '';
  // git/blobs always returns base64 in practice, but defend either way.
  if (data.encoding === 'utf-8') return data.content;
  return Buffer.from(data.content, 'base64').toString('utf8');
}

async function createBlob(content: string): Promise<string> {
  const r = await ghFetchOrThrow(`/repos/${REPO}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({
      content: Buffer.from(content, 'utf8').toString('base64'),
      encoding: 'base64',
    }),
  });
  const data = (await r.json()) as BlobResponse;
  return data.sha;
}

async function createTree(
  baseTreeSha: string,
  entries: { path: string; blobSha: string }[]
): Promise<string> {
  const r = await ghFetchOrThrow(`/repos/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: entries.map((e) => ({
        path: e.path,
        mode: '100644',
        type: 'blob',
        sha: e.blobSha,
      })),
    }),
  });
  const data = (await r.json()) as { sha: string };
  return data.sha;
}

async function createCommit(
  message: string,
  treeSha: string,
  parentSha: string
): Promise<{ sha: string; html_url: string }> {
  const r = await ghFetchOrThrow(`/repos/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentSha],
    }),
  });
  const data = (await r.json()) as { sha: string; html_url: string };
  return data;
}

interface UpdateRefOutcome {
  ok: boolean;
  status: number;
  conflict: boolean; // 422 fast-forward conflict
  errorBody?: string;
}

async function tryUpdateRef(commitSha: string): Promise<UpdateRefOutcome> {
  const r = await ghFetch(
    `/repos/${REPO}/git/refs/heads/${encodeURIComponent(BRANCH)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ sha: commitSha, force: false }),
    }
  );
  if (r.ok) return { ok: true, status: r.status, conflict: false };
  const text = await r.text();
  // 422 with "not a fast forward" → concurrent writer landed between our
  // ref-read and ref-update. Anything else (5xx, 403, 401, etc.) → return
  // up the stack as a hard failure; we don't retry on those.
  const conflict =
    r.status === 422 &&
    /not a fast forward|fast-forward|stale/i.test(text);
  return { ok: false, status: r.status, conflict, errorBody: text.slice(0, 300) };
}

// ---------------------------------------------------------------------------
// Changelog assembly — same logic as before. Splitting it out keeps the
// commit orchestration readable.
// ---------------------------------------------------------------------------
function appendChangelog(current: string, newEntries: string): string {
  const trimmed = newEntries.trim();
  if (current.includes(TRAILING_COMMENT)) {
    return current.replace(
      TRAILING_COMMENT,
      `${trimmed}\n\n${TRAILING_COMMENT}`
    );
  }
  return current.trimEnd() + '\n\n' + trimmed + '\n';
}

// Lightweight availability probe so the client can render the right button.
// Returns 200 with `{ available: false }` rather than 501 — easier on fetch.
export async function GET() {
  return NextResponse.json({
    available: !!process.env.GITHUB_TOKEN,
    repo: REPO,
    branch: BRANCH,
  });
}

export async function POST(req: NextRequest) {
  if (!process.env.GITHUB_TOKEN) {
    // Client should fall back to the manual download workflow on 501.
    return NextResponse.json(
      { available: false, error: 'GITHUB_TOKEN not configured' },
      { status: 501 }
    );
  }

  let body: CommitBody;
  try {
    body = (await req.json()) as CommitBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (
    typeof body.vocabularyJson !== 'string' ||
    typeof body.changelogEntries !== 'string' ||
    typeof body.newTagCount !== 'number' ||
    !Number.isFinite(body.newTagCount) ||
    body.newTagCount < 0
  ) {
    return NextResponse.json({ error: 'Bad body shape' }, { status: 400 });
  }
  if (!body.vocabularyJson.trim() || !body.changelogEntries.trim()) {
    return NextResponse.json({ error: 'Empty payload' }, { status: 400 });
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const tagWord = body.newTagCount === 1 ? 'tag' : 'tags';
  const message =
    typeof body.commitMessage === 'string' && body.commitMessage.trim()
      ? `${body.commitMessage.trim()} (${dateStr})`
      : `Vocabulary: promote ${body.newTagCount} new ${tagWord} (${dateStr})`;

  try {
    // 1) Build the two new blobs first. Blob create is content-addressed:
    // posting the same bytes twice returns the same SHA, so we can compute
    // these once even if a fast-forward conflict forces us to rebuild the
    // tree on a new parent. That makes the retry path cheap.
    const vocabBlobSha = await createBlob(body.vocabularyJson);

    // The changelog needs the CURRENT remote content to compute its append.
    // We'll re-read it inside buildAndPush so the retry path picks up any
    // intervening changelog edits from another writer.
    const buildAndPush = async (): Promise<{
      commit: { sha: string; html_url: string };
      attempted: 'first' | 'retry';
    }> => {
      // 2) Resolve current ref → commit → tree.
      const parentSha = await getRefSha();
      const parentCommit = await getCommit(parentSha);
      const baseTreeSha = parentCommit.tree.sha;

      // 3) Read the current changelog blob from this tree so the append is
      // computed against the actual head, not whatever we last cached.
      const baseTree = await getTree(baseTreeSha);
      const changelogEntry = baseTree.tree.find((t) => t.path === 'lib');
      let currentChangelog = '';
      if (changelogEntry) {
        // Walk down into lib/ to find vocabulary-changelog.md.
        const libTree = await getTree(changelogEntry.sha);
        const cl = libTree.tree.find(
          (t) => t.path === 'vocabulary-changelog.md'
        );
        if (cl) currentChangelog = await getBlobUtf8(cl.sha);
      }
      const updatedChangelog = appendChangelog(
        currentChangelog,
        body.changelogEntries
      );
      const changelogBlobSha = await createBlob(updatedChangelog);

      // 4) Stage both files into a new tree on top of the parent tree.
      const newTreeSha = await createTree(baseTreeSha, [
        { path: VOCAB_PATH, blobSha: vocabBlobSha },
        { path: CHANGELOG_PATH, blobSha: changelogBlobSha },
      ]);

      // 5) Create the commit.
      const commit = await createCommit(message, newTreeSha, parentSha);

      // 6) Fast-forward the branch ref onto the new commit. Single retry on
      // 422 fast-forward conflict only — refetch ref, rebuild tree on the
      // new parent, recreate commit, retry. Blob SHAs are content-addressed
      // so they don't need rebuilding.
      const first = await tryUpdateRef(commit.sha);
      if (first.ok) return { commit, attempted: 'first' };
      if (!first.conflict) {
        throw new Error(
          `GitHub PATCH ref: ${first.status} ${first.errorBody ?? ''}`
        );
      }
      // Conflict path: rebuild on the new parent and try once more. This
      // call recursively walks the same path with a fresh ref read.
      const retry = await rebuildAndUpdate();
      return { commit: retry, attempted: 'retry' };
    };

    // The retry helper. Identical shape to the inner block of buildAndPush
    // sans the retry trigger — keeps recursion shallow (max depth 1).
    const rebuildAndUpdate = async (): Promise<{
      sha: string;
      html_url: string;
    }> => {
      const parentSha = await getRefSha();
      const parentCommit = await getCommit(parentSha);
      const baseTreeSha = parentCommit.tree.sha;
      const baseTree = await getTree(baseTreeSha);
      const libEntry = baseTree.tree.find((t) => t.path === 'lib');
      let currentChangelog = '';
      if (libEntry) {
        const libTree = await getTree(libEntry.sha);
        const cl = libTree.tree.find(
          (t) => t.path === 'vocabulary-changelog.md'
        );
        if (cl) currentChangelog = await getBlobUtf8(cl.sha);
      }
      const updatedChangelog = appendChangelog(
        currentChangelog,
        body.changelogEntries
      );
      const changelogBlobSha = await createBlob(updatedChangelog);
      const newTreeSha = await createTree(baseTreeSha, [
        { path: VOCAB_PATH, blobSha: vocabBlobSha },
        { path: CHANGELOG_PATH, blobSha: changelogBlobSha },
      ]);
      const commit = await createCommit(message, newTreeSha, parentSha);
      const second = await tryUpdateRef(commit.sha);
      if (second.ok) return commit;
      throw new Error(
        `GitHub PATCH ref (after fast-forward retry): ${second.status} ${second.errorBody ?? ''}`
      );
    };

    const { commit } = await buildAndPush();

    // Single Git commit covers both paths now. We return the same shape as
    // before — `commits: [{ path, url, sha }, ...]` — but both entries share
    // the same commit URL/SHA. Existing client renderers (export page lists
    // each path with its link) still work; both links point at the same diff.
    return NextResponse.json({
      ok: true,
      newTagCount: body.newTagCount,
      commits: [
        { path: VOCAB_PATH, sha: commit.sha, url: commit.html_url },
        { path: CHANGELOG_PATH, sha: commit.sha, url: commit.html_url },
      ],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[commit-vocabulary] failed:', message);
    return NextResponse.json(
      { error: 'GitHub API error', details: message },
      { status: 502 }
    );
  }
}
