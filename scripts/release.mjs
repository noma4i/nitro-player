#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';

const rootDir = path.resolve(import.meta.dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const changelogPath = path.join(rootDir, 'CHANGELOG.md');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const notesIdx = args.indexOf('--notes');
const notesPath = notesIdx >= 0 ? args[notesIdx + 1] : null;
const positional = args.filter((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--notes');
const bumpArg = positional[0];

if (!bumpArg) {
  console.error('Usage: yarn release <patch|minor|major|X.Y.Z> [--dry-run] [--notes file.md]');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version;

const semverRe = /^(\d+)\.(\d+)\.(\d+)$/;
const parseVersion = (v) => {
  const m = semverRe.exec(v);
  if (!m) throw new Error(`Invalid semver: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
};

const bump = (v, kind) => {
  const { major, minor, patch } = parseVersion(v);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump kind: ${kind}`);
};

const nextVersion = semverRe.test(bumpArg) ? bumpArg : bump(currentVersion, bumpArg);
parseVersion(nextVersion);

console.log(`Releasing ${currentVersion} -> ${nextVersion}${dryRun ? ' (dry run)' : ''}`);

const sh = (cmd, opts = {}) => {
  const res = spawnSync(cmd[0], cmd.slice(1), { cwd: rootDir, encoding: 'utf8', ...opts });
  if (res.status !== 0 && !opts.ignoreError) {
    console.error(`Command failed: ${cmd.join(' ')}\n${res.stderr || res.stdout}`);
    process.exit(1);
  }
  return res.stdout.trim();
};

if (!dryRun) {
  const status = sh(['git', 'status', '--porcelain']);
  if (status) {
    console.error('Working tree not clean:\n' + status);
    process.exit(1);
  }
  const branch = sh(['git', 'rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'master') {
    console.error(`Must be on master, currently on ${branch}`);
    process.exit(1);
  }
  const tagExists = sh(['git', 'tag', '-l', `v${nextVersion}`]);
  if (tagExists) {
    console.error(`Tag v${nextVersion} already exists`);
    process.exit(1);
  }
}

let notesBody;
if (notesPath) {
  notesBody = fs.readFileSync(path.resolve(rootDir, notesPath), 'utf8').trim();
} else if (process.env.CI || !process.env.EDITOR) {
  console.log('Paste CHANGELOG entry (finish with Ctrl-D):');
  notesBody = await new Promise((resolve) => {
    let buf = '';
    process.stdin.on('data', (chunk) => { buf += chunk; });
    process.stdin.on('end', () => resolve(buf.trim()));
  });
} else {
  const tmpFile = path.join(os.tmpdir(), `release-notes-${nextVersion}.md`);
  fs.writeFileSync(tmpFile, `### Changed\n\n- \n`, 'utf8');
  const editor = process.env.EDITOR;
  const editorRes = spawnSync(editor, [tmpFile], { stdio: 'inherit' });
  if (editorRes.status !== 0) {
    console.error('Editor exited with error');
    process.exit(1);
  }
  notesBody = fs.readFileSync(tmpFile, 'utf8').trim();
  fs.unlinkSync(tmpFile);
}

if (!notesBody) {
  console.error('Empty release notes, aborting');
  process.exit(1);
}

const newSection = `## ${nextVersion}\n\n${notesBody}\n`;
const changelog = fs.readFileSync(changelogPath, 'utf8');
const headerMatch = /^# Changelog\s*\n+/m.exec(changelog);
if (!headerMatch) {
  console.error('CHANGELOG.md missing "# Changelog" header');
  process.exit(1);
}
const insertAt = headerMatch.index + headerMatch[0].length;
const updatedChangelog = changelog.slice(0, insertAt) + newSection + '\n' + changelog.slice(insertAt);

pkg.version = nextVersion;
const updatedPkg = JSON.stringify(pkg, null, 2) + '\n';

if (dryRun) {
  console.log('\n--- package.json version ---');
  console.log(`  ${currentVersion} -> ${nextVersion}`);
  console.log('\n--- CHANGELOG.md new section ---');
  console.log(newSection);
  console.log('--- Git actions that would run ---');
  console.log(`  git add package.json CHANGELOG.md`);
  console.log(`  git commit -m "Release ${nextVersion}"`);
  console.log(`  git tag v${nextVersion}`);
  console.log(`  git push origin master`);
  console.log(`  git push origin v${nextVersion}`);
  process.exit(0);
}

fs.writeFileSync(pkgPath, updatedPkg, 'utf8');
fs.writeFileSync(changelogPath, updatedChangelog, 'utf8');

console.log('\n--- git diff ---');
sh(['git', '--no-pager', 'diff', '--', 'package.json', 'CHANGELOG.md'], { stdio: 'inherit' });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const confirm = await new Promise((resolve) => {
  rl.question(`\nProceed with commit, tag v${nextVersion}, and push? [y/N] `, (answer) => {
    rl.close();
    resolve(answer.trim().toLowerCase());
  });
});

if (confirm !== 'y' && confirm !== 'yes') {
  console.log('Aborted. Reverting file changes.');
  sh(['git', 'checkout', '--', 'package.json', 'CHANGELOG.md']);
  process.exit(1);
}

sh(['git', 'add', 'package.json', 'CHANGELOG.md']);
sh(['git', 'commit', '-m', `Release ${nextVersion}`]);
sh(['git', 'tag', `v${nextVersion}`]);
sh(['git', 'push', 'origin', 'master']);
sh(['git', 'push', 'origin', `v${nextVersion}`]);

console.log(`\nTag v${nextVersion} pushed. CI publish workflow will handle npm publish and GitHub Release.`);
