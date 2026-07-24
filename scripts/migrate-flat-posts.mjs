import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const postsRoot = join(projectRoot, "posts");
const assetsRoot = join(projectRoot, "assets", "articles");
const usedNames = new Set();

function metadataValue(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

function safeNoteName(title, articleId) {
  let stem = title
    .replaceAll("/", "／")
    .replaceAll("\\", "＼")
    .replaceAll(":", "：")
    .replaceAll("*", "＊")
    .replaceAll("?", "？")
    .replaceAll('"', "”")
    .replaceAll("<", "〈")
    .replaceAll(">", "〉")
    .replaceAll("|", "｜")
    .trim();

  while (Buffer.byteLength(`${stem}.md`) > 220) {
    stem = Array.from(stem).slice(0, -1).join("");
  }

  let name = `${stem}.md`;
  if (usedNames.has(name.toLocaleLowerCase())) {
    name = `${stem}（${articleId}）.md`;
  }
  usedNames.add(name.toLocaleLowerCase());
  return name;
}

function addFrontmatterFields(source, articleId, isFuture) {
  const frontmatterEnd = source.indexOf("\n---", 4);
  if (frontmatterEnd < 0) {
    throw new Error(`Missing YAML front matter: ${articleId}`);
  }

  const additions = [];
  if (!/^output-file:/m.test(source.slice(0, frontmatterEnd))) {
    additions.push(`output-file: ${JSON.stringify(`${articleId}.html`)}`);
  }
  if (!/^aliases:/m.test(source.slice(0, frontmatterEnd))) {
    additions.push(
      "aliases:",
      `  - ${JSON.stringify(`/posts/${articleId}/index.html`)}`,
    );
  }
  if (isFuture && !/^draft:\s*true\s*$/m.test(source.slice(0, frontmatterEnd))) {
    additions.push("draft: true");
  }
  if (!additions.length) return source;

  return `${source.slice(0, frontmatterEnd)}\n${additions.join("\n")}${source.slice(frontmatterEnd)}`;
}

const articleDirectories = readdirSync(postsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(postsRoot, entry.name));

let migrated = 0;
let futureDrafts = 0;

for (const articleDirectory of articleDirectories) {
  const sourcePath = join(articleDirectory, "index.qmd");
  if (!existsSync(sourcePath)) continue;

  const original = readFileSync(sourcePath, "utf8");
  const articleId = metadataValue(original, "article-id") || basename(articleDirectory);
  const title = metadataValue(original, "title") || articleId;
  const dateSort = metadataValue(original, "date-sort") || metadataValue(original, "date");
  const isFuture = Number.isFinite(Date.parse(dateSort)) && Date.parse(dateSort) > Date.now();
  const noteName = safeNoteName(title, articleId);
  const targetPath = join(postsRoot, noteName);

  if (existsSync(targetPath)) {
    throw new Error(`Target note already exists: ${targetPath}`);
  }

  let content = addFrontmatterFields(original, articleId, isFuture);
  content = content.replace(
    /\]\(figures\//g,
    `](../assets/articles/${articleId}/figures/`,
  );

  const assetEntries = readdirSync(articleDirectory, { withFileTypes: true })
    .filter((entry) => !["index.qmd", "index.html"].includes(entry.name));

  for (const entry of assetEntries) {
    const targetDirectory = join(assetsRoot, articleId);
    const target = join(targetDirectory, entry.name);
    if (existsSync(target)) {
      throw new Error(`Asset target already exists: ${target}`);
    }
    mkdirSync(targetDirectory, { recursive: true });
    renameSync(join(articleDirectory, entry.name), target);
  }

  writeFileSync(targetPath, content, "utf8");
  rmSync(articleDirectory, { recursive: true, force: true });
  migrated += 1;
  if (isFuture) futureDrafts += 1;
}

usedNames.clear();
for (const entry of readdirSync(postsRoot, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
  const currentPath = join(postsRoot, entry.name);
  const source = readFileSync(currentPath, "utf8");
  const articleId = metadataValue(source, "article-id") || entry.name.slice(0, -3);
  const title = metadataValue(source, "title") || articleId;
  const expectedName = safeNoteName(title, articleId);
  if (entry.name === expectedName) continue;

  const targetPath = join(postsRoot, expectedName);
  if (existsSync(targetPath)) {
    throw new Error(`Cannot normalize note filename; target exists: ${targetPath}`);
  }
  renameSync(currentPath, targetPath);
}

console.log(
  `Migrated ${migrated} articles to flat Markdown notes; marked ${futureDrafts} future articles as drafts.`,
);
