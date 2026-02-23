import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const changelogPath = path.join(rootDir, 'CHANGELOG.md');

const requestedVersion = process.argv[2] ?? process.env.npm_package_version;

if (!requestedVersion) {
  console.error('release-notes: version argument is required');
  process.exit(1);
}

const changelog = fs.readFileSync(changelogPath, 'utf8');
const lines = changelog.split(/\r?\n/);
const header = `## ${requestedVersion}`;
const startIndex = lines.findIndex((line) => line.trim() === header);

if (startIndex === -1) {
  console.error(`release-notes: version section "${header}" not found in CHANGELOG.md`);
  process.exit(1);
}

let endIndex = lines.length;
for (let index = startIndex + 1; index < lines.length; index += 1) {
  if (lines[index].startsWith('## ')) {
    endIndex = index;
    break;
  }
}

const sectionLines = lines.slice(startIndex + 1, endIndex);
const body = sectionLines.join('\n').trim();

if (!body) {
  console.error(`release-notes: version section "${header}" is empty`);
  process.exit(1);
}

process.stdout.write(`${body}\n`);
