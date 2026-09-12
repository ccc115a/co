//! Jack → VM 編譯器（ch11，移植自 `11/c/jack2vm.c`，byte 相容）。
//!
//! 支援完整的 Jack 語言：class/static/field、constructor/function/method、
//! let/if/while/do/return 陳述、陣列（`varName[expr]`）、字串常數、
//! 對物件的 `.` 方法與 "純類別" 函式呼叫，以及 WHILE_EXP/IF_FALSE 標籤方案。
//!
//! 產出之 VM 文字與 C 版 `jack2vm.c` **逐位元相同**，可直接與既有
//! `11/jack/*/output/*.vm` 參考檔或重新產生的 oracle 對照。

use std::fmt::Write as _;

// ---------- Token ----------

#[derive(Clone, Debug, PartialEq)]
pub enum Tok {
    Kw(String),
    Sym(char),
    Num(u32),
    Str(String),
    Id(String),
    Eof,
}

fn token_text(t: &Tok) -> String {
    match t {
        Tok::Kw(v) | Tok::Id(v) => v.clone(),
        Tok::Sym(c) => c.to_string(),
        Tok::Num(n) => n.to_string(),
        Tok::Str(v) => v.clone(),
        Tok::Eof => String::new(),
    }
}

/// 移除 `//` 與 `/* ... */`（與 C 版相同：在 tokenize 之前處理、不辨識字串）。
fn remove_comments(src: &str) -> String {
    let mut out = String::with_capacity(src.len());
    let chars: Vec<char> = src.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '/' && i + 1 < chars.len() && chars[i + 1] == '/' {
            i += 2;
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
        } else if chars[i] == '/' && i + 1 < chars.len() && chars[i + 1] == '*' {
            i += 2;
            while i + 1 < chars.len() && !(chars[i] == '*' && chars[i + 1] == '/') {
                i += 1;
            }
            if i + 1 < chars.len() {
                i += 2;
            }
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

const SYMBOLS: &str = "{}()[].,;+-*/&|<>=~";
const KEYWORDS: &[&str] = &[
    "class", "method", "function", "constructor", "int", "boolean", "char", "void",
    "var", "static", "field", "let", "do", "if", "else", "while", "return", "true",
    "false", "null", "this",
];

/// 把無註解的原始碼拆成 token 序列（含結尾 Eof）。
pub fn lex_all(source: &str) -> Vec<Tok> {
    let chars: Vec<char> = source.chars().collect();
    let mut toks = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        if SYMBOLS.contains(c) {
            toks.push(Tok::Sym(c));
            i += 1;
            continue;
        }
        if c == '"' {
            i += 1;
            let mut v = String::new();
            while i < chars.len() && chars[i] != '"' {
                v.push(chars[i]);
                i += 1;
            }
            if i < chars.len() {
                i += 1; // 吃掉結尾 `"`
            }
            toks.push(Tok::Str(v));
            continue;
        }
        if c.is_ascii_digit() {
            let mut v = String::new();
            while i < chars.len() && chars[i].is_ascii_digit() {
                v.push(chars[i]);
                i += 1;
            }
            toks.push(Tok::Num(v.parse().unwrap_or(0)));
            continue;
        }
        if c.is_ascii_alphabetic() || c == '_' {
            let mut v = String::new();
            while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
                v.push(chars[i]);
                i += 1;
            }
            if KEYWORDS.contains(&v.as_str()) {
                toks.push(Tok::Kw(v));
            } else {
                toks.push(Tok::Id(v));
            }
            continue;
        }
        i += 1; // 忽略未知字元（與 C 版一致）
    }
    toks.push(Tok::Eof);
    toks
}

// ---------- 符號表 ----------

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Kind {
    Static = 0,
    Field = 1,
    Arg = 2,
    Var = 3,
}

const KIND_SEGMENT: [&str; 4] = ["static", "this", "argument", "local"];

struct Symbol {
    name: String,
    type_: String,
    kind: Kind,
    index: usize,
}

// ---------- Compiler ----------

pub struct Compiler {
    toks: Vec<Tok>,
    pos: usize,

    class_symbols: Vec<Symbol>,
    subroutine_symbols: Vec<Symbol>,
    index_static: usize,
    index_field: usize,
    index_arg: usize,
    index_var: usize,

    current_class: String,
    current_subroutine: String,
    label_counter: usize,

    pub out: String,
}

impl Compiler {
    pub fn new(source: &str) -> Self {
        Compiler {
            toks: lex_all(&remove_comments(source)),
            pos: 0,
            class_symbols: Vec::new(),
            subroutine_symbols: Vec::new(),
            index_static: 0,
            index_field: 0,
            index_arg: 0,
            index_var: 0,
            current_class: String::new(),
            current_subroutine: String::new(),
            label_counter: 0,
            out: String::new(),
        }
    }

    // --- lexer 操作 ---
    fn peek(&self) -> &Tok {
        &self.toks[self.pos]
    }
    fn advance(&mut self) -> Tok {
        let t = self.toks[self.pos].clone();
        if self.pos + 1 < self.toks.len() {
            self.pos += 1;
        }
        t
    }
    fn require(&mut self, kind: Tok, val: Option<&str>) -> String {
        let t = self.advance();
        let ok = match (&t, &kind) {
            (Tok::Kw(_), Tok::Kw(_)) => true,
            (Tok::Sym(_), Tok::Sym(_)) => true,
            (Tok::Id(_), Tok::Id(_)) => true,
            (Tok::Num(_), Tok::Num(_)) => true,
            (Tok::Str(_), Tok::Str(_)) => true,
            _ => false,
        };
        let tval = token_text(&t);
        if !ok || (val.is_some() && val != Some(tval.as_str())) {
            panic!(
                "Compiler Error: Expected '{}', but got '{}'",
                val.unwrap_or("token"),
                tval
            );
        }
        tval
    }

    fn is_token(&self, kind: &Tok, val: Option<&str>) -> bool {
        let t = self.peek();
        let kind_ok = match (t, kind) {
            (Tok::Kw(_), Tok::Kw(_)) => true,
            (Tok::Sym(_), Tok::Sym(_)) => true,
            (Tok::Id(_), Tok::Id(_)) => true,
            _ => false,
        };
        kind_ok && (val.is_none() || val == Some(token_text(t).as_str()))
    }
    fn is_keyword(&self, kw: &str) -> bool {
        self.is_token(&Tok::Kw(String::new()), Some(kw))
    }
    fn is_any_keyword(&self, kws: &[&str]) -> bool {
        kws.iter().any(|k| self.is_keyword(k))
    }
    fn is_sym(&self, c: char) -> bool {
        self.is_token(&Tok::Sym(c), Some(&c.to_string()))
    }
    fn is_any_sym(&self, syms: &str) -> bool {
        match self.peek() {
            Tok::Sym(c) => syms.contains(*c),
            _ => false,
        }
    }
    fn is_type(&self) -> bool {
        self.is_token(&Tok::Id(String::new()), None)
            || self.is_any_keyword(&["int", "char", "boolean"])
    }

    // --- VM 寫入器 ---
    fn push(&mut self, segment: &str, index: u32) {
        let _ = writeln!(self.out, "push {segment} {index}");
    }
    fn pop(&mut self, segment: &str, index: u32) {
        let _ = writeln!(self.out, "pop {segment} {index}");
    }
    fn arith(&mut self, cmd: &str) {
        let _ = writeln!(self.out, "{cmd}");
    }
    fn label(&mut self, l: &str) {
        let _ = writeln!(self.out, "label {l}");
    }
    fn goto(&mut self, l: &str) {
        let _ = writeln!(self.out, "goto {l}");
    }
    fn ifgoto(&mut self, l: &str) {
        let _ = writeln!(self.out, "if-goto {l}");
    }
    fn call(&mut self, name: &str, n_args: u32) {
        let _ = writeln!(self.out, "call {name} {n_args}");
    }
    fn function(&mut self, name: &str, n_locals: u32) {
        let _ = writeln!(self.out, "function {name} {n_locals}");
    }
    fn ret(&mut self) {
        self.out.push_str("return\n");
    }

    fn next_label_num(&mut self) -> usize {
        let n = self.label_counter;
        self.label_counter += 1;
        n
    }

    fn push_const(&mut self, v: u32) {
        self.push("constant", v);
    }

    // --- 符號表操作 ---
    fn start_subroutine(&mut self) {
        self.subroutine_symbols.clear();
        self.index_arg = 0;
        self.index_var = 0;
    }
    /// 回傳 (type, kind, index)
    fn lookup(&self, name: &str) -> Option<(String, Kind, usize)> {
        if let Some(s) = self.subroutine_symbols.iter().find(|s| s.name == name) {
            return Some((s.type_.clone(), s.kind, s.index));
        }
        if let Some(s) = self.class_symbols.iter().find(|s| s.name == name) {
            return Some((s.type_.clone(), s.kind, s.index));
        }
        None
    }
    fn define(&mut self, name: &str, type_: &str, kind: Kind) {
        let index = match kind {
            Kind::Static => &mut self.index_static,
            Kind::Field => &mut self.index_field,
            Kind::Arg => &mut self.index_arg,
            Kind::Var => &mut self.index_var,
        };
        let i = *index;
        *index += 1;
        let table = match kind {
            Kind::Static | Kind::Field => &mut self.class_symbols,
            Kind::Arg | Kind::Var => &mut self.subroutine_symbols,
        };
        table.push(Symbol {
            name: name.to_string(),
            type_: type_.to_string(),
            kind,
            index: i,
        });
    }
    fn var_count(&self, kind: Kind) -> u32 {
        let table = match kind {
            Kind::Static | Kind::Field => &self.class_symbols,
            Kind::Arg | Kind::Var => &self.subroutine_symbols,
        };
        table.iter().filter(|s| s.kind == kind).count() as u32
    }

    fn push_variable(&mut self, name: &str) {
        let (_, kind, index) = self
            .lookup(name)
            .unwrap_or_else(|| panic!("Compiler Error: Undefined variable: {name}"));
        let seg = KIND_SEGMENT[kind as usize];
        self.push(seg, index as u32);
    }
    fn pop_variable(&mut self, name: &str) {
        let (_, kind, index) = self
            .lookup(name)
            .unwrap_or_else(|| panic!("Compiler Error: Undefined variable: {name}"));
        let seg = KIND_SEGMENT[kind as usize];
        self.pop(seg, index as u32);
    }

    // --- 語法分析（compile_*，與 C 版一一對應） ---

    pub fn compile_class(&mut self) {
        self.require(Tok::Kw(String::new()), Some("class"));
        self.current_class = self.require(Tok::Id(String::new()), None);
        self.require(Tok::Sym('{'), Some("{"));
        while self.is_any_keyword(&["static", "field"]) {
            self.compile_class_var_dec();
        }
        while self.is_any_keyword(&["constructor", "function", "method"]) {
            self.compile_subroutine();
        }
        self.require(Tok::Sym('}'), Some("}"));
    }

    fn compile_class_var_dec(&mut self) {
        let t = self.advance();
        let kind = match token_text(&t).as_str() {
            "static" => Kind::Static,
            _ => Kind::Field,
        };
        let type_ = token_text(&self.advance());
        loop {
            let name = self.require(Tok::Id(String::new()), None);
            let type_ = type_.clone();
            self.define(&name, &type_, kind);
            if !self.is_sym(',') {
                break;
            }
            self.advance();
        }
        self.require(Tok::Sym(';'), Some(";"));
    }

    fn compile_subroutine(&mut self) {
        let kind_tok = self.advance(); // constructor | function | method
        self.advance(); // void | type
        let name = self.require(Tok::Id(String::new()), None);
        self.current_subroutine = name;

        self.start_subroutine();
        if token_text(&kind_tok) == "method" {
            self.define("this", &self.current_class.clone(), Kind::Arg);
        }
        self.require(Tok::Sym('('), Some("("));
        self.compile_parameter_list();
        self.require(Tok::Sym(')'), Some(")"));

        self.require(Tok::Sym('{'), Some("{"));
        while self.is_keyword("var") {
            self.compile_var_dec();
        }

        let func_name = format!("{}.{}", self.current_class, self.current_subroutine);
        let n_locals = self.var_count(Kind::Var);
        self.function(&func_name, n_locals);

        match token_text(&kind_tok).as_str() {
            "constructor" => {
                let n_fields = self.var_count(Kind::Field);
                self.push_const(n_fields);
                self.call("Memory.alloc", 1);
                self.pop("pointer", 0);
            }
            "method" => {
                self.push("argument", 0);
                self.pop("pointer", 0);
            }
            _ => {}
        }

        self.compile_statements();
        self.require(Tok::Sym('}'), Some("}"));
    }

    fn compile_parameter_list(&mut self) {
        if self.is_type() {
            loop {
                let type_ = token_text(&self.advance());
                let name = self.require(Tok::Id(String::new()), None);
                let type_ = type_.clone();
                self.define(&name, &type_, Kind::Arg);
                if !self.is_sym(',') {
                    break;
                }
                self.advance();
            }
        }
    }

    fn compile_var_dec(&mut self) {
        self.require(Tok::Kw(String::new()), Some("var"));
        let type_ = token_text(&self.advance());
        loop {
            let name = self.require(Tok::Id(String::new()), None);
            let type_ = type_.clone();
            self.define(&name, &type_, Kind::Var);
            if !self.is_sym(',') {
                break;
            }
            self.advance();
        }
        self.require(Tok::Sym(';'), Some(";"));
    }

    fn compile_statements(&mut self) {
        loop {
            let t = self.peek().clone();
            if let Tok::Kw(k) = &t {
                match k.as_str() {
                    "let" => self.compile_let(),
                    "if" => self.compile_if(),
                    "while" => self.compile_while(),
                    "do" => self.compile_do(),
                    "return" => self.compile_return(),
                    _ => break,
                }
            } else {
                break;
            }
        }
    }

    fn compile_let(&mut self) {
        self.require(Tok::Kw(String::new()), Some("let"));
        let name = self.require(Tok::Id(String::new()), None);
        let is_array = self.is_sym('[');
        if is_array {
            self.push_variable(&name);
            self.advance(); // '['
            self.compile_expression();
            self.require(Tok::Sym(']'), Some("]"));
            self.arith("add");
        }
        self.require(Tok::Sym('='), Some("="));
        self.compile_expression();
        self.require(Tok::Sym(';'), Some(";"));
        if is_array {
            self.pop("temp", 1);
            self.pop("pointer", 1);
            self.push("temp", 1);
            self.pop("that", 0);
        } else {
            self.pop_variable(&name);
        }
    }

    fn compile_while(&mut self) {
        let label_top = format!("WHILE_EXP{}", self.next_label_num());
        let label_end = format!("WHILE_END{}", self.next_label_num());
        self.label(&label_top);
        self.require(Tok::Kw(String::new()), Some("while"));
        self.require(Tok::Sym('('), Some("("));
        self.compile_expression();
        self.require(Tok::Sym(')'), Some(")"));
        self.arith("not");
        self.ifgoto(&label_end);
        self.require(Tok::Sym('{'), Some("{"));
        self.compile_statements();
        self.require(Tok::Sym('}'), Some("}"));
        self.goto(&label_top);
        self.label(&label_end);
    }

    fn compile_if(&mut self) {
        let label_else = format!("IF_FALSE{}", self.next_label_num());
        let label_end = format!("IF_END{}", self.next_label_num());
        self.require(Tok::Kw(String::new()), Some("if"));
        self.require(Tok::Sym('('), Some("("));
        self.compile_expression();
        self.require(Tok::Sym(')'), Some(")"));
        self.arith("not");
        self.ifgoto(&label_else);
        self.require(Tok::Sym('{'), Some("{"));
        self.compile_statements();
        self.require(Tok::Sym('}'), Some("}"));
        let has_else = self.is_keyword("else");
        if has_else {
            self.goto(&label_end);
        }
        self.label(&label_else);
        if has_else {
            self.require(Tok::Kw(String::new()), Some("else"));
            self.require(Tok::Sym('{'), Some("{"));
            self.compile_statements();
            self.require(Tok::Sym('}'), Some("}"));
            self.label(&label_end);
        }
    }

    fn compile_do(&mut self) {
        self.require(Tok::Kw(String::new()), Some("do"));
        self.compile_term();
        self.pop("temp", 0);
        self.require(Tok::Sym(';'), Some(";"));
    }

    fn compile_return(&mut self) {
        self.require(Tok::Kw(String::new()), Some("return"));
        if !self.is_sym(';') {
            self.compile_expression();
        } else {
            self.push_const(0);
        }
        self.require(Tok::Sym(';'), Some(";"));
        self.ret();
    }

    fn compile_expression(&mut self) {
        self.compile_term();
        while self.is_any_sym("+-*/&|<>=.") {
            let op = self.advance();
            self.compile_term();
            match op {
                Tok::Sym('+') => self.arith("add"),
                Tok::Sym('-') => self.arith("sub"),
                Tok::Sym('*') => self.call("Math.multiply", 2),
                Tok::Sym('/') => self.call("Math.divide", 2),
                Tok::Sym('&') => self.arith("and"),
                Tok::Sym('|') => self.arith("or"),
                Tok::Sym('<') => self.arith("lt"),
                Tok::Sym('>') => self.arith("gt"),
                Tok::Sym('=') => self.arith("eq"),
                _ => {} // '.' 沒有對應 case（與 C 版一致）
            }
        }
    }

    fn compile_term(&mut self) {
        let t = self.peek().clone();
        match &t {
            Tok::Num(n) => {
                self.push_const(*n);
                self.advance();
            }
            Tok::Str(v) => {
                let len = v.chars().count() as u32;
                self.push_const(len);
                self.call("String.new", 1);
                for c in v.chars() {
                    self.push_const(c as u32);
                    self.call("String.appendChar", 2);
                }
                self.advance();
            }
            Tok::Kw(k) => {
                match k.as_str() {
                    "true" => {
                        self.push_const(0);
                        self.arith("not");
                    }
                    "false" | "null" => self.push_const(0),
                    "this" => self.push("pointer", 0),
                    _ => {}
                }
                self.advance();
            }
            Tok::Sym(c) if *c == '(' => {
                self.advance();
                self.compile_expression();
                self.require(Tok::Sym(')'), Some(")"));
            }
            Tok::Sym(c) if "-~".contains(*c) => {
                let op = self.advance();
                self.compile_term();
                match op {
                    Tok::Sym('-') => self.arith("neg"),
                    _ => self.arith("not"),
                }
            }
            Tok::Id(name) => {
                let name = name.clone();
                self.advance();
                if self.is_sym('[') {
                    self.push_variable(&name);
                    self.advance();
                    self.compile_expression();
                    self.require(Tok::Sym(']'), Some("]"));
                    self.arith("add");
                    self.pop("pointer", 1);
                    self.push("that", 0);
                } else if self.is_sym('(') || self.is_sym('.') {
                    let mut n_args: u32 = 0;
                    let func_name: String;
                    if self.is_sym('.') {
                        self.advance();
                        let sub_name = self.require(Tok::Id(String::new()), None);
                        if let Some((type_, _, _)) = self.lookup(&name) {
                            self.push_variable(&name);
                            func_name = format!("{type_}.{sub_name}");
                            n_args = 1;
                        } else {
                            func_name = format!("{name}.{sub_name}");
                        }
                    } else {
                        self.push("pointer", 0);
                        func_name = format!("{}.{}", self.current_class, name);
                        n_args = 1;
                    }
                    self.require(Tok::Sym('('), Some("("));
                    n_args += self.compile_expression_list();
                    self.require(Tok::Sym(')'), Some(")"));
                    self.call(&func_name, n_args);
                } else {
                    self.push_variable(&name);
                }
            }
            _ => panic!("Compiler Error: Invalid term"),
        }
    }

    fn compile_expression_list(&mut self) -> u32 {
        let mut count = 0;
        if !self.is_sym(')') {
            self.compile_expression();
            count = 1;
            while self.is_sym(',') {
                self.advance();
                self.compile_expression();
                count += 1;
            }
        }
        count
    }
}

/// 便利入口：編譯整份 Jack 原始碼，回傳 VM 文字。
pub fn compile(source: &str) -> String {
    let mut c = Compiler::new(source);
    c.compile_class();
    c.out
}

/// 以位元組級別讀入的入口：把每個 byte 直接對應到同碼值字元後再編譯。
///
/// 課程的 `.jack` 檔案偶有非 UTF-8 位元組（例：`12/Output.jack` 註解裡
/// Windows-1252 的 smart quote `0x92`）。C 版把它當位元組序列處理、跳過註解，
/// 輸出不受影響；這裡的「byte→char 同碼值」映射與 C 的 byte 語意一致，
/// 保證 byte 相容。
pub fn compile_bytes(bytes: &[u8]) -> String {
    let s: String = bytes.iter().map(|&b| b as char).collect();
    compile(&s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seven() {
        let vm = compile(concat!(
            "class Main {\n",
            "    function void main() {\n",
            "        do Output.printInt(1 + (2 * 3));\n",
            "        return;\n",
            "    }\n",
            "}\n",
        ));
        let expect = "\
function Main.main 0
push constant 1
push constant 2
push constant 3
call Math.multiply 2
add
call Output.printInt 1
pop temp 0
push constant 0
return
";
        assert_eq!(vm, expect);
    }

    #[test]
    fn lexer_comments_and_strings() {
        let vm = compile(concat!(
            "// line comment\n",
            "class Main /* block comment */ {}\n",
        ));
        assert_eq!(vm, "");
        let vm2 = compile("class Main { function int foo() { return \"hi\"; } }\n");
        assert!(vm2.contains("push constant 2\ncall String.new 1\n"));
        assert!(vm2.contains("push constant 104\ncall String.appendChar 2\n"));
        assert!(vm2.contains("push constant 105\ncall String.appendChar 2\n"));
    }

    #[test]
    fn if_without_else_uses_two_labels() {
        let vm = compile(concat!(
            "class Main {\n",
            "    function int f(int x) {\n",
            "        var int y;\n",
            "        if (x) { let y = 1; }\n",
            "        return y;\n",
            "    }\n",
            "}\n",
        ));
        assert!(vm.starts_with("function Main.f 1\npush argument 0\nnot\nif-goto IF_FALSE0\n"));
        // 沒有 else 時不產生 goto 分岔；直接進 IF_FALSE0
        assert!(vm.contains("push constant 1\npop local 0\nlabel IF_FALSE0\n"));
        assert!(vm.lines().all(|l| !l.starts_with("goto ")));
    }

    #[test]
    fn while_labels_and_array() {
        let vm = compile(concat!(
            "class Main {\n",
            "    function int f(int n) {\n",
            "        var Array a;\n",
            "        var int i;\n",
            "        let a[0] = 3;\n",
            "        while (i < n) { let i = a[1]; }\n",
            "        return i;\n",
            "    }\n",
            "}\n",
        ));
        assert!(vm.contains("push local 0\npush constant 0\nadd\npush constant 3\npop temp 1\npop pointer 1\npush temp 1\npop that 0\n"));
        assert!(vm.contains("label WHILE_EXP0\npush local 1\npush argument 0\nlt\nnot\nif-goto WHILE_END1\n"));
        assert!(vm.contains("push local 0\npush constant 1\nadd\npop pointer 1\npush that 0\n"));
    }

    #[test]
    fn unary_and_builtin_calls() {
        let vm = compile(concat!(
            "class Main {\n",
            "    function void f() {\n",
            "        var boolean b;\n",
            "        let b = ~(2 = 2) & -3;\n",
            "        do Output.printString(\"ab\");\n",
            "    }\n",
            "}\n",
        ));
        assert!(vm.contains("push constant 2\npush constant 2\neq\nnot\npush constant 3\nneg\nand\npop local 0\n"));
        assert!(vm.contains(concat!(
            "push constant 2\ncall String.new 1\n",
            "push constant 97\ncall String.appendChar 2\n",
            "push constant 98\ncall String.appendChar 2\n",
            "call Output.printString 1\npop temp 0\n"
        )));
    }

    #[test]
    fn compile_bytes_handles_non_utf8_comment() {
        // 12/Output.jack 註解內有 Windows-1252 的 0x92（' ），非 UTF-8；
        // byte→char 同碼值映射要讓編譯照常完成且註解被移除。
        let mut src = b"class Main { // 0x92's note\n\n    function void main() {}\n}\n".to_vec();
        let i = src.iter().position(|&b| b == b'0').unwrap();
        src[i] = 0x92;
        let vm = compile_bytes(&src);
        // 註解（含 0x92）被移除、編譯正常完成：跳到 function 宣告後、
        // 0x92 的字元（U+0092）不得殘留在輸出裡。
        assert!(vm.starts_with("function Main.main 0\n"));
        assert!(!vm.contains('\u{92}'));
    }
}