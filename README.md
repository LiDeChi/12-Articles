# 12-Articles

`12-Articles` 是公开文章的唯一源目录，同时驱动两个阅读入口：

- Quarto / GitHub Pages：<https://lidechi.github.io/12-Articles/>
- 主页博客：<https://wordm.us/blog/>

## 目录约定

每篇文章使用一个稳定的小写英文目录：

```text
posts/
└── article-slug/
    ├── index.qmd
    ├── cover.png
    └── figures/
```

主题使用 `categories` 元数据，不建立“数学 / Agent / 认知科学”多层目录。草稿在文章 front matter 中设置 `draft: true`。

## 本地预览

```bash
quarto preview
```

## 发布

首次或手动发布：

```bash
quarto publish gh-pages --no-browser
```

`main` 分支中的 `posts/*/index.qmd` 是文章源文件，`gh-pages` 分支保存完整渲染结果。仓库原有 Pages 设置仍从 `main` 根目录读取，因此工作流还会把必要的 HTML、JSON 和静态运行文件同步回根目录；`.published-site-files` 记录这些生成物，避免它们成为第二份文章源。

推送到 `main` 后，GitHub Actions 会自动更新两套发布输出。手动渲染后如需同步当前 Pages 根目录：

```bash
quarto render
node scripts/sync-pages-root.mjs
```

## 主页同步

Quarto 构建会生成 `_site/articles.json`。`wordm-personal-site` 在运行时读取发布后的清单，并保留本地快照作为离线回退，因此文章正文不再手写在 React/TypeScript 中。
