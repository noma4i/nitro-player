#!/usr/bin/env node
//
// audit-lifecycle-guards.mjs
//
// Static analyzer that catches the use-after-free / emit-after-release bug class
// for the native media player: a callback / observer / async block that
// dereferences the player (or emits an event) and can run AFTER release/teardown
// WITHOUT an early isReleased / generation guard.
//
// Mirrors scripts/check-behavior-tests.mjs: walks roots, collects violations,
// prints them, exits 1 if any are found.
//
// Two rules:
//   Rule A - a resource-touching callback/observer/async block missing an early guard.
//   Rule B - a file that registers an observer but never invalidates one (per file).
//
// Opt-out: a block carrying `// lifecycle-audit:ignore(<reason>)` on its first
// line, its signature line, or the line immediately above is skipped (Rule A).
//
// LIMITATIONS (heuristic catcher, not a sound verifier - documented gaps):
//   - selector-based @objc NotificationCenter handlers are not Rule A candidates;
//   - helper methods that touch the player only indirectly (no resource token in
//     their own body) are invisible;
//   - notifyDelegate is trusted as an always-guarded wrapper by convention.
// Runtime LifecycleGate behavior tests are the primary guarantee; this is the
// fast shift-left gate that catches the common unguarded-callback shape.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// --------------------------------------------------------------------------
// Scan roots
// --------------------------------------------------------------------------

const SWIFT_ROOT = join(repoRoot, 'ios');
const KOTLIN_ROOT = join(repoRoot, 'android', 'src', 'main', 'java', 'com', 'nitroplay');

const isExcludedSwift = path =>
  path.includes(`${join('nitrogen', 'generated')}`) ||
  path.includes(`${join('ios', 'nitrogen')}`) ||
  /(^|\/)tests(\/|$)/.test(path) ||
  /(^|\/)build(\/|$)/.test(path);

// --------------------------------------------------------------------------
// Shared helpers
// --------------------------------------------------------------------------

const OPT_OUT = /lifecycle-audit:ignore\(/;

// Resource the block must not touch unguarded. emitPlaybackState(...) is itself
// internally guarded, so a call to it alone never marks a block resource-touching.
const RESOURCE_TOUCH = /\b(player|playerItem|_eventEmitter|eventEmitter)\s*[.?]/;
const DIRECT_EMIT = /\b_?eventEmitter\??\.on[A-Z]/;
// The lifecycle-owned resources. Binding one into a local (`guard let player =
// self.player`) only proves non-nil, NOT not-released, so such locals must NOT
// be treated as safe. Only genuine caller-supplied parameters are.
const RESOURCE_NAMES = new Set(['player', 'playerItem', '_eventEmitter', 'eventEmitter']);

// Strip line comments and string-literal contents (best effort) so braces and
// resource tokens inside them do not confuse brace-matching / detection.
const sanitizeLine = line => {
  let out = '';
  let inStr = false;
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (!inStr && ch === '/' && next === '/') {
      break; // rest of line is a comment
    }
    if (!inStr && (ch === '"' || ch === '\'')) {
      inStr = true;
      quote = ch;
      out += ch;
      continue;
    }
    if (inStr) {
      if (ch === '\\') {
        i++; // skip escaped char
        continue;
      }
      if (ch === quote) {
        inStr = false;
        quote = '';
        out += ch;
      }
      // drop chars inside the string literal
      continue;
    }
    out += ch;
  }
  return out;
};

// Given the sanitized source and an index of a line that contains the candidate
// token, find the body of the block opened by the first `{` at or after that
// line. Returns { bodyLines, openLine, closeLine } or null when no opening brace
// is found close to the token (e.g. a selector-based addObserver call).
const extractBlockBody = (sanitizedLines, tokenLine, lookaheadForBrace = 3) => {
  let openLine = -1;
  let openCol = -1;
  for (let i = tokenLine; i < Math.min(sanitizedLines.length, tokenLine + lookaheadForBrace + 1); i++) {
    const col = sanitizedLines[i].indexOf('{');
    if (col !== -1) {
      openLine = i;
      openCol = col;
      break;
    }
  }
  if (openLine === -1) {
    return null;
  }

  let depth = 0;
  let closeLine = -1;
  const bodyLines = [];
  for (let i = openLine; i < sanitizedLines.length; i++) {
    const line = sanitizedLines[i];
    const startCol = i === openLine ? openCol : 0;
    let bodyStartCol = -1;
    for (let c = startCol; c < line.length; c++) {
      const ch = line[c];
      if (ch === '{') {
        depth++;
        if (depth === 1 && i === openLine) {
          bodyStartCol = c + 1;
        }
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          closeLine = i;
          const tail = line.slice(i === openLine ? bodyStartCol : 0, c);
          if (tail.trim().length) bodyLines.push(tail);
          return { bodyLines, openLine, closeLine };
        }
      }
    }
    // whole-line (or remainder) belongs to the body
    if (i === openLine) {
      const tail = line.slice(bodyStartCol === -1 ? openCol + 1 : bodyStartCol);
      bodyLines.push(tail);
    } else {
      bodyLines.push(line);
    }
  }
  return { bodyLines, openLine, closeLine };
};

// Remove the contents of nested wrapper closures whose own first lines carry a
// guard, so a block whose ONLY resource access lives inside a guarded wrapper is
// treated as safe. Covered wrappers: notifyDelegate { ... } (Swift),
// runOnMainThread { ... } / runOnMainThreadSync { ... } (Kotlin).
// A guard token that proves a wrapper body is release/generation-safe.
const WRAPPER_GUARD = /(!?\s*(self\.|host\.|delegate\.)?isReleased|[A-Za-z]*[Gg]eneration\s*==|shouldDeliverCallback\(|shouldEmit\(\))/;

const stripGuardedWrappers = bodyText => {
  // `notifyDelegate` guards `!delegate.isReleased` internally, so it is always
  // safe to strip. `runOnMainThread`/`runOnMainThreadSync` only dispatch to main
  // (no inherent guard), so they are stripped ONLY when their own body carries a
  // guard; otherwise an unguarded `runOnMainThread { host.player... }` would be
  // hidden from the analysis.
  const wrappers = [
    { name: 'notifyDelegate', always: true },
    { name: 'runOnMainThread', always: false },
    { name: 'runOnMainThreadSync', always: false }
  ];
  let text = bodyText;
  for (const { name, always } of wrappers) {
    const open = new RegExp(`\\b${name}\\s*(\\([^)]*\\))?\\s*\\{`);
    let from = 0;
    for (;;) {
      const hit = open.exec(text.slice(from));
      if (!hit) break;
      const matchStart = from + hit.index;
      const braceStart = matchStart + hit[0].length - 1; // position of '{'
      let depth = 0;
      let end = -1;
      for (let i = braceStart; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end === -1) break;
      const inner = text.slice(braceStart + 1, end);
      if (always || WRAPPER_GUARD.test(inner)) {
        text = text.slice(0, matchStart) + ' ' + text.slice(end + 1);
        from = matchStart + 1;
      } else {
        from = braceStart + 1; // leave unguarded wrapper body visible
      }
    }
  }
  return text;
};

// Names bound in the block via `guard let X`, `if let X`, `guard let (a, b)`,
// or as parameters in the signature line. A resource dereferenced through a
// freshly-bound / parameter name is validated-by-binding (the optional chain
// returns nil if the object is gone), so it is not an unguarded use-after-free.
const collectBoundNames = (signatureLine, bodyLines) => {
  const names = new Set();
  const text = [signatureLine, ...bodyLines].join('\n');

  // guard let / if let bindings (Swift). A resource bound here is NOT safe:
  // non-nil != not-released, so skip resource names (keep other locals).
  const letRe = /\b(?:guard|if)\s+let\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let m;
  while ((m = letRe.exec(text))) if (!RESOURCE_NAMES.has(m[1])) names.add(m[1]);

  // Kotlin: val x = ... (also not safe for resource names)
  const kotlinValRe = /\bval\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g;
  while ((m = kotlinValRe.exec(text))) if (!RESOURCE_NAMES.has(m[1])) names.add(m[1]);

  // Kotlin lambda parameters: `{ player -> ... }` and `{ (a, b) -> ... }`
  const lambdaParamRe = /\{\s*\(?([A-Za-z0-9_,\s]+?)\)?\s*->/g;
  while ((m = lambdaParamRe.exec(text))) {
    for (const p of m[1].split(',')) {
      const name = p.trim();
      if (name) names.add(name);
    }
  }

  // Swift weak/unowned captures on THIS block's own signature line are nil-safe
  // (the optional is nil if the object was released). Scoped to the signature
  // line ONLY - do NOT pull captures from sibling/enclosing closures, which would
  // wrongly suppress a re-fetched `let x = self.x` deref in a later closure.
  const captureRe = /\b(?:weak|unowned)(?:\([^)]*\))?\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  while ((m = captureRe.exec(signatureLine || ''))) names.add(m[1]);

  // Function / closure parameters from the signature, e.g.
  //   func onPlayerAccessLog(playerItem: AVPlayerItem)
  //   { [weak self] playerItem, change in ... }
  addParamsFromSignature(signatureLine || '', names);
  return names;
};

const addParamsFromSignature = (sig, names) => {
  const paramListMatch = sig.match(/\(([^)]*)\)/);
  if (!paramListMatch) return;
  for (const part of paramListMatch[1].split(',')) {
    const label = part.trim().split(':')[0].trim().split(/\s+/).pop();
    if (label) names.add(label.replace(/[^A-Za-z0-9_]/g, ''));
  }
};

// Parameters of the nearest enclosing `func`/`fun` declaration above a closure
// candidate. A resource passed in as a parameter of the surrounding method is
// owned by the caller, so dereferencing it inside a dispatched closure is not an
// unguarded use-after-free of `self`.
const nearestEnclosingParams = (sanitizedLines, candidateLine) => {
  const names = new Set();
  let depth = 0;
  for (let i = candidateLine; i >= 0 && candidateLine - i < 80; i--) {
    const line = sanitizedLines[i];
    if (i !== candidateLine) {
      for (const ch of line) {
        if (ch === '}') depth++;
        else if (ch === '{') depth--;
      }
    }
    if (depth <= 0 && /\b(func|fun)\s+[A-Za-z_]/.test(line)) {
      // collect a possibly multi-line parameter list
      let sig = line;
      let j = i;
      while (!/\)/.test(sig) && j < candidateLine && j - i < 6) {
        j++;
        sig += ' ' + sanitizedLines[j];
      }
      addParamsFromSignature(sig, names);
      break;
    }
  }
  return names;
};

// A deref `name.` / `name?.` is hazardous only if `name` is NOT bound/param.
const hasUnboundResourceDeref = (bodyText, boundNames) => {
  const re = /\b(player|playerItem|_eventEmitter|eventEmitter)\s*([.?])/g;
  let m;
  while ((m = re.exec(bodyText))) {
    const name = m[1];
    if (!boundNames.has(name)) return true;
  }
  // A direct emit through eventEmitter (e.g. _eventEmitter?.onLoad) is always
  // a post-release hazard regardless of binding.
  if (DIRECT_EMIT.test(bodyText)) {
    // only when the emitter name itself is not a freshly bound local
    const emitterNames = ['_eventEmitter', 'eventEmitter'];
    const unguarded = emitterNames.some(
      n => new RegExp(`\\b${n}\\??\\.on[A-Z]`).test(bodyText) && !boundNames.has(n)
    );
    if (unguarded) return true;
  }
  return false;
};

// First ~4 logical lines (skip blanks and // comments; allow one leading
// `guard let self` / `guard let self = self`) carry an early guard?
const SWIFT_GUARD = [
  /guard[^\n]*!?\s*(self\.)?(delegate\.)?isReleased/,
  /guard[^\n]*[A-Za-z]*[Gg]eneration\s*==/,
  /\bshouldEmit\(\)/,
  /\bshouldDeliverCallback\(/
];
const KOTLIN_GUARD = [
  // early return: `if (host.isReleased) return`
  /if\s*\([^)]*\b(host\.)?isReleased[^)]*\)\s*return/,
  // positive wrapping guard: `if (!isReleased && ...) { <access> }`
  /if\s*\(\s*![^)]*\bisReleased\b/,
  /[A-Za-z]*[Gg]eneration\s*==/,
  /shouldDeliverCallback\(/
];

// Lines that form a leading cancellation/await preamble inside a detached task.
// They precede the real isReleased / generation guard but touch no resource, so
// they must not consume the "first ~4 logical lines" budget.
const PREAMBLE_LINE = [
  /^do\s*\{?$/,
  /^\}?\s*catch[^{]*\{?$/,
  /^\}$/,
  /^return$/,
  /^try\s+await\s+Task\.sleep/
];

const isGuardedEarly = (bodyLines, guardPatterns) => {
  let logical = 0;
  let allowedSelfUnwrap = true;
  for (const raw of bodyLines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('//')) continue;
    // a guard matches at any point in the early window
    for (const p of guardPatterns) {
      if (p.test(line)) return true;
    }
    // a guard let self unwrap may precede the real guard once
    if (
      allowedSelfUnwrap &&
      /^guard\s+let\s+self(\s*=\s*self)?\s*(,\s*let\s+\w+\s*=\s*\w+\s*)?else\s*\{?\s*return/.test(line)
    ) {
      allowedSelfUnwrap = false;
      continue; // does not consume a logical slot
    }
    // leading cancellation / await preamble does not consume the budget
    if (PREAMBLE_LINE.some(p => p.test(line))) continue;
    logical++;
    if (logical >= 4) break;
  }
  return false;
};

// --------------------------------------------------------------------------
// Rule A - resource-touching candidate blocks
// --------------------------------------------------------------------------

// Candidate tokens come in two shapes:
//   - "signature" tokens introduce a method whose `{` may sit on a later line
//     (multi-line parameter lists). The method body is the candidate block.
//   - "closure-call" tokens introduce a trailing-closure call; the opening `{`
//     MUST be on the same line, otherwise the call has no closure literal (e.g.
//     `DispatchQueue.main.async(execute: apply)` / `asyncAfter(.., execute:..)`)
//     and is not a candidate at all.
const SWIFT_SIGNATURE_TOKENS = [/\bfunc\s+on[A-Z]/];
const SWIFT_CLOSURE_TOKENS = [
  /\.observe\([^)]*\)?\s*\{/,
  /addPeriodicTimeObserver\([^{]*\{/,
  /NotificationCenter\.default\.addObserver\(\s*forName:.*\{/,
  /DispatchQueue\.main\.async(?!After)[^{]*\{/,
  /DispatchQueue\.main\.asyncAfter[^{]*\{/,
  /Task\.detached[^{]*\{/,
  /\bTask\s*\{/
];

const KOTLIN_SIGNATURE_TOKENS = [
  /\boverride\s+fun\s+on[A-Z]/,
  /\boverride\s+fun\s+run\s*\(/
];
const KOTLIN_CLOSURE_TOKENS = [
  /\brunOnMainThread(Sync)?\s*\{/,
  /\bpostDelayed\([^{]*\{/
];

const SELECTOR_ADD_OBSERVER = /addObserver\(\s*self\b/;

const analyzeFileRuleA = (path, source, lang) => {
  const out = [];
  const rawLines = source.split(/\r?\n/);
  const sanitizedLines = rawLines.map(sanitizeLine);
  const signatureTokens = lang === 'swift' ? SWIFT_SIGNATURE_TOKENS : KOTLIN_SIGNATURE_TOKENS;
  const closureTokens = lang === 'swift' ? SWIFT_CLOSURE_TOKENS : KOTLIN_CLOSURE_TOKENS;
  const guardPatterns = lang === 'swift' ? SWIFT_GUARD : KOTLIN_GUARD;

  for (let i = 0; i < sanitizedLines.length; i++) {
    const line = sanitizedLines[i];
    const isSignature = signatureTokens.some(t => t.test(line));
    const isClosure = closureTokens.some(t => t.test(line));
    if (!isSignature && !isClosure) continue;
    // selector-based addObserver(self, selector:) has no closure body
    if (lang === 'swift' && SELECTOR_ADD_OBSERVER.test(line)) continue;

    // opt-out on signature line, line above, or (checked later) block first line
    const aboveRaw = rawLines[i - 1] || '';
    if (OPT_OUT.test(rawLines[i]) || OPT_OUT.test(aboveRaw)) continue;

    // signature tokens may have a `{` a few lines down (multi-line params);
    // closure tokens require the `{` on the same line.
    const block = extractBlockBody(sanitizedLines, i, isSignature ? 3 : 0);
    if (!block) continue;

    // opt-out on the block's first body line
    const firstBodyRaw = rawLines[block.openLine] || '';
    const firstAfterOpen = rawLines[block.openLine + 1] || '';
    if (OPT_OUT.test(firstBodyRaw) || OPT_OUT.test(firstAfterOpen)) continue;

    const signatureLine = sanitizedLines[i];
    const enclosingParams = nearestEnclosingParams(sanitizedLines, i);
    const bodyText = block.bodyLines.join('\n');

    // wrapper-aware: drop contents of guarded wrappers
    const reduced = stripGuardedWrappers(bodyText);

    // resource-touching?
    const touchesResource = RESOURCE_TOUCH.test(reduced) || DIRECT_EMIT.test(reduced);
    if (!touchesResource) continue;

    // binding-aware: derefs only through bound/param names are validated
    const boundNames = collectBoundNames(signatureLine, block.bodyLines);
    // Enclosing-func params suppress only NON-resource names: a resource param
    // (e.g. `player: AVPlayer`) captured into a callback can still be touched
    // after the owner's release, so it must not be silently treated as safe.
    for (const p of enclosingParams) if (!RESOURCE_NAMES.has(p)) boundNames.add(p);
    if (!hasUnboundResourceDeref(reduced, boundNames)) continue;

    // guarded early?
    if (isGuardedEarly(block.bodyLines, guardPatterns)) continue;

    out.push({
      path,
      line: i + 1,
      rule: 'A',
      text: rawLines[i].trim()
    });
  }
  return out;
};

// --------------------------------------------------------------------------
// Rule B - observer registered without invalidation (per file)
// --------------------------------------------------------------------------

const SWIFT_REGISTER = /\.observe\(|addPeriodicTimeObserver|NotificationCenter\.default\.addObserver/;
const SWIFT_INVALIDATE = /\.invalidate\(\)|removeTimeObserver|NotificationCenter\.default\.removeObserver|removeObserver/;
const KOTLIN_REGISTER = /\.addListener\(|addAnalyticsListener\(|postDelayed\(|registerReceiver\(/;
const KOTLIN_INVALIDATE = /removeListener|removeAnalyticsListener|removeCallbacks|unregisterReceiver/;

const analyzeFileRuleB = (path, source, lang) => {
  const sanitized = source
    .split(/\r?\n/)
    .map(sanitizeLine)
    .join('\n');
  const register = lang === 'swift' ? SWIFT_REGISTER : KOTLIN_REGISTER;
  const invalidate = lang === 'swift' ? SWIFT_INVALIDATE : KOTLIN_INVALIDATE;
  if (register.test(sanitized) && !invalidate.test(sanitized)) {
    return [{ path, line: 0, rule: 'B', text: 'registers an observer but never invalidates one' }];
  }
  return [];
};

// --------------------------------------------------------------------------
// Walking
// --------------------------------------------------------------------------

const collectFiles = (root, ext, exclude) => {
  const files = [];
  const walk = path => {
    if (!existsSync(path)) return;
    for (const entry of readdirSync(path)) {
      const next = join(path, entry);
      const stat = statSync(next);
      if (stat.isDirectory()) {
        walk(next);
        continue;
      }
      if (!next.endsWith(ext)) continue;
      if (exclude && exclude(next)) continue;
      files.push(next);
    }
  };
  walk(root);
  return files.sort();
};

const analyzeFile = (path, lang) => {
  const source = readFileSync(path, 'utf8');
  return [
    ...analyzeFileRuleA(path, source, lang),
    ...analyzeFileRuleB(path, source, lang)
  ];
};

const runAudit = () => {
  const violations = [];
  for (const file of collectFiles(SWIFT_ROOT, '.swift', isExcludedSwift)) {
    violations.push(...analyzeFile(file, 'swift'));
  }
  for (const file of collectFiles(KOTLIN_ROOT, '.kt', null)) {
    violations.push(...analyzeFile(file, 'kotlin'));
  }
  return violations;
};

const formatViolation = v => {
  const rel = v.path.startsWith(repoRoot) ? v.path.slice(repoRoot.length + 1) : v.path;
  const where = v.line > 0 ? `${rel}:${v.line}` : rel;
  const rule =
    v.rule === 'A'
      ? 'unguarded resource-touching callback/async block (use-after-free / emit-after-release risk)'
      : 'observer registered without invalidation in same file';
  return `  [${v.rule}] ${where}\n        ${rule}\n        > ${v.text}`;
};

// --------------------------------------------------------------------------
// Self-test
// --------------------------------------------------------------------------

const runSelfTest = () => {
  const fixtureDir = join(__dirname, '__fixtures__', 'lifecycle');
  const cases = [
    { file: 'bad.swift.txt', lang: 'swift', expectFlag: true },
    { file: 'good.swift.txt', lang: 'swift', expectFlag: false },
    { file: 'bad.kt.txt', lang: 'kotlin', expectFlag: true },
    { file: 'good.kt.txt', lang: 'kotlin', expectFlag: false }
  ];
  let failures = 0;
  for (const c of cases) {
    const path = join(fixtureDir, c.file);
    if (!existsSync(path)) {
      console.error(`self-test: missing fixture ${path}`);
      failures++;
      continue;
    }
    const source = readFileSync(path, 'utf8');
    const ruleA = analyzeFileRuleA(path, source, c.lang);
    const flagged = ruleA.length > 0;
    const ok = flagged === c.expectFlag;
    console.log(
      `self-test: ${c.file} -> ${flagged ? 'FLAGGED' : 'clean'} (expected ${c.expectFlag ? 'FLAGGED' : 'clean'}) ${ok ? 'OK' : 'FAIL'}`
    );
    if (!ok) {
      failures++;
      ruleA.forEach(v => console.error(`    flagged line ${v.line}: ${v.text}`));
    }
  }
  if (failures > 0) {
    console.error(`\nLifecycle-guard self-test FAILED (${failures} case(s)).`);
    process.exit(1);
  }
  console.log('\nLifecycle-guard self-test passed.');
};

// --------------------------------------------------------------------------
// Entry
// --------------------------------------------------------------------------

const main = () => {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
    return;
  }

  const violations = runAudit();
  if (violations.length > 0) {
    console.error(
      'Lifecycle-guard audit failed. A callback/observer/async block can run after\n' +
        'release/teardown and dereferences the player or emits an event without an\n' +
        'early isReleased / generation guard. Add the guard, wrap the access in a\n' +
        'guarded wrapper, or annotate with // lifecycle-audit:ignore(<reason>).\n'
    );
    console.error(violations.map(formatViolation).join('\n\n'));
    process.exit(1);
  }
  console.log('Lifecycle-guard audit passed: no unguarded resource-touching callbacks found.');
};

// Exported for tests / regression probes. analyzeFileRuleA(path, source, lang)
// returns Rule A violations for a single in-memory source.
export { analyzeFileRuleA, analyzeFileRuleB, runAudit };

// Only auto-run when invoked directly as a CLI, not when imported.
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main();
}
