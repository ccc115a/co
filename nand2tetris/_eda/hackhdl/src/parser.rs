//! HackHDL 的 lexer + recursive descent parser。

use crate::ast::{Chip, Expr, ParseError, Pin, PinConn, Part, Range};

#[derive(Debug, Clone, PartialEq, Eq)]
enum Tok {
    Ident(String),
    Num(u16),
    LBrace,
    RBrace,
    LBracket,
    RBracket,
    DotDot,
    Assign,
    Comma,
    Semi,
    Colon,
    LParen,
    RParen,
}

impl Tok {
    fn text(&self) -> String {
        match self {
            Tok::Ident(s) => s.clone(),
            Tok::Num(n) => n.to_string(),
            t => format!("{t:?}"),
        }
    }
}

pub struct Parser {
    toks: Vec<(Tok, usize, usize)>, // token + line + col
    pos: usize,
}

impl Parser {
    pub fn new(src: &str) -> Result<Self, ParseError> {
        Ok(Parser { toks: Self::lex(src)?, pos: 0 })
    }

    fn lex(src: &str) -> Result<Vec<(Tok, usize, usize)>, ParseError> {
        let mut toks = Vec::new();
        let chars: Vec<char> = src.chars().collect();
        let mut i = 0usize;
        let mut line = 1usize;
        let mut col = 1usize;
        let bump = |c: char, i: &mut usize, line: &mut usize, col: &mut usize| {
            *i += 1;
            if c == '\n' {
                *line += 1;
                *col = 1;
            } else {
                *col += 1;
            }
        };
        while i < chars.len() {
            let c = chars[i];
            match c {
                '/' if i + 1 < chars.len() && chars[i + 1] == '/' => {
                    while i < chars.len() && chars[i] != '\n' {
                        bump(chars[i], &mut i, &mut line, &mut col);
                    }
                }
                '/' if i + 1 < chars.len() && chars[i + 1] == '*' => {
                    let (l, c0) = (line, col);
                    bump(chars[i], &mut i, &mut line, &mut col);
                    bump(chars[i], &mut i, &mut line, &mut col);
                    let mut closed = false;
                    while i < chars.len() {
                        if chars[i] == '*' && i + 1 < chars.len() && chars[i + 1] == '/' {
                            bump(chars[i], &mut i, &mut line, &mut col);
                            bump(chars[i], &mut i, &mut line, &mut col);
                            closed = true;
                            break;
                        }
                        bump(chars[i], &mut i, &mut line, &mut col);
                    }
                    if !closed {
                        return Err(ParseError { line: l, col: c0, msg: "註解沒有關閉 /* */".into() });
                    }
                }
                c if c.is_whitespace() => bump(c, &mut i, &mut line, &mut col),
                '{' => { toks.push((Tok::LBrace, line, col)); bump(c, &mut i, &mut line, &mut col); }
                '}' => { toks.push((Tok::RBrace, line, col)); bump(c, &mut i, &mut line, &mut col); }
                '[' => { toks.push((Tok::LBracket, line, col)); bump(c, &mut i, &mut line, &mut col); }
                ']' => { toks.push((Tok::RBracket, line, col)); bump(c, &mut i, &mut line, &mut col); }
                '=' => { toks.push((Tok::Assign, line, col)); bump(c, &mut i, &mut line, &mut col); }
                ',' => { toks.push((Tok::Comma, line, col)); bump(c, &mut i, &mut line, &mut col); }
                ';' => { toks.push((Tok::Semi, line, col)); bump(c, &mut i, &mut line, &mut col); }
                ':' => { toks.push((Tok::Colon, line, col)); bump(c, &mut i, &mut line, &mut col); }
                '(' => { toks.push((Tok::LParen, line, col)); bump(c, &mut i, &mut line, &mut col); }
                ')' => { toks.push((Tok::RParen, line, col)); bump(c, &mut i, &mut line, &mut col); }
                '.' => {
                    let (l, c0) = (line, col);
                    if i + 1 < chars.len() && chars[i + 1] == '.' {
                        toks.push((Tok::DotDot, line, col));
                        bump(c, &mut i, &mut line, &mut col);
                        bump(chars[i], &mut i, &mut line, &mut col);
                    } else {
                        return Err(ParseError { line: l, col: c0, msg: "單一個 . 不是合法 token".into() });
                    }
                }
                c if c.is_ascii_digit() => {
                    let (l, c0) = (line, col);
                    let mut s = String::new();
                    while i < chars.len() && chars[i].is_ascii_digit() {
                        s.push(chars[i]);
                        bump(chars[i], &mut i, &mut line, &mut col);
                    }
                    let n = s.parse().map_err(|_| ParseError {
                        line: l, col: c0,
                        msg: format!("數字 `{s}` 超出 16 bit 範圍"),
                    })?;
                    toks.push((Tok::Num(n), l, c0));
                }
                c if c.is_ascii_alphanumeric() || c == '_' || c == '-' => {
                    let (l, c0) = (line, col);
                    let mut s = String::new();
                    while i < chars.len()
                        && (chars[i].is_ascii_alphanumeric() || chars[i] == '_' || chars[i] == '-')
                    {
                        s.push(chars[i]);
                        bump(chars[i], &mut i, &mut line, &mut col);
                    }
                    toks.push((Tok::Ident(s), l, c0));
                }
                other => {
                    return Err(ParseError {
                        line, col,
                        msg: format!("無法解析的字元 `{other}`"),
                    });
                }
            }
        }
        Ok(toks)
    }

    fn peek(&self) -> Option<&(Tok, usize, usize)> {
        self.toks.get(self.pos)
    }
    fn next(&mut self) -> Option<(Tok, usize, usize)> {
        let t = self.toks.get(self.pos).cloned();
        if t.is_some() {
            self.pos += 1;
        }
        t
    }
    fn err<T>(&self, msg: impl Into<String>) -> Result<T, ParseError> {
        let (_, l, c) = self.toks.get(self.pos).cloned().unwrap_or((Tok::Num(0), 0, 0));
        Err(ParseError { line: l.max(1), col: c.max(1), msg: msg.into() })
    }

    fn expect_ident(&mut self, what: &str) -> Result<String, ParseError> {
        match self.next() {
            Some((Tok::Ident(s), _, _)) => Ok(s),
            t => self.err(format!(
                "預期 {what}，但看到 {}（{}:{}）",
                t.as_ref().map(|x| x.0.text()).unwrap_or("EOF".into()),
                t.as_ref().map(|x| x.1).unwrap_or(0),
                t.as_ref().map(|x| x.2).unwrap_or(0),
            )),
        }
    }
    fn expect(&mut self, t: Tok, what: &str) -> Result<(), ParseError> {
        match self.next() {
            Some((tok, _, _)) if tok == t => Ok(()),
            other => self.err(format!(
                "預期 {what}，但看到 {}",
                other.as_ref().map(|x| x.0.text()).unwrap_or("EOF".into())
            )),
        }
    }

    /// 解析一個 .hdl 檔
    pub fn parse_chip(&mut self) -> Result<Chip, ParseError> {
        let kw = self.expect_ident("CHIP")?;
        if kw != "CHIP" {
            return self.err(format!("預期 CHIP，但看到 `{kw}`"));
        }
        let name = self.expect_ident("晶片名稱")?;
        self.expect(Tok::LBrace, "{")?;
        let mut in_pins = Vec::new();
        let mut out_pins = Vec::new();
        loop {
            let Some((t, _, _)) = self.peek().cloned() else {
                return self.err("遇到檔案結尾，缺少 }");
            };
            match t {
                Tok::Ident(kw) if kw == "IN" => {
                    self.next();
                    in_pins = self.parse_pins()?;
                }
                Tok::Ident(kw) if kw == "OUT" => {
                    self.next();
                    out_pins = self.parse_pins()?;
                }
                Tok::Ident(kw) if kw == "PARTS" => {
                    self.next();
                    self.expect(Tok::Colon, ":")?;
                    let mut parts = Vec::new();
                    while !matches!(self.peek(), Some((Tok::RBrace, _, _)) | None) {
                        parts.push(self.parse_part()?);
                    }
                    self.expect(Tok::RBrace, "}")?;
                    return Ok(Chip { name, in_pins, out_pins, parts });
                }
                Tok::RBrace => {
                    self.next();
                    return Ok(Chip { name, in_pins, out_pins, parts: vec![] });
                }
                other => {
                    return self.err(format!(
                        "在 IN/OUT/PARTS 區段看到 `{}`",
                        other.text()
                    ));
                }
            }
        }
    }

    fn parse_pins(&mut self) -> Result<Vec<Pin>, ParseError> {
        let mut pins = Vec::new();
        loop {
            let name = self.expect_ident("pin 名稱")?;
            let mut width = 1u16;
            if matches!(self.peek(), Some((Tok::LBracket, _, _))) {
                self.next();
                let Some((Tok::Num(n), _, _)) = self.next() else {
                    return self.err("預期 bus 寬度數字");
                };
                width = n;
                self.expect(Tok::RBracket, "]")?;
            }
            pins.push(Pin { name, width });
            match self.peek() {
                Some((Tok::Comma, _, _)) => {
                    self.next();
                }
                Some((Tok::Semi, _, _)) => {
                    self.next();
                    return Ok(pins);
                }
                _ => return self.err("pin 清單要用 , 分隔、以 ; 結尾"),
            }
        }
    }

    fn parse_part(&mut self) -> Result<Part, ParseError> {
        let chip = self.expect_ident("子晶片名稱")?;
        self.expect(Tok::LParen, "(")?;
        let mut conns = Vec::new();
        loop {
            let (pin, pin_range) = self.parse_pin_ref()?;
            self.expect(Tok::Assign, "=")?;
            let src = self.parse_expr()?;
            conns.push(PinConn { pin, pin_range, src });
            match self.peek() {
                Some((Tok::Comma, _, _)) => {
                    self.next();
                }
                _ => break,
            }
        }
        self.expect(Tok::RParen, ")")?;
        self.expect(Tok::Semi, ";")?;
        Ok(Part { chip, conns })
    }

    /// pin 側：`name` / `name[3]` / `name[3..7]`
    fn parse_pin_ref(&mut self) -> Result<(String, Range), ParseError> {
        let name = self.expect_ident("pin 名稱")?;
        let range = self.parse_opt_range()?;
        Ok((name, range))
    }

    fn parse_opt_range(&mut self) -> Result<Range, ParseError> {
        if !matches!(self.peek(), Some((Tok::LBracket, _, _))) {
            return Ok(Range::Whole);
        }
        self.next();
        let Some((Tok::Num(a), _, _)) = self.next() else {
            return self.err("預期索引數字");
        };
        if matches!(self.peek(), Some((Tok::DotDot, _, _))) {
            self.next();
            let Some((Tok::Num(b), _, _)) = self.next() else {
                return self.err("預期範圍上限數字");
            };
            if b < a {
                return self.err(format!("範圍 {a}..{b} 的上限小於下限"));
            }
            self.expect(Tok::RBracket, "]")?;
            Ok(Range::Slice(a, b))
        } else {
            self.expect(Tok::RBracket, "]")?;
            Ok(Range::Bit(a))
        }
    }

    /// 訊號源側：`true` / `false` / `name` / `name[3]` / `name[3..7]`
    fn parse_expr(&mut self) -> Result<Expr, ParseError> {
        let (t, l, c) = self
            .next()
            .ok_or_else(|| ParseError { line: 1, col: 1, msg: "預期訊號源，但遇到檔案結尾".into() })?;
        match t {
            Tok::Ident(s) if s == "true" => Ok(Expr::Const(true)),
            Tok::Ident(s) if s == "false" => Ok(Expr::Const(false)),
            Tok::Ident(s) => {
                let range = self.parse_opt_range()?;
                Ok(Expr::Sig { name: s, range })
            }
            other => Err(ParseError {
                line: l,
                col: c,
                msg: format!("訊號源不能是 `{}`", other.text()),
            }),
        }
    }
}

/// 解析 .hdl 原始碼
pub fn parse_hdl(src: &str) -> Result<Chip, ParseError> {
    Parser::new(src)?.parse_chip()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    #[test]
    fn parse_basic_or16() {
        let hdl = r#"
            CHIP Or16 {
                IN a[16], b[16];
                OUT out[16];
                PARTS:
                Or(a=a[0], b=b[0], out=out[0]);
                Or(a=a[1], b=b[1], out=out[1]);
            }
        "#;
        let chip = parse_hdl(hdl).unwrap();
        assert_eq!(chip.name, "Or16");
        assert_eq!(chip.in_pins.len(), 2);
        assert_eq!(chip.in_pins[0].width, 16);
        assert_eq!(chip.parts.len(), 2);
        assert_eq!(chip.parts[0].conns[0].src, Expr::Sig { name: "a".into(), range: Range::Bit(0) });
    }

    #[test]
    fn parse_all_repo_hdl() {
        for dir in [
            "01", "02", "03/a", "03/b", "05",
        ] {
            let base = Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .parent()
                .unwrap()
                .join(dir);
            for entry in fs::read_dir(&base).unwrap() {
                let p = entry.unwrap().path();
                if p.extension().map(|e| e == "hdl").unwrap_or(false) {
                    let src = fs::read_to_string(&p).unwrap();
                    let chip = parse_hdl(&src)
                        .unwrap_or_else(|e| panic!("{} 解析失敗: {}", p.display(), e));
                    // 課程教材偶而把晶片改名存檔（例：CPU1.hdl 內寫 CHIP CPU）
                    let stem = p.file_stem().unwrap().to_str().unwrap().to_string();
                    if chip.name != stem && !(chip.name == "CPU" && stem == "CPU1") {
                        panic!("{}: 晶片名 {} 與檔名不合", p.display(), chip.name);
                    }
                }
            }
        }
    }
}