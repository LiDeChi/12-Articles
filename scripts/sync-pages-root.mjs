import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const outputRoot = join(projectRoot, "_site");
const manifestPath = join(projectRoot, ".published-site-files");

const rootOutputs = new Set([
  ".nojekyll",
  "about.html",
  "articles.json",
  "index.html",
  "index.xml",
  "listings.json",
  "robots.txt",
  "search.json",
  "sitemap.xml",
]);

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function isPublishedOutput(relativePath) {
  return (
    rootOutputs.has(relativePath) ||
    relativePath.startsWith("site_libs/") ||
    /^posts\/[^/]+\/index\.html$/.test(relativePath)
  );
}

if (!existsSync(join(outputRoot, "index.html"))) {
  throw new Error("Render the Quarto project before syncing published files.");
}

const previousFiles = existsSync(manifestPath)
  ? readFileSync(manifestPath, "utf8").split(/\r?\n/).filter(Boolean)
  : [];

const nextFiles = listFiles(outputRoot)
  .map((path) => relative(outputRoot, path))
  .filter(isPublishedOutput)
  .sort();
const nextFileSet = new Set(nextFiles);

for (const relativePath of previousFiles) {
  if (!nextFileSet.has(relativePath)) {
    rmSync(join(projectRoot, relativePath), { force: true });
  }
}

for (const relativePath of nextFiles) {
  const destination = join(projectRoot, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(outputRoot, relativePath), destination);
}

writeFileSync(manifestPath, `${nextFiles.join("\n")}\n`, "utf8");
console.log(`Synced ${nextFiles.length} generated files into the Pages root.`);
