// Dependency-free packaging of our own source modules into a single offline page.
// Handles multi-line imports and `as` aliases. No third-party dependencies.
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (!target) throw Error('Pass an explicit output directory.');

const files = ['src/engine.mjs', 'src/stacks.mjs', 'src/editor.mjs', 'src/app.mjs'];

// ── Import stripping + alias resolution ───────────────────────────────────────
// Matches both single-line and multi-line `import { ... } from '...';` statements.
// Captures the specifier list so aliases (`name as alias`) can be emitted as
// `const alias = name;` declarations — keeping all bindings intact in the bundle.
const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]\s*;?\s*\n?/gms;

// Also strip bare `import '...'` side-effect imports pointing to local files.
const BARE_IMPORT_RE = /^import\s+['"][^'"]+['"]\s*;?\s*\n?/gm;

function stripAndAliasImports(src) {
  let aliasLines = [];

  let result = src.replace(IMPORT_RE, (_, specifiers) => {
    // Parse comma-separated specifiers, handling `name as alias`
    const parts = specifiers.split(',').map(s => s.trim()).filter(Boolean);
    const aliases = [];
    for (const part of parts) {
      const asMatch = part.match(/^(\w+)\s+as\s+(\w+)$/);
      if (asMatch) {
        // Emit `const alias = originalName;` — the original name is exported from
        // an earlier module in the bundle so it is already in scope.
        aliases.push(`const ${asMatch[2]} = ${asMatch[1]};`);
      }
      // Non-aliased specifiers are already in scope from earlier modules; skip.
    }
    if (aliases.length) aliasLines.push(...aliases);
    return '';  // remove the import statement entirely
  });

  result = result.replace(BARE_IMPORT_RE, '');

  // Append alias declarations at the top of this module's block
  if (aliasLines.length) result = aliasLines.join('\n') + '\n' + result;
  return result;
}

// ── Strip top-level `export` keywords (keep declarations) ────────────────────
function stripExports(src) {
  return src.replace(/^export\s+(default\s+)?/gm, '');
}

// ── Bundle ────────────────────────────────────────────────────────────────────
const sources = await Promise.all(files.map(p => readFile(join(root, p), 'utf8')));
const processed = sources.map(src => stripExports(stripAndAliasImports(src)));
const bundled = processed.join('\n');

// ── Safety checks ─────────────────────────────────────────────────────────────
if (/<\/script/i.test(bundled))
  throw Error('Unexpected </script> terminator in bundled source.');

// Smoke-check: parse the bundled JS with Node's own parser.
// new Function wraps in a function body but `import`/`export` are module-only;
// we stripped those, so a module-script wrapper checks for syntax errors.
// We use a Worker with `eval`-equivalent: vm.compileFunction with sourceType
// isn't available without a flag, so use `new Function` on a strict wrapper.
// For module-level `const`/`let` at top level we need a real module parse.
// Use the undocumented but stable vm.Script which accepts ES2022 syntax.
import {Script} from 'node:vm';
try {
  // Script constructor parses but does not execute.
  new Script(bundled, {filename: 'bundle-smoke-check.js'});
} catch (e) {
  throw Error(`Bundle syntax error — ${e.message}`);
}

// Check that known aliases introduced by app.mjs are present.
const REQUIRED_ALIASES = ['editorUndo', 'editorCanUndo'];
for (const alias of REQUIRED_ALIASES) {
  // Must appear as a const declaration emitted by alias resolution.
  if (!bundled.includes(`const ${alias} =`))
    throw Error(`Bundle smoke check failed: alias "${alias}" not resolved in bundle.`);
}

// ── Write output ──────────────────────────────────────────────────────────────
let html = await readFile(join(root, 'index.html'), 'utf8');
html = html.replace(
  '<script type="module" src="src/app.mjs"></script>',
  `<script type="module">\n${bundled}\n</script>`
);
await mkdir(target, {recursive: true});
await writeFile(join(target, 'AfterStack.html'), html);

console.log(JSON.stringify({
  output: join(target, 'AfterStack.html'),
  bytes: Buffer.byteLength(html),
  modules: files.length,
  aliasesChecked: REQUIRED_ALIASES
}));
