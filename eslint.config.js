// ESLint flat config (ADR-0002 §2). Copied from the sibling image-annotator and adapted to Clip Maker:
// TypeScript, accessibility, the suite's ban on network and storage APIs (PRN-01, NFR-01, INV-01)
// extended with `navigator.storage`, `showSaveFilePicker`, `caches`, WebAssembly (D-032) and shared
// memory (ADR-0003 §6), with the exceptions ADR-0002 names per module:
//   - `fetch` only in MOD-Assets (src/assets, own-origin manifest paths, ADR-0014) and sw.js;
//   - `navigator.storage` / the origin-private file system only in MOD-Scratch (src/scratch, ADR-0010);
//   - `showSaveFilePicker`, object URLs and `download` only in MOD-Export (and the app's hand-over);
//   - Cache Storage only in sw.js (ADR-0015);
//   - only MOD-Host reaches the parent window and the service worker;
//   - only MOD-Container imports the container library (DEP-04, ADR-0005);
//   - only MOD-App registers `beforeunload` (F-018).
// Downloads use `blob:` URLs, never `data:` URLs (portal tool contract, MOD-Host). No `autofocus`.
// No dynamic `import()` (ADR-0002: every code file loads at start-up). Module import boundaries follow
// architecture.md "Dependency rules" and each module spec's `depends_on`.
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

const NET = 'NFR-01: no network requests from the tool (ADR-0002; fetch only in MOD-Assets, ADR-0014)';
const STORE = 'INV-01 / PRN-01: nothing is persisted (ADR-0002; OPFS only in MOD-Scratch, ADR-0010)';

const NETWORK_AND_STORAGE = [
  ['fetch', NET],
  ['XMLHttpRequest', NET],
  ['WebSocket', NET],
  ['EventSource', NET],
  ['localStorage', STORE],
  ['sessionStorage', STORE],
  ['indexedDB', STORE],
  ['caches', `${STORE} (Cache Storage belongs to /sw.js only, ADR-0015)`],
  ['showSaveFilePicker', 'ADR-0002: showSaveFilePicker only in MOD-Export'],
  ['BroadcastChannel', 'PRN-01: nothing leaves this page'],
  ['open', 'PRN-01: no navigation that could carry content'],
  ['WebAssembly', "D-032: no WebAssembly at runtime (CSP has no 'wasm-unsafe-eval')"],
  ['SharedArrayBuffer', 'ADR-0003 §6: no shared memory (no cross-origin isolation)'],
].map(([name, message]) => ({ name, message }));

/** Globals each owning module may use (removed from its ban list). */
const OWN_GLOBALS = { assets: ['fetch'], export: ['showSaveFilePicker'], sw: ['fetch', 'caches'] };

// Windows outside the tool: only MOD-Host may reach them (ADR-0002 §4).
const OTHER_WINDOWS = ['parent', 'top', 'opener'];
const HOST_ONLY = 'Only MOD-Host may reach other windows or the service worker (ADR-0002, ADR-0015).';
const OTHER_WINDOW_GLOBALS = OTHER_WINDOWS.map((name) => ({ name, message: HOST_ONLY }));
const OTHER_WINDOW_PROPERTIES = ['window', 'self', 'globalThis'].flatMap((object) =>
  OTHER_WINDOWS.map((property) => ({ object, property, message: HOST_ONLY })),
);
const SERVICE_WORKER = [{ object: 'navigator', property: 'serviceWorker', message: HOST_ONLY }];

const NETWORK_PROPERTIES = [
  { object: 'navigator', property: 'sendBeacon', message: NET },
  { object: 'window', property: 'fetch', message: NET },
  { object: 'self', property: 'fetch', message: NET },
  { object: 'globalThis', property: 'fetch', message: NET },
  { object: 'document', property: 'cookie', message: STORE },
  { object: 'window', property: 'localStorage', message: STORE },
  { object: 'window', property: 'sessionStorage', message: STORE },
  { object: 'window', property: 'indexedDB', message: STORE },
  { object: 'window', property: 'showSaveFilePicker', message: 'ADR-0002: showSaveFilePicker only in MOD-Export' },
  { object: 'self', property: 'importScripts', message: 'NFR-01: no remote scripts' },
  { object: 'window', property: 'open', message: 'PRN-01: no navigation that could carry content' },
  { object: 'location', property: 'assign', message: 'PRN-01: no navigation that could carry content' },
  { object: 'location', property: 'replace', message: 'PRN-01: no navigation that could carry content' },
];
const STORAGE_PROPERTIES = [{ object: 'navigator', property: 'storage', message: STORE }];

// Object URLs and downloads: MOD-Export hands the file over; MOD-App owns the visible link.
const HANDOVER_ONLY = 'Only MOD-Export / MOD-App create object URLs and downloads (ADR-0010).';
const HANDOVER_PROPERTIES = [{ object: 'URL', property: 'createObjectURL', message: HANDOVER_ONLY }];
const HANDOVER_SYNTAX = [
  "JSXAttribute[name.name='download']",
  "AssignmentExpression[left.property.name='download']",
].map((selector) => ({ selector, message: HANDOVER_ONLY }));
// Leave-page warning: MOD-App only (architecture.md "Dependency rules").
const APP_ONLY = 'Only MOD-App registers beforeunload (F-018, architecture.md).';
const APP_SYNTAX = [
  "CallExpression[callee.property.name='addEventListener'][arguments.0.value='beforeunload']",
  "CallExpression[callee.name='addEventListener'][arguments.0.value='beforeunload']",
  "AssignmentExpression[left.property.name='onbeforeunload']",
].map((selector) => ({ selector, message: APP_ONLY }));

// HTML injection, navigation by assignment (CSP has no navigate-to), data: URLs for downloads,
// autofocus, dynamic import, and postMessage to another window.
const BANNED_SYNTAX = [
  ["NewExpression[callee.name='Image']", `${NET}: no new Image()`],
  ['MemberExpression[property.name=/^(innerHTML|outerHTML)$/]', 'ADR-0002: no innerHTML / outerHTML'],
  ["CallExpression[callee.property.name='insertAdjacentHTML']", 'ADR-0002: no insertAdjacentHTML'],
  ["JSXAttribute[name.name='dangerouslySetInnerHTML']", 'ADR-0002: no innerHTML'],
  ["AssignmentExpression[left.type='Identifier'][left.name='location']", 'PRN-01: no navigation'],
  ["AssignmentExpression[left.property.name='location']", 'PRN-01: no navigation'],
  ["AssignmentExpression[left.object.name='location']", 'PRN-01: no navigation'],
  ["AssignmentExpression[left.object.property.name='location']", 'PRN-01: no navigation'],
  [
    "CallExpression[callee.object.property.name='location'][callee.property.name=/^(assign|replace)$/]",
    'PRN-01: no navigation',
  ],
  ['Literal[value=/^data:/i]', 'Portal tool contract: downloads use blob: URLs, never data: URLs'],
  ['TemplateElement[value.raw=/^data:/i]', 'Portal tool contract: downloads use blob: URLs, never data: URLs'],
  [
    'JSXAttribute[name.name=/^auto[fF]ocus$/]',
    'Portal tool contract: never autofocus (MOD-Host focuses on first focus)',
  ],
  ['ImportExpression', 'ADR-0002: no dynamic import() — every code file loads at start-up'],
].map(([selector, message]) => ({ selector, message }));
const OTHER_WINDOW_POST = [
  "CallExpression[callee.property.name='postMessage'][callee.object.name=/^(parent|top|opener)$/]",
  "CallExpression[callee.property.name='postMessage'][callee.object.property.name=/^(parent|top|opener)$/]",
].map((selector) => ({ selector, message: HOST_ONLY }));

const CONTAINER_ONLY = 'Only MOD-Container imports the container library (DEP-04, ADR-0005).';

/**
 * Import boundary for one module folder: relative imports may reach only its own folder and the
 * listed sibling module folders (architecture.md "Dependency rules"); `dom: false` also bans the UI
 * packages (pure modules); only `container` may import mediabunny.
 */
function boundary(mod, folder, allowed, { dom = true, signals = dom } = {}) {
  const others = allowed.length ? `(?!(?:${allowed.join('|')})(?:/|$))` : '';
  const patterns = [
    {
      regex: `^\\.\\./${others}`,
      message: `${mod} may import only ${allowed.length ? allowed.map((a) => `src/${a}`).join(', ') : 'its own folder'} (architecture.md "Dependency rules").`,
    },
    { regex: '^\\.\\./\\.\\./', message: `${mod}: import sibling modules as ../<module>, never deeper.` },
  ];
  if (folder !== 'container')
    patterns.push({ group: ['mediabunny', 'mediabunny/*', '@mediabunny/*'], message: CONTAINER_ONLY });
  else patterns.push({ group: ['@mediabunny/*'], message: 'ADR-0005: no @mediabunny/* extensions' });
  if (!dom) patterns.push({ group: ['preact', 'preact/*'], message: `${mod} imports no DOM code.` });
  if (!signals) patterns.push({ group: ['@preact/*'], message: `${mod} is pure: no signals.` });
  return { files: [`src/${folder}/**`], rules: { 'no-restricted-imports': ['error', { patterns }] } };
}

/** The ban rules for page and worker source, with one module's own allowances lifted. */
function bans({ host = false, storage = false, handover = false, app = false, globals = [] } = {}) {
  return {
    'no-restricted-globals': [
      'error',
      ...NETWORK_AND_STORAGE.filter(({ name }) => !globals.includes(name)),
      ...(host ? [] : OTHER_WINDOW_GLOBALS),
    ],
    'no-restricted-properties': [
      'error',
      ...NETWORK_PROPERTIES,
      ...(storage ? [] : STORAGE_PROPERTIES),
      ...(host ? [] : [...OTHER_WINDOW_PROPERTIES, ...SERVICE_WORKER]),
      ...(handover ? [] : HANDOVER_PROPERTIES),
    ],
    'no-restricted-syntax': [
      'error',
      ...BANNED_SYNTAX,
      ...(host ? [] : OTHER_WINDOW_POST),
      ...(handover ? [] : HANDOVER_SYNTAX),
      ...(app ? [] : APP_SYNTAX),
    ],
  };
}

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'dist-e2e/',
      'release/',
      'node_modules/',
      'test-results/',
      'playwright-report/',
      '.lighthouseci/',
      '.wrangler/',
      '.claude/',
      '.build-my-app/',
      'design/',
      'tests/fixtures/',
      '**/*.gen.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  { files: ['src/**/*.{ts,tsx}'], ...jsxA11y.flatConfigs.recommended },
  { files: ['src/**/*.{ts,tsx,js}'], rules: bans() },
  // Module-scoped allowances (ADR-0002 §2).
  { files: ['src/host/**'], rules: bans({ host: true }) },
  { files: ['src/assets/**'], rules: bans({ globals: OWN_GLOBALS.assets }) },
  { files: ['src/scratch/**'], rules: bans({ storage: true }) },
  { files: ['src/export/**'], rules: bans({ handover: true, globals: OWN_GLOBALS.export }) },
  { files: ['src/app/**'], rules: bans({ handover: true, app: true }) },
  // The offline service worker (ADR-0015) alone may use Cache Storage and forward the browser's
  // own requests; it never runs in the page.
  { files: ['src/host/sw.ts'], rules: bans({ host: true, globals: OWN_GLOBALS.sw }) },
  // Module boundaries (architecture.md "Dependency rules"; module specs' depends_on).
  boundary('MOD-Core', 'core', [], { dom: false }),
  boundary('MOD-Plan', 'plan', ['core'], { dom: false }),
  boundary('MOD-Project', 'project', ['core'], { dom: false, signals: true }),
  boundary('MOD-Media', 'media', ['core', 'container', 'codec'], { dom: false }),
  boundary('MOD-Container', 'container', ['core'], { dom: false }),
  boundary('MOD-Codec', 'codec', ['core'], { dom: false }),
  boundary('MOD-Engine', 'engine', ['core', 'plan', 'container', 'codec', 'compositor'], { dom: false }),
  boundary('MOD-Compositor', 'compositor', ['core', 'plan'], { dom: false }),
  boundary('MOD-Audio', 'audio', ['core', 'plan', 'container', 'codec'], { dom: false }),
  boundary('MOD-Export', 'export', ['core', 'plan', 'container', 'codec', 'engine', 'compositor', 'audio', 'scratch'], {
    dom: false,
  }),
  boundary('MOD-Scratch', 'scratch', [], { dom: false }),
  boundary('MOD-Assets', 'assets', ['core'], { dom: false }),
  boundary('MOD-Timeline', 'timeline', ['core', 'project', 'media']),
  boundary('MOD-Preview', 'preview', ['core', 'project']),
  boundary('MOD-Keys', 'keys', ['core'], { dom: false }),
  boundary('MOD-Copy', 'copy', [], { dom: false, signals: true }),
  boundary('MOD-Host', 'host', ['core', 'copy'], { dom: false, signals: true }),
  boundary('MOD-App', 'app', [
    'core',
    'project',
    'media',
    'codec',
    'engine',
    'audio',
    'export',
    'assets',
    'timeline',
    'preview',
    'keys',
    'host',
    'copy',
  ]),
  {
    // The boot script is a classic inline script (MOD-Host).
    files: ['src/host/boot.js'],
    languageOptions: { sourceType: 'script' },
    rules: { 'no-empty': 'off', 'no-var': 'off', '@typescript-eslint/no-unused-vars': 'off' },
  },
);
