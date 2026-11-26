import type { AgentStatus } from 'claude-code'

export const GRAPH_TOOL = 'mcp__agents-board__pipeline_graph'
export const TASK_TOOL = 'mcp__agents-board__pipeline_task'
export const START_TOOL = 'mcp__agents-board__pipeline_start'
export const DONE_TOOL = 'mcp__agents-board__pipeline_done'
export const PIPELINE_TOOLS = new Set([GRAPH_TOOL, TASK_TOOL, START_TOOL, DONE_TOOL])
export const FIXED_ID = /^(cadrage|recherche|conclusion|audit-[a-z-]+)(-\d+)?$|^tests(-[a-z0-9-]+)?$/
export const TESTS_GROUP = 'tests:group'
export const TEST_TASK = /^tests-/
export const HIDDEN_STATUSES: Set<AgentStatus> = new Set(['running', 'completed', 'pending', 'waiting', 'idle'])
export const EARLY_STEPS = new Set(['tests', 'audit-cadrage', 'audit-proprete', 'audit-securite'])
export const SOLO_PREFIX = 'solo-'

export const READ_ONLY_AGENTS = new Set([
  'audit-proprete',
  'audit-securite',
  'audit-cadrage',
  'audit-asserts-code',
  'audit-asserts-cadrage',
  'Explore',
  'Plan',
])
export const SCOPED_WRITERS = new Set(['implementeur', 'tests'])
export const TASK_PLANNERS = new Set(['chercheur'])
export const EXECUTION_AGENT = 'audit-execution'
export const HOME_PATH = /^(~|\$\{?HOME\b)/
export const SAFE_COMMAND = /^[A-Za-z0-9_./=:@%+, -]+$/
export const PATTERN_PROGRAMS = new Set(['grep', 'rg', 'git grep'])
export const READ_ONLY_OPTIONS = new Map<string, { flags: string[]; valued: string[] }>([
  [
    'git diff',
    {
      flags: ['--cached', '--staged', '--stat', '--shortstat', '--numstat', '--name-only', '--name-status', '--no-color', '--no-ext-diff', '--no-textconv', '-w', '--ignore-all-space'],
      valued: ['--unified', '--diff-filter'],
    },
  ],
  ['git status', { flags: ['-s', '--short', '-b', '--branch', '--porcelain'], valued: [] }],
  [
    'git log',
    {
      flags: ['--oneline', '--stat', '-p', '--patch', '--name-only', '--name-status', '--no-merges', '--first-parent', '--all', '--graph', '--decorate', '--reverse', '--follow', '--no-color', '--no-ext-diff', '--no-textconv'],
      valued: ['-n', '--max-count', '--skip', '--format', '--pretty', '--since', '--until', '--author', '--grep'],
    },
  ],
  [
    'git show',
    {
      flags: ['--stat', '--name-only', '--name-status', '--oneline', '-s', '--no-patch', '--no-color', '--no-ext-diff', '--no-textconv'],
      valued: ['--format', '--pretty'],
    },
  ],
  ['git ls-files', { flags: ['--cached', '--modified', '--others', '--deleted', '--exclude-standard'], valued: [] }],
  [
    'git grep',
    {
      flags: ['-n', '--line-number', '-i', '--ignore-case', '-l', '--files-with-matches', '-c', '--count', '-w', '--word-regexp', '-v', '--invert-match', '-F', '--fixed-strings', '-E', '--extended-regexp', '--cached'],
      valued: ['-A', '-B', '-C'],
    },
  ],
  ['git blame', { flags: ['-w', '-s', '--porcelain', '--line-porcelain'], valued: ['-L'] }],
  [
    'grep',
    {
      flags: ['-r', '--recursive', '-n', '--line-number', '-i', '--ignore-case', '-l', '--files-with-matches', '-L', '--files-without-match', '-c', '--count', '-w', '--word-regexp', '-v', '--invert-match', '-F', '--fixed-strings', '-E', '--extended-regexp', '-H', '--with-filename', '-h', '--no-filename', '-o', '--only-matching', '-s', '--no-messages', '-q', '--quiet'],
      valued: ['-A', '-B', '-C', '-m', '--max-count'],
    },
  ],
  [
    'rg',
    {
      flags: ['-n', '--line-number', '-i', '--ignore-case', '-S', '--smart-case', '-s', '--case-sensitive', '-l', '--files-with-matches', '-c', '--count', '-w', '--word-regexp', '-v', '--invert-match', '-F', '--fixed-strings', '-o', '--only-matching', '--hidden', '--no-ignore', '--no-heading', '--heading'],
      valued: ['-A', '-B', '-C', '-m', '--max-count', '-t', '--type', '-T', '--type-not', '-g', '--glob', '--max-depth'],
    },
  ],
  ['ls', { flags: ['-l', '-a', '-A', '--all', '--almost-all', '-R', '--recursive', '-1', '-h', '--human-readable', '-t', '-r', '-S', '-d', '--directory', '-F'], valued: [] }],
  [
    'find',
    {
      flags: ['-print', '-print0', '-empty', '-prune', '-depth', '-o', '-a', '-not', '-true', '-false'],
      valued: ['-name', '-iname', '-path', '-ipath', '-regex', '-type', '-maxdepth', '-mindepth', '-size', '-mtime', '-mmin'],
    },
  ],
  ['cat', { flags: ['-n', '-b', '-A'], valued: [] }],
  ['head', { flags: [], valued: ['-n', '-c'] }],
  ['tail', { flags: [], valued: ['-n', '-c'] }],
  ['wc', { flags: ['-l', '-w', '-c', '-m', '-L', '--lines', '--words', '--bytes', '--chars'], valued: [] }],
  ['file', { flags: ['-b', '--brief', '-i', '--mime'], valued: [] }],
  ['stat', { flags: [], valued: ['-c', '--format'] }],
])
export const ALLOWED_HEADER = '## Commandes autorisées'
export const TEST_LAUNCHERS = new Set(['npm test', 'pnpm test', 'yarn test', 'bun test', 'deno test', 'go test ./...', 'cargo test', 'pytest', 'python -m pytest'])

export const UP = 1
export const DOWN = 2
export const LEFT = 4
export const RIGHT = 8
export const CROSS = 16
export const SCROLL_TICK_MS = 40
export const SCROLL_EASING = 4
export const WRITE_WAIT_MS = 15 * 60 * 1000
