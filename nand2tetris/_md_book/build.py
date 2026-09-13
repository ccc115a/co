#!/usr/bin/env python3
"""build.py — 把 _md_book/*.md 原地渲染為 X.Y.html（靜態電子書）。

- 保護數學 $...$/$$...$$ 不被 markdown_it 誤讀
- 在習題 code block 後插入 [習題模擬](...) 連結
- 產生目錄 sidebar、topbar、prev/next、回互動書導覽
- 產生檔直接寫在同目錄，GitHub Pages 與 file:// 皆可離線瀏覽
"""
import re, os, glob, html as html_mod
from markdown_it import MarkdownIt

BASE = os.path.dirname(os.path.abspath(__file__))

# ─── 文件排序 ────────────────────────────────────────────
def nat_key(f):
    m = re.match(r"(\d+)\.(\d+)", os.path.basename(f))
    return (int(m.group(1)), int(m.group(2))) if m else (99, 99)

def sort_files():
    all_md = sorted(glob.glob(os.path.join(BASE, "*.md")), key=nat_key)
    index = [f for f in all_md if os.path.basename(f) == "README.md"]
    pages = [f for f in all_md if os.path.basename(f) != "README.md"]
    return index + pages

# ─── 習題→模擬 URL 對照（與互動書 weda 相同）─────────────
MULT_URL = ("../_web_eda/dist/index.html?asm=%2F%2F%20int%20main()%20%7B%0A%2F%2F%20%20%20%20int%20R0%20%3D%203%3B%0A%2F%2F%20%20%20%20int%20R1%20%3D%205%3B%0A%2F%2F%20%3D%3E%20%20%20%20int%20R2%20%3D%200%3B%0A%402%0AM%3D0%0A%2F%2F%20%20%20%20while%20(R0%20%3E%200)%20%7B%0A%2F%2F%20%3D%3E%20loop%3A%0A(loop)%0A%2F%2F%20%3D%3E%20%20%20%20if%20(R0%20%3C%3D%200)%20goto%20exit1%3B%0A%400%0AD%3DM%0A%40exit1%0AD%3BJLE%0A%0A%2F%2F%20%3D%3E%20%20R2%20%3D%20R2%20%2B%20R1%3B%0A%401%0AD%3DM%0A%402%0AM%3DD%2BM%0A%0A%2F%2F%20%3D%3E%20%20R0%20%3D%20R0%20-%201%3B%0A%400%0AM%3DM-1%0A%0A%2F%2F%20%20%20%20printf(%22R0%3D%25d%20R1%3D%25d%20R2%3D%25d%5Cn%22%2C%20R0%2C%20R1%2C%20R2)%3B%0A%2F%2F%20%3D%3E%20%20goto%20loop%3B%0A%40loop%0A0%3BJMP%0A%0A%2F%2F%20%3D%3E%20exit1%3A%0A(exit1)%0A%40exit1%0A0%3BJMP%0A%2F%2F%20%7D&ram=0:3,1:5")

FILL_URL = ("../_web_eda/dist/index.html?asm=%2F%2F%20Runs%20an%20infinite%20loop%20that%20listens%20to%20the%20keyboard%20input.%0A%2F%2F%20When%20a%20key%20is%20pressed%20(any%20key)%2C%20the%20program%20blackens%20the%20screen.%0A%2F%2F%20When%20no%20key%20is%20pressed%2C%20the%20program%20clears%20the%20screen.%0A%0A(FOREVER)%0A%2F%2F%20arr%20%3D%20SCREEN%0A%40SCREEN%0AD%3DA%0A%40arr%0AM%3DD%0A%0A%2F%2F%20n%3D8192%0A%408192%0AD%3DA%0A%40n%0AM%3DD%0A%2F%2F%20i%20%3D%200%0A%40i%0AM%3D0%0A(LOOP)%0A%2F%2F%20if%20(i%3D%3Dn)%20goto%20ENDLOOP%0A%40i%0AD%3DM%0A%40n%0AD%3DD-M%0A%40ENDLOOP%0AD%3BJEQ%0A%0A%2F%2F%20if%20(*KBD%20!%3D%200)%0A%40KBD%0AD%3DM%0A%40ELSE%0AD%3BJEQ%0A%0A%2F%2F%20RAM%5Barr%2Bi%5D%20%3D%20-1%0A%40arr%0AD%3DM%0A%40i%0AA%3DD%2BM%0AM%3D-1%0A%0A%40ENDIF%0A0%3BJMP%0A(ELSE)%0A%2F%2F%20RAM%5Barr%2Bi%5D%20%3D%200%0A%40arr%0AD%3DM%0A%40i%0AA%3DD%2BM%0AM%3D0%0A%0A(ENDIF)%0A%2F%2F%20i%2B%2B%0A%40i%0AM%3DM%2B1%0A%0A%40LOOP%0A0%3BJMP%0A%0A(ENDLOOP)%0A%40FOREVER%0A0%3BJMP")

COMPUTER_URL = ("../_web_eda/dist/index.html?asm=%2F%2F%20projects%2F04%2Fmult%2FMult.asm%EF%BC%88%E5%8A%A0%E8%A8%BB%E8%A7%A3%E7%89%88%EF%BC%8C%E8%88%87%E8%AA%B2%E6%9C%AC%E8%A1%8C%E7%82%BA%E4%B8%80%E8%87%B4%EF%BC%89%0A%0A%2F%2F%20int%20main()%20%7B%0A%2F%2F%20%20%20%20int%20R0%20%3D%203%3B%0A%2F%2F%20%20%20%20int%20R1%20%3D%205%3B%0A%2F%2F%20%3D%3E%20%20%20%20int%20R2%20%3D%200%3B%0A%402%0AM%3D0%0A%2F%2F%20%20%20%20while%20(R0%20%3E%200)%20%7B%20%20%3D%3E%20loop%3A%0A(loop)%0A%2F%2F%20%3D%3E%20%20%20%20if%20(R0%20%3C%3D%200)%20goto%20exit1%3B%0A%400%0AD%3DM%0A%40exit1%0AD%3BJLE%0A%0A%2F%2F%20%3D%3E%20%20R2%20%3D%20R2%20%2B%20R1%3B%0A%401%0AD%3DM%0A%402%0AM%3DD%2BM%0A%0A%2F%2F%20%3D%3E%20%20R0%20%3D%20R0%20-%201%3B%0A%400%0AM%3DM-1%0A%0A%2F%2F%20%3D%3E%20%20goto%20loop%3B%0A%40loop%0A0%3BJMP%0A%0A%2F%2F%20%3D%3E%20exit1%3A%0A(exit1)%0A%40exit1%0A0%3BJMP%0A%2F%2F%20%7D&ram=2:6,3:7")

SUM_URL = ("../_web_eda/dist/index.html?asm=%2F%2F%20RAM%5B0%5D%20%3D%2010%0A%4010%0AD%3DA%0A%400%0AM%3DD%0A%2F%2F%20Computes%20RAM%5B1%5D%20%3D%201%20%2B%20...%20%2B%20RAM%5B0%5D%0A%40i%0AM%3D1%20%2F%2F%20i%20%3D%201%0A%40sum%0AM%3D0%20%2F%2F%20sum%20%3D%200%0A(LOOP)%0A%40i%20%2F%2F%20if%20i%3ERAM%5B0%5D%20goto%20STOP%0AD%3DM%0A%40R0%0AD%3DD-M%0A%40STOP%0AD%3BJGT%0A%40i%20%2F%2F%20sum%20%2B%3D%20i%0AD%3DM%0A%40sum%0AM%3DD%2BM%0A%40i%20%2F%2F%20i%2B%2B%0AM%3DM%2B1%20%2F%2F%2016%0A%40LOOP%20%2F%2F%20goto%20LOOP%0A0%3BJMP%0A(STOP)%0A%40sum%0AD%3DM%0A%40R1%0AM%3DD%20%2F%2F%20RAM%5B1%5D%20%3D%20the%20sum")

def hdl_url(chip, ch="01"):
    return f"../_web_eda/dist/hdl.html?case=../{ch}/{chip}.tst&run=1"

EX_MAP = {
    "1.3.md": [
        ("// Not.hdl", hdl_url("Not")),
        ("// And.hdl", hdl_url("And")),
        ("// Or.hdl", hdl_url("Or")),
        ("// Xor.hdl", hdl_url("Xor")),
    ],
    "1.4.md": [
        ("// Mux.hdl", hdl_url("Mux")),
        ("// DMux.hdl", hdl_url("DMux")),
        ("// Not16.hdl", hdl_url("Not16")),
        ("// And16.hdl", hdl_url("And16")),
        ("// Or16.hdl", hdl_url("Or16")),
        ("// Mux16.hdl", hdl_url("Mux16")),
        ("// Mux4Way16.hdl", hdl_url("Mux4Way16")),
        ("// Mux8Way16.hdl", hdl_url("Mux8Way16")),
        ("// DMux4Way.hdl", hdl_url("DMux4Way")),
        ("// DMux8Way.hdl", hdl_url("DMux8Way")),
        ("// Or8Way.hdl", hdl_url("Or8Way")),
    ],
    "2.1.md": [
        ("// Half Adder", hdl_url("HalfAdder", "02")),
        ("// Full Adder", hdl_url("FullAdder", "02")),
    ],
    "2.2.md": [
        ("// 16-bit Adder", hdl_url("Add16", "02")),
        ("// 16-bit Incrementer", hdl_url("Inc16", "02")),
    ],
    "2.3.md": [("// The ALU (Arithmetic Logic Unit):", hdl_url("ALU-nostat", "02"))],
    "2.4.md": [("// The ALU (Arithmetic Logic Unit)", hdl_url("ALU", "02"))],
    "3.2.md": [
        ("// Bit：", hdl_url("Bit", "03/a")),
        ("// Register：", hdl_url("Register", "03/a")),
    ],
    "3.3.md": [
        ("// RAM8：", hdl_url("RAM8", "03/a")),
        ("// RAM64：", hdl_url("RAM64", "03/a")),
        ("// RAM512：", hdl_url("RAM512", "03/b")),
        ("// RAM4K：", hdl_url("RAM4K", "03/b")),
        ("// RAM16K：", hdl_url("RAM16K", "03/b")),
    ],
    "3.4.md": [("// PC：", hdl_url("PC", "03/a"))],
    "4.3.md": [("// Fill.asm", FILL_URL)],
    "4.4.md": [("// Mult.asm", MULT_URL)],
    "5.1.md": [("// Hack CPU", hdl_url("CPU", "05"))],
    "5.2.md": [("// Hack 記憶體系統", hdl_url("Memory", "05"))],
    "5.3.md": [("// Hack 電腦", COMPUTER_URL)],
    "6.3.md": [("// sum1ton.asm", SUM_URL)],
}

# ─── 數學 / code 保護 ────────────────────────────────────
_repls = {}
_math_counter = 0
_code_counter = 0

def protect_math_and_code(src):
    """將 inline code、display/inline math 換成 placeholder，回傳保護後文字。
    code fence 整段抽離，fence 外的純文字一次處理（支援跨行 $$..$$）。"""
    global _repls, _math_counter, _code_counter
    _repls, _math_counter, _code_counter = {}, 0, 0
    lines = src.split("\n")
    segs, buf, in_fence = [], [], False
    for line in lines:
        if line.lstrip().startswith("```"):
            if in_fence:
                buf.append(line)
                segs.append(("fence", "\n".join(buf)))
                buf, in_fence = [], False
            else:
                if buf:
                    segs.append(("text", "\n".join(buf)))
                    buf = []
                in_fence = True
                buf.append(line)
        elif in_fence:
            buf.append(line)
        else:
            buf.append(line)
    if in_fence:
        segs.append(("fence", "\n".join(buf)))
    elif buf:
        segs.append(("text", "\n".join(buf)))
    out = []
    for kind, s in segs:
        if kind == "text":
            s = _protect_code_spans(s)
            s = _protect_math(s)
        out.append(s)
    return "\n".join(out), _repls

def _protect_code_spans(s):
    def _repl(m):
        global _code_counter
        tok = f"@@C{_code_counter}@@"
        _code_counter += 1
        _repls[tok] = ("code", m.group(1))
        return tok
    return re.sub(r'`+([^`\n]+)`+', _repl, s)

def _protect_math(s):
    def _repl_disp(m):
        global _math_counter
        tok = f"@@M{_math_counter}@@"
        _math_counter += 1
        _repls[tok] = ("display", m.group(1))
        return tok
    def _repl_inline(m):
        global _math_counter
        tok = f"@@M{_math_counter}@@"
        _math_counter += 1
        _repls[tok] = ("inline", m.group(1))
        return tok
    s = re.sub(r'\$\$(.+?)\$\$', _repl_disp, s, flags=re.S)
    s = re.sub(r'(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)', _repl_inline, s)
    return s

def restore_tokens(text):
    def _restore(m):
        tok = m.group(0)
        if tok in _repls:
            kind, raw = _repls[tok]
            if kind == "code":
                return f'<code>{html_mod.escape(raw)}</code>'
            if kind == "display":
                return f'\n<div class="math-display">$$\n{html_mod.escape(raw)}\n$$</div>\n'
            if kind == "inline":
                return f'<span class="math-inline">${html_mod.escape(raw)}$</span>'
        return tok
    text = re.sub(r'@@[CM]\d+@@', _restore, text)
    # 顯示數學若被包進 <p>，把無用的 <p></p> 剝掉（div 不能嵌在 p 內）
    text = re.sub(
        r'<p>\s*(<div class="math-display">.*?</div>)\s*</p>',
        r'\1', text, flags=re.S)
    return text

# ─── 習題連結插入 ────────────────────────────────────────
def insert_exercise_links(src, fname):
    matchers = EX_MAP.get(fname, [])
    if not matchers:
        return src
    lines = src.split("\n")
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        stripped = line.lstrip()
        if stripped.startswith("```"):
            lang = stripped[3:].strip()
            body = []
            i += 1
            while i < len(lines) and not lines[i].lstrip().startswith("```"):
                body.append(lines[i])
                i += 1
            if i < len(lines):
                out.append(lines[i])      # 關閉 fence
                first = next((b for b in body if b.strip()), "")
                for marker, url in matchers:
                    if first.lstrip().startswith(marker) and lang in ("hdl", "asm", "vm", "jack"):
                        out += ["", f"[習題模擬]({url})", ""]
                        break
        i += 1
    return "\n".join(out)

# ─── 章節資訊 ────────────────────────────────────────────
def get_chapter_num(fname):
    m = re.match(r"(\d+)\.(\d+)", fname)
    return int(m.group(1)) if m else 0

def get_section_title(md_content):
    m = re.search(r'^#{1,3}\s+(.+)$', md_content, re.MULTILINE)
    if m:
        return re.sub(r'[<>]', '', m.group(1)).strip().strip('*# ')
    return ""

def slugify(text):
    s = re.sub(r'<[^>]+>', '', text)
    s = re.sub(r'[^\w\u4e00-\u9fff]+', '-', s).strip('-').lower()
    return s[:60] or 'sec'

# ─── Markdown 渲染 ───────────────────────────────────────
md = MarkdownIt("commonmark").enable(["table", "strikethrough"])

def render_markdown(src):
    protected, _repls_ = protect_math_and_code(src)
    global _repls
    _repls = _repls_
    html_body = md.render(protected)
    html_body = restore_tokens(html_body)
    html_body = _add_heading_ids(html_body)
    html_body = re.sub(r'href="(\d+\.\d+)\.md"', r'href="\1.html"', html_body)
    html_body = re.sub(r'href="README\.md"', r'href="index.html"', html_body)
    return html_body

_hsec = 0
def _add_heading_ids(html_body):
    global _hsec
    _hsec = 0
    def _repl(m):
        global _hsec
        tag, attrs, inner = m.group(1), m.group(2), m.group(3)
        sid = slugify(inner)
        return f'<h{tag} id="{sid}"{attrs}>{inner}</h{tag}>'
    return re.sub(r'<h([1-3])([^>]*)>(.*?)</h\1>', _repl, html_body)

# ─── 導覽 ────────────────────────────────────────────────
def ext(bn):
    return "index.html" if bn == "README.md" else bn.replace(".md", ".html")

def build_sidebar(all_files, titles, current):
    groups = {}
    for f in all_files:
        bn = os.path.basename(f)
        if bn == "README.md":
            continue
        ch = get_chapter_num(bn)
        groups.setdefault(ch, []).append((bn, titles[bn]))
    lines = ['<nav id="sidebar">', '<a class="sidebar-link" href="index.html">📚 目錄</a>']
    for ch in sorted(groups.keys()):
        ch_label = "導論" if ch == 0 else f"第 {ch} 章"
        lines.append(f'<div class="sidebar-chapter">{ch_label}</div>')
        for bn, title in groups[ch]:
            active = ' class="sidebar-link active"' if bn == current else ' class="sidebar-link"'
            short = re.sub(r'^第\s*\d+\.\d+\s*節\s*|^\d+\.\d+\s*', '', title)
            short = short[:34]
            lines.append(f'<a{active} href="{ext(bn)}">{bn.replace(".md","")}  {short}</a>')
    lines.append('</nav>')
    return "\n".join(lines)

def build_topbar(all_files, titles, current):
    bns = [os.path.basename(f) for f in all_files]
    idx = bns.index(current)
    prev_link = next_link = ""
    if idx > 0:
        prev_link = f'<a class="nav-btn" href="{ext(bns[idx-1])}">⇦ 上一節</a>'
    if idx < len(bns) - 1:
        next_link = f'<a class="nav-btn" href="{ext(bns[idx+1])}">下一節 ⇨</a>'
    ch = get_chapter_num(current)
    ch_link = ""
    if 0 <= ch <= 12 and os.path.exists(os.path.join(BASE, "..", "_html_book", f"ch{ch:02d}.html")):
        ch_link = f'<a class="nav-btn" href="../_html_book/ch{ch:02d}.html">互動書 ⤴</a>'
    title = titles.get(current, current)[:40]
    return f'''<div id="topbar">
  <div class="nav-left"><a class="nav-btn" href="index.html">📚</a>{prev_link}</div>
  <div class="title">{html_mod.escape(title)}</div>
  <div class="nav-right">{next_link}{ch_link}</div>
</div>'''

def build_page(title, sidebar, topbar, body, bottom_nav):
    return f'''<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html_mod.escape(title)}</title>
<link rel="stylesheet" href="assets/github.min.css">
<link rel="stylesheet" href="assets/book.css">
<script>window.MathJax = {{ tex: {{inlineMath:[['$','$']], displayMath:[['$$','$$']]}}, svg: {{fontCache:'global'}} }};</script>
<script defer src="assets/mathjax.js"></script>
<script defer src="assets/highlight.min.js"></script>
<script defer src="assets/book.js"></script>
</head>
<body>
{sidebar}
<div id="main">
{topbar}
<article id="content">
{body}
</article>
<nav id="bottom-nav">{bottom_nav}</nav>
</div>
</body>
</html>'''

# ─── 主程式 ──────────────────────────────────────────────
def main():
    all_files = sort_files()
    titles = {}
    for f in all_files:
        bn = os.path.basename(f)
        with open(f, encoding="utf-8") as fh:
            content = fh.read()
        titles[bn] = get_section_title(content) or bn.replace(".md", "")
    for f in all_files:
        bn = os.path.basename(f)
        with open(f, encoding="utf-8") as fh:
            raw = fh.read()
        raw = insert_exercise_links(raw, bn)
        body = render_markdown(raw)
        sidebar = build_sidebar(all_files, titles, bn)
        topbar = build_topbar(all_files, titles, bn)
        bns = [os.path.basename(x) for x in all_files]
        idx = bns.index(bn)
        bottom = ""
        if idx > 0:
            bottom += f'<a class="nav-btn" href="{ext(bns[idx-1])}">⇦ 上一節</a>'
        if idx < len(bns) - 1:
            bottom += f'<a class="nav-btn" href="{ext(bns[idx+1])}">下一節 ⇨</a>'
        outname = ext(bn)
        with open(os.path.join(BASE, outname), "w", encoding="utf-8") as out:
            out.write(build_page(titles[bn], sidebar, topbar, body, bottom))
        print(f"  ✓ {outname}")
    print(f"\n完成：{len(all_files)} 個頁面")

if __name__ == "__main__":
    main()