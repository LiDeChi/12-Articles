import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const postsRoot = join(projectRoot, "posts");
const siteUrl = "https://lidechi.github.io/12-Articles";
const outputDir = resolve(
  projectRoot,
  process.env.QUARTO_PROJECT_OUTPUT_DIR || "_site",
);

function parseScalar(raw) {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

function parseDocument(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { metadata: {}, body: source };
  }

  const metadata = {};
  let listKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && listKey) {
      metadata[listKey].push(parseScalar(listMatch[1]));
      continue;
    }

    const pair = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!pair) {
      listKey = null;
      continue;
    }

    const [, key, rawValue = ""] = pair;
    if (!rawValue.trim()) {
      metadata[key] = [];
      listKey = key;
    } else {
      metadata[key] = parseScalar(rawValue);
      listKey = null;
    }
  }

  return {
    metadata,
    body: source.slice(match[0].length),
  };
}

function extractLanguageBody(body, lang) {
  const pattern = new RegExp(
    `<!--\\s*wordm:lang\\s+${lang}\\s*-->([\\s\\S]*?)<!--\\s*wordm:lang\\s+end\\s*-->`,
    "i",
  );
  const match = body.match(pattern);
  if (match) return match[1].trim();
  if (lang === "zh") {
    return body
      .replace(/<details[\s\S]*?<\/details>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();
  }
  return "";
}

function cleanInline(text) {
  const mathTokens = [];
  const protectedText = text.replace(
    /\$\$[\s\S]+?\$\$|\$(?:\\.|[^$\n])+\$/g,
    (formula) => {
      const token = `WORDMMATHTOKEN${mathTokens.length}END`;
      mathTokens.push(formula);
      return token;
    },
  );

  const cleaned = protectedText
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.replace(
    /WORDMMATHTOKEN(\d+)END/g,
    (_, index) => mathTokens[Number(index)] ?? "",
  );
}

function parseBlocks(markdown, articleUrl) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let index = 0;

  const pushParagraph = (paragraphLines) => {
    const text = cleanInline(paragraphLines.join(" "));
    if (text) blocks.push({ type: "paragraph", value: text });
  };

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line || line.startsWith("<!--")) {
      index += 1;
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", value: cleanInline(heading[1]) });
      index += 1;
      continue;
    }

    if (line.startsWith(":::") && line.includes("callout")) {
      const calloutLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(":::")) {
        calloutLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      const text = cleanInline(calloutLines.join(" "));
      if (text) blocks.push({ type: "callout", value: text });
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      let caption = "";
      let cursor = index + 1;
      while (cursor < lines.length && !lines[cursor].trim()) cursor += 1;
      const captionMatch = lines[cursor]?.trim().match(/^\*(.+)\*$/);
      if (captionMatch) {
        caption = cleanInline(captionMatch[1]);
        index = cursor + 1;
      } else {
        index += 1;
      }
      const src = /^https?:\/\//.test(image[2])
        ? image[2]
        : new URL(image[2], articleUrl).toString();
      blocks.push({
        type: "figure",
        src,
        alt: cleanInline(image[1]),
        caption,
      });
      continue;
    }

    if (/^(?:[-*+]|\d+\.)\s+/.test(line)) {
      const items = [];
      while (
        index < lines.length &&
        /^(?:[-*+]|\d+\.)\s+/.test(lines[index].trim())
      ) {
        items.push(
          cleanInline(
            lines[index].trim().replace(/^(?:[-*+]|\d+\.)\s+/, ""),
          ),
        );
        index += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    if (line.startsWith(">")) {
      const quoteLines = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      const text = cleanInline(quoteLines.join(" "));
      if (text) blocks.push({ type: "callout", value: text });
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && lines[index].trim()) {
      const next = lines[index].trim();
      if (
        /^#{1,6}\s+/.test(next) ||
        next.startsWith(":::") ||
        /^!\[/.test(next) ||
        /^(?:[-*+]|\d+\.)\s+/.test(next) ||
        next.startsWith(">")
      ) {
        break;
      }
      paragraphLines.push(next);
      index += 1;
    }
    pushParagraph(paragraphLines);
  }

  return blocks;
}

function pairBlocks(zhBlocks, enBlocks) {
  return zhBlocks.map((zhBlock, index) => {
    const enBlock =
      enBlocks[index]?.type === zhBlock.type ? enBlocks[index] : zhBlock;

    if (zhBlock.type === "figure") {
      return {
        type: "figure",
        src: zhBlock.src,
        alt: { zh: zhBlock.alt, en: enBlock.alt || zhBlock.alt },
        caption: {
          zh: zhBlock.caption,
          en: enBlock.caption || zhBlock.caption,
        },
      };
    }

    if (zhBlock.type === "list") {
      return {
        type: "list",
        items: zhBlock.items.map((item, itemIndex) => ({
          zh: item,
          en: enBlock.items?.[itemIndex] || item,
        })),
      };
    }

    return {
      type: zhBlock.type,
      text: {
        zh: zhBlock.value,
        en: enBlock.value || zhBlock.value,
      },
    };
  });
}

const articleFiles = readdirSync(postsRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && extname(entry.name) === ".md")
  .map((entry) => join(postsRoot, entry.name));

const articles = [];

for (const path of articleFiles) {
  const source = readFileSync(path, "utf8");
  const { metadata, body } = parseDocument(source);
  if (metadata.draft === true) continue;

  const dateSort = metadata["date-sort"] || metadata.date || "";
  const publishedAt = Date.parse(String(dateSort));
  if (Number.isFinite(publishedAt) && publishedAt > Date.now()) continue;

  const fallbackId = basename(path, extname(path));
  const articleId = metadata["article-id"] || fallbackId;
  const articleUrl = `${siteUrl}/posts/${articleId}.html`;
  const zhMarkdown = extractLanguageBody(body, "zh");
  const enMarkdown = extractLanguageBody(body, "en");
  const zhBlocks = parseBlocks(zhMarkdown, articleUrl);
  const enBlocks = enMarkdown
    ? parseBlocks(enMarkdown, articleUrl)
    : zhBlocks;
  const categories = Array.isArray(metadata.categories)
    ? metadata.categories
    : [];

  articles.push({
    id: articleId,
    title: {
      zh: metadata.title || fallbackId,
      en: metadata["title-en"] || metadata.title || fallbackId,
    },
    date: metadata["date-display"] || metadata.date || "",
    dateSort: metadata["date-sort"] || metadata.date || "",
    category: {
      zh: metadata.category || categories[0] || "文章",
      en:
        metadata["category-en"] ||
        metadata.category ||
        categories[0] ||
        "Articles",
    },
    summary: {
      zh: metadata.description || "",
      en: metadata["description-en"] || metadata.description || "",
    },
    note: {
      zh: metadata.note || "",
      en: metadata["note-en"] || metadata.note || "",
    },
    paragraphs: [],
    blocks: pairBlocks(zhBlocks, enBlocks),
    source: metadata.source || "site",
    sourceUrl: articleUrl,
    originalSourceUrl: metadata["source-url-original"] || null,
    originalPublishedAt: metadata["original-published-at"] || null,
  });
}

articles.sort((left, right) =>
  String(right.dateSort).localeCompare(String(left.dateSort)),
);

mkdirSync(outputDir, { recursive: true });
const target = join(outputDir, "articles.json");
writeFileSync(target, `${JSON.stringify(articles, null, 2)}\n`, "utf8");
console.log(
  `Exported ${articles.length} published articles to ${relative(projectRoot, target)}`,
);
