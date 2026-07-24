import {
  readFileSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const postsRoot = join(projectRoot, "posts");
const numberedNotePattern = /^(\d{3}) (.+)\.md$/u;
const partialNumberPattern = /^\d+\s+/u;

function parseScalar(raw) {
  const value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function metadataFor(path) {
  const source = readFileSync(path, "utf8");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  return Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, parseScalar(value)]),
  );
}

const notes = readdirSync(postsRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && extname(entry.name) === ".md")
  .map((entry) => {
    const match = entry.name.match(numberedNotePattern);
    if (!match && partialNumberPattern.test(entry.name)) {
      throw new Error(
        `笔记序号必须是三位数字加空格，或完全不写序号：posts/${entry.name}`,
      );
    }

    const path = join(postsRoot, entry.name);
    const metadata = metadataFor(path);
    const dateSort = String(metadata["date-sort"] || metadata.date || "");
    const timestamp = Date.parse(dateSort);
    return {
      name: entry.name,
      path,
      sequence: match ? Number(match[1]) : null,
      sortTime: Number.isFinite(timestamp)
        ? timestamp
        : Number.POSITIVE_INFINITY,
    };
  });

const usedSequences = new Set();
let maximumSequence = 0;
for (const note of notes) {
  if (note.sequence === null) continue;
  if (usedSequences.has(note.sequence)) {
    throw new Error(`文章序号重复：${String(note.sequence).padStart(3, "0")}`);
  }
  usedSequences.add(note.sequence);
  maximumSequence = Math.max(maximumSequence, note.sequence);
}

const unnumberedNotes = notes
  .filter((note) => note.sequence === null)
  .sort(
    (left, right) =>
      left.sortTime - right.sortTime ||
      left.name.localeCompare(right.name, "zh-CN"),
  );

if (maximumSequence + unnumberedNotes.length > 999) {
  throw new Error("文章数量超过三位序号可容纳的 999 篇。");
}

for (const note of unnumberedNotes) {
  maximumSequence += 1;
  const prefix = String(maximumSequence).padStart(3, "0");
  const targetName = `${prefix} ${note.name}`;
  renameSync(note.path, join(postsRoot, targetName));
}

if (unnumberedNotes.length) {
  console.log(
    `已为 ${unnumberedNotes.length} 篇笔记追加稳定序号；当前最大序号为 ${String(maximumSequence).padStart(3, "0")}。`,
  );
} else {
  console.log(`文章序号检查通过：${notes.length} 篇笔记均已编号。`);
}
