#!/usr/bin/env bash
# static-site-builder.sh — 重建 Nand2Tetris 課程電子書（_md_book/*.html）
#
# 用法：從 repo 根目錄執行「bash static-site-builder.sh」即可。
# 它會：
#   1. 用 ~/.venv/bin/python（含 markdown_it）執行 build.py，
#      把 _md_book/*.md 原地渲染成 X.Y.html（含 [習題模擬] 連結與導覽）。
#   2. 檢查產生的 index.html 是否成功。
#
# 修改 _md_book/*.md 或 build.py 後，重新執行本腳本即可更新全部頁面。
set -e

cd "$(dirname "$0")/nand2tetris/_md_book"
echo "==> 開始建置電子書（_md_book/*.html）..."

PYTHON="${PYTHON:-$HOME/.venv/bin/python}"
if [ ! -x "$PYTHON" ]; then
    PYTHON="$(command -v python3)"
fi

"$PYTHON" build.py

echo "==> 建置完成。"
[ -f index.html ] && echo "    ✓ index.html 已產生"
echo "    可在瀏覽器直接開啟 _md_book/index.html，或先 push 後看 GitHub Pages。"