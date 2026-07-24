# 12-Articles

`12-Articles` 是公开文章的唯一源目录，同时驱动两个阅读入口：

- Quarto / GitHub Pages：<https://lidechi.github.io/12-Articles/>
- 主页博客：<https://wordm.us/blog/>

## 笔记约定

`posts/` 是文章的唯一源目录，每篇文章就是一份 Obsidian 可直接编辑的 Markdown 笔记：

```text
posts/
├── 大世界中的 Agent System.md
├── 奖励函数（一）：从期望效用到前景理论.md
└── 其他文章.md

assets/articles/
├── large-world-agent-system/
└── reward-functions-01/
```

文件名用于 Obsidian 阅读，稳定网址由 front matter 中的 `article-id` 和 `output-file` 决定。图片统一存放在 `assets/articles/<article-id>/`。主题使用 `categories` 元数据，不建立“数学 / Agent / 认知科学”多层目录。草稿在文章 front matter 中设置 `draft: true`；未来日期文章必须先保持草稿状态。

## 本地预览

```bash
quarto preview
```

## 发布

首次或手动发布：

```bash
quarto publish gh-pages --no-browser
```

`main` 分支中的 `posts/*.md` 是文章源文件，`gh-pages` 分支只保存渲染结果。生成的 HTML、JSON 和运行文件不会再写回 Obsidian 源目录。

推送到 `main` 后，GitHub Actions 会自动更新 GitHub Pages。提交前可运行内容检查：

```bash
node scripts/check-content.mjs
```

## 主页同步

Quarto 构建会生成 `_site/articles.json`。`wordm-personal-site` 在运行时读取发布后的清单，并保留本地快照作为离线回退，因此文章正文不再手写在 React/TypeScript 中。
