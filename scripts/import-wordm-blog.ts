import {
  copyFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Lang = "zh" | "en";

type BilingualText = Record<Lang, string>;

type BlogContentBlock =
  | { type: "heading"; text: BilingualText }
  | { type: "callout"; text: BilingualText }
  | { type: "paragraph"; text: BilingualText }
  | { type: "list"; items: BilingualText[] }
  | {
      type: "figure";
      src: string;
      alt: BilingualText;
      caption: BilingualText;
    };

type BlogArticle = {
  id: string;
  title: BilingualText;
  date: string;
  category: BilingualText;
  summary: BilingualText;
  note: BilingualText;
  paragraphs: BilingualText[];
  blocks?: BlogContentBlock[];
  source?: "site" | "x" | "substack";
  sourceUrl?: string | null;
  originalPublishedAt?: string | null;
  draft?: boolean;
};

async function main() {
const args = process.argv.slice(2);
const sourceIndex = args.indexOf("--source");
const overwrite = args.includes("--overwrite");

if (sourceIndex < 0 || !args[sourceIndex + 1]) {
  throw new Error(
    "Usage: npx tsx scripts/import-wordm-blog.ts --source /path/to/wordm-personal-site [--overwrite]",
  );
}

const projectRoot = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(args[sourceIndex + 1]);
const sourceModulePath = join(sourceRoot, "src/data/blogArticles.ts");

if (!existsSync(sourceModulePath)) {
  throw new Error(`Blog source module not found: ${sourceModulePath}`);
}

const { BLOG_ARTICLES } = (await import(
  pathToFileURL(sourceModulePath).href
)) as { BLOG_ARTICLES: BlogArticle[] };

const yamlString = (value: string) => JSON.stringify(value);

function normalizeDate(rawDate: string) {
  const match = rawDate.match(
    /^(\d{4})[.-](\d{2})[.-](\d{2})(?:\s+(\d{2}):(\d{2}))?/,
  );
  if (!match) {
    throw new Error(`Unsupported article date: ${rawDate}`);
  }

  const [, year, month, day, hour = "12", minute = "00"] = match;
  const date = `${year}-${month}-${day}`;
  return {
    date,
    sort: `${date}T${hour}:${minute}:00+08:00`,
  };
}

function renderBlock(
  block: BlogContentBlock,
  lang: Lang,
  articleDir: string,
) {
  if (block.type === "heading") {
    return `## ${block.text[lang]}`;
  }

  if (block.type === "callout") {
    return `::: {.callout-note appearance="simple"}\n${block.text[lang]}\n:::`;
  }

  if (block.type === "list") {
    return block.items.map((item) => `- ${item[lang]}`).join("\n");
  }

  if (block.type === "figure") {
    let figureSource = block.src;
    if (block.src.startsWith("/blog/")) {
      const sourcePath = join(sourceRoot, "public", block.src);
      const targetDir = join(articleDir, "figures");
      const targetName = basename(block.src);
      if (existsSync(sourcePath)) {
        mkdirSync(targetDir, { recursive: true });
        copyFileSync(sourcePath, join(targetDir, targetName));
        figureSource = `figures/${targetName}`;
      }
    }
    return `![${block.alt[lang]}](${figureSource})\n\n*${block.caption[lang]}*`;
  }

  return block.text[lang];
}

function renderLanguage(
  article: BlogArticle,
  lang: Lang,
  articleDir: string,
) {
  if (article.blocks?.length) {
    return article.blocks
      .map((block) => renderBlock(block, lang, articleDir))
      .join("\n\n");
  }

  return article.paragraphs
    .map((paragraph) => paragraph[lang])
    .filter(Boolean)
    .join("\n\n");
}

function hasDistinctEnglish(article: BlogArticle) {
  const bilingualPairs: Array<[string, string]> = [
    [article.title.zh, article.title.en],
    [article.summary.zh, article.summary.en],
    [article.note.zh, article.note.en],
    ...article.paragraphs.map(
      (paragraph) => [paragraph.zh, paragraph.en] as [string, string],
    ),
  ];

  for (const block of article.blocks ?? []) {
    if (block.type === "figure") {
      bilingualPairs.push(
        [block.alt.zh, block.alt.en],
        [block.caption.zh, block.caption.en],
      );
    } else if (block.type === "list") {
      bilingualPairs.push(
        ...block.items.map(
          (item) => [item.zh, item.en] as [string, string],
        ),
      );
    } else {
      bilingualPairs.push([block.text.zh, block.text.en]);
    }
  }

  return bilingualPairs.some(
    ([zh, en]) => Boolean(en.trim()) && zh.trim() !== en.trim(),
  );
}

let created = 0;
let skipped = 0;

for (const article of BLOG_ARTICLES as BlogArticle[]) {
  const slug = article.id.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const articleDir = join(projectRoot, "posts", slug);
  const targetPath = join(articleDir, "index.qmd");

  if (existsSync(targetPath) && !overwrite) {
    skipped += 1;
    continue;
  }

  mkdirSync(articleDir, { recursive: true });
  const normalizedDate = normalizeDate(article.date);
  const source = article.source ?? "site";
  const categories = Array.from(
    new Set(
      [
        article.category.zh,
        source === "x" ? "短文" : "",
        source === "substack" ? "Substack" : "",
      ].filter(Boolean),
    ),
  );
  const zhBody = renderLanguage(article, "zh", articleDir);
  const enBody = renderLanguage(article, "en", articleDir);
  const originalLink = article.sourceUrl
    ? `\n::: {.article-origin}\n[查看原始发布](${article.sourceUrl})\n:::\n`
    : "";
  const englishSection = hasDistinctEnglish(article)
    ? `\n<details class="article-translation">\n<summary>English translation</summary>\n\n<!-- wordm:lang en -->\n\n${enBody || zhBody}\n\n<!-- wordm:lang end -->\n\n</details>\n`
    : "";

  const frontmatter = [
    "---",
    `title: ${yamlString(article.title.zh)}`,
    `title-en: ${yamlString(article.title.en || article.title.zh)}`,
    `description: ${yamlString(article.summary.zh)}`,
    `description-en: ${yamlString(article.summary.en || article.summary.zh)}`,
    `date: ${normalizedDate.date}`,
    `date-sort: ${yamlString(normalizedDate.sort)}`,
    `date-display: ${yamlString(article.date)}`,
    `category: ${yamlString(article.category.zh)}`,
    `category-en: ${yamlString(article.category.en || article.category.zh)}`,
    "categories:",
    ...categories.map((category) => `  - ${yamlString(category)}`),
    `article-id: ${yamlString(article.id)}`,
    `source: ${yamlString(source)}`,
    `source-url-original: ${
      article.sourceUrl
        ? yamlString(article.sourceUrl.replaceAll("@", "%40"))
        : "null"
    }`,
    `original-published-at: ${article.originalPublishedAt ? yamlString(article.originalPublishedAt) : "null"}`,
    `note: ${yamlString(article.note.zh)}`,
    `note-en: ${yamlString(article.note.en || article.note.zh)}`,
    ...(article.draft === true ? ["draft: true"] : []),
    "---",
  ].join("\n");

  const content = `${frontmatter}\n${originalLink}\n<!-- wordm:lang zh -->\n\n${zhBody}\n\n<!-- wordm:lang end -->\n${englishSection}`;
  writeFileSync(targetPath, content, "utf8");
  created += 1;
}

console.log(
  `Imported ${created} articles from ${sourceRoot}; skipped ${skipped} existing article folders.`,
);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
