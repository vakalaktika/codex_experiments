import { authenticate } from '../_shared/auth.ts'
import { corsHeaders, fail, json, preflight } from '../_shared/cors.ts'

/**
 * Read-only GitHub reads for a linked project.
 *
 * Exists for the same reason as generate-prompt: the PAT cannot live in a
 * static bundle. It is also where caching happens — a 60s edge cache plus
 * ETag passthrough keeps the project detail screen well clear of GitHub's
 * rate limit when it is polled. See docs/ARCHITECTURE.md §2.
 *
 * Strictly read-only. Nothing here writes to GitHub, so a stolen JWT buys an
 * attacker the ability to read repos the PAT can already read, and nothing else.
 */

const GITHUB_API = 'https://api.github.com'
const CACHE_SECONDS = 60
const MAX_ISSUES = 30

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Re-validated here even though the schema has matching CHECK constraints:
// these two values are interpolated into a URL, and the boundary that builds
// the request is the right place to be sure they cannot escape the path.
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const REPO = /^[A-Za-z0-9._-]{1,100}$/

type Resource = 'issues' | 'readme'

interface Issue {
  number: number
  title: string
  state: string
  html_url: string
  comments: number
  updated_at: string
  user: { login: string } | null
  labels: Array<{ name: string; color: string }>
}

function isResource(value: unknown): value is Resource {
  return value === 'issues' || value === 'readme'
}

function githubHeaders(token: string, request: Request, accept: string) {
  const headers: Record<string, string> = {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'idea-capture-pwa',
  }

  // Pass the caller's validator through so an unchanged resource costs GitHub
  // a 304 rather than a rate-limited body.
  const ifNoneMatch = request.headers.get('If-None-Match')
  if (ifNoneMatch) headers['If-None-Match'] = ifNoneMatch

  return headers
}

Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options

  if (request.method !== 'POST') return fail(request, 'Use POST.', 405)

  const token = Deno.env.get('GITHUB_PAT')
  if (!token) {
    console.error('GITHUB_PAT is not set on this function.')
    return fail(request, 'GitHub access is not configured.', 503)
  }

  const caller = await authenticate(request)
  if (!caller) return fail(request, 'Sign in to view repository data.', 401)

  let projectId: unknown
  let resource: unknown
  try {
    const body = (await request.json()) as { project_id?: unknown; resource?: unknown }
    projectId = body?.project_id
    resource = body?.resource
  } catch {
    return fail(request, 'Expected a JSON body.', 400)
  }

  if (typeof projectId !== 'string' || !UUID.test(projectId)) {
    return fail(request, 'project_id must be a uuid.', 400)
  }
  if (!isResource(resource)) {
    return fail(request, 'resource must be "issues" or "readme".', 400)
  }

  // RLS means a project id the caller doesn't own simply isn't found — this
  // is what stops the proxy reading arbitrary repos on someone's behalf.
  const { data: project, error } = await caller.db
    .from('projects')
    .select('github_owner, github_repo')
    .eq('id', projectId)
    .maybeSingle<{ github_owner: string | null; github_repo: string | null }>()

  if (error) {
    console.error('project lookup failed', error.message)
    return fail(request, 'Could not load that project.', 500)
  }
  if (!project) return fail(request, 'Project not found.', 404)

  const { github_owner: owner, github_repo: repo } = project
  if (!owner || !repo) return fail(request, 'This project has no linked repository.', 400)
  if (!OWNER.test(owner) || !REPO.test(repo)) {
    return fail(request, 'This project has an invalid repository link.', 400)
  }

  const url =
    resource === 'issues'
      ? `${GITHUB_API}/repos/${owner}/${repo}/issues?state=open&per_page=${MAX_ISSUES}&sort=updated`
      : `${GITHUB_API}/repos/${owner}/${repo}/readme`

  const accept =
    resource === 'issues' ? 'application/vnd.github+json' : 'application/vnd.github.raw'

  let upstream: Response
  try {
    upstream = await fetch(url, { headers: githubHeaders(token, request, accept) })
  } catch (cause) {
    console.error('github fetch failed', cause)
    return fail(request, 'GitHub was unreachable. Try again in a moment.', 502)
  }

  const etag = upstream.headers.get('ETag')
  const cacheHeaders: Record<string, string> = {
    'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
    ...(etag ? { ETag: etag } : {}),
  }

  if (upstream.status === 304) {
    // A 304 carries no body, so it gets the CORS headers without the JSON
    // content type. Reusing corsHeaders keeps the origin allow list applied.
    return new Response(null, {
      status: 304,
      headers: { ...corsHeaders(request), ...cacheHeaders },
    })
  }

  if (upstream.status === 404) {
    return fail(
      request,
      resource === 'readme'
        ? 'This repository has no README.'
        : 'That repository could not be found. Check the link, or the token’s access to it.',
      404,
    )
  }

  if (upstream.status === 403 || upstream.status === 429) {
    // Distinguishing rate limit from permission matters: one resolves itself.
    const rateLimited = upstream.headers.get('X-RateLimit-Remaining') === '0'
    return fail(
      request,
      rateLimited
        ? 'GitHub rate limit reached. This will recover on its own shortly.'
        : 'The configured token cannot read that repository.',
      rateLimited ? 429 : 403,
    )
  }

  if (!upstream.ok) {
    console.error('github returned', upstream.status)
    return fail(request, 'GitHub returned an unexpected error.', 502)
  }

  if (resource === 'readme') {
    const markdown = await upstream.text()
    return json(request, { readme: markdown }, 200, cacheHeaders)
  }

  const raw = (await upstream.json()) as Array<Issue & { pull_request?: unknown }>

  // The issues endpoint includes pull requests; the Issues tab should not.
  const issues = raw
    .filter((issue) => issue.pull_request === undefined)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      html_url: issue.html_url,
      comments: issue.comments,
      updated_at: issue.updated_at,
      author: issue.user?.login ?? null,
      labels: issue.labels.map((label) => ({ name: label.name, color: label.color })),
    }))

  return json(request, { issues }, 200, cacheHeaders)
})
