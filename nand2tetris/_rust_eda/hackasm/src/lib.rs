//! HACK 組合語言組譯器（兩 pass）。
//!
//! pass1：收集 `(LABEL)` 標記位址，
//! pass2：`@symbol` 依[預設符號 → 標記 → 新變數(從 16)] 順序解析並編碼 A/C 指令。
//!
//! `assemble` 回傳 16 位元指令序列；`to_hack_text` 把它格式化為 .hack 文字。

use std::collections::HashMap;
use std::fmt::Write as _;

fn predefined() -> HashMap<String, u16> {
    let mut m = HashMap::new();
    for (name, v) in [
        ("SP", 0),
        ("LCL", 1),
        ("ARG", 2),
        ("THIS", 3),
        ("THAT", 4),
        ("R0", 0),
        ("R1", 1),
        ("R2", 2),
        ("R3", 3),
        ("R4", 4),
        ("R5", 5),
        ("R6", 6),
        ("R7", 7),
        ("R8", 8),
        ("R9", 9),
        ("R10", 10),
        ("R11", 11),
        ("R12", 12),
        ("R13", 13),
        ("R14", 14),
        ("R15", 15),
        ("SCREEN", 16384),
        ("KBD", 24576),
    ] {
        m.insert(name.to_string(), v);
    }
    m
}

/// 帶原始列號的組譯錯誤（供工具報錯定位用）。
#[derive(Debug, Clone)]
pub struct AsmError {
    /// 原始原始碼的列號（1 起算，含註解/空行）。
    pub line: usize,
    pub message: String,
}

fn assemble_impl(src: &str) -> Result<Vec<u16>, AsmError> {
    // 去註解（`//` 至行尾）與空白，空行略過；保留原始列號
    let clean: Vec<(String, usize)> = src
        .lines()
        .enumerate()
        .map(|(i, l)| (l.split("//").next().unwrap_or("").trim().to_string(), i + 1))
        .filter(|(l, _)| !l.is_empty())
        .collect();

    // pass1：`(LABEL)` → 位址
    let mut sym = predefined();
    let mut lines: Vec<(String, u16, usize)> = Vec::new();
    let mut addr = 0u16;
    for (line, lineno) in &clean {
        if let Some(inner) = line
            .strip_prefix('(')
            .and_then(|s| s.strip_suffix(')'))
        {
            let name = inner.trim().to_string();
            if sym.contains_key(&name) {
                return Err(AsmError {
                    line: *lineno,
                    message: format!("符號 {name} 重複定義"),
                });
            }
            sym.insert(name, addr);
        } else {
            lines.push((line.clone(), addr, *lineno));
            addr += 1;
        }
    }

    // pass2：編碼
    let mut out = Vec::with_capacity(lines.len());
    for (text, _, lineno) in &lines {
        if let Some(s) = text.strip_prefix('@') {
            if let Ok(n) = s.parse::<u16>() {
                out.push(n & 0x7FFF);
            } else {
                let n = match sym.get(s) {
                    Some(&v) => v,
                    None => {
                        let mut n = 16u16;
                        while sym.values().any(|&x| x == n) {
                            n += 1;
                        }
                        sym.insert(s.to_string(), n);
                        n
                    }
                };
                out.push(n);
            }
        } else {
            out.push(
                encode_c(text).map_err(|message| AsmError { line: *lineno, message })?,
            );
        }
    }
    Ok(out)
}

/// 兩 pass 組譯：一行組譯成一條 u16 指令
pub fn assemble(src: &str) -> Result<Vec<u16>, String> {
    assemble_impl(src).map_err(|e| e.message)
}

/// 帶原始列號的組譯（供工具報錯定位用）。
pub fn assemble_err(src: &str) -> Result<Vec<u16>, AsmError> {
    assemble_impl(src)
}

fn encode_c(text: &str) -> Result<u16, String> {
    let (dest, rest) = match text.find('=') {
        Some(i) => (&text[..i], &text[i + 1..]),
        None => ("", text),
    };
    let (comp, jump) = match rest.find(';') {
        Some(i) => (rest[..i].trim(), rest[i + 1..].trim()),
        None => (rest.trim(), ""),
    };
    if comp.is_empty() || comp.contains('=') || comp.contains(';') {
        return Err(format!("C 指令格式錯誤：{text}"));
    }
    let cc: &str = match comp {
        "0" => "0101010",
        "1" => "0111111",
        "-1" => "0111010",
        "D" => "0001100",
        "A" => "0110000",
        "!D" => "0001101",
        "!A" => "0110001",
        "-D" => "0001111",
        "-A" => "0110011",
        "D+1" => "0011111",
        "A+1" => "0110111",
        "D-1" => "0001110",
        "A-1" => "0110010",
        "D+A" => "0000010",
        "D-A" => "0010011",
        "A-D" => "0000111",
        "D&A" => "0000000",
        "D|A" => "0010101",
        "M" => "1110000",
        "!M" => "1110001",
        "-M" => "1110011",
        "M+1" => "1110111",
        "M-1" => "1110010",
        "D+M" => "1000010",
        "D-M" => "1010011",
        "M-D" => "1000111",
        "D&M" => "1000000",
        "D|M" => "1010101",
        _ => return Err(format!("C 指令未知 comp：{comp}")),
    };
    let dc: &str = match dest {
        "" => "000",
        "M" => "001",
        "D" => "010",
        "MD" => "011",
        "A" => "100",
        "AM" => "101",
        "AD" => "110",
        "AMD" => "111",
        _ => return Err(format!("C 指令未知 dest：{dest}")),
    };
    let jc: &str = match jump {
        "" => "000",
        "JGT" => "001",
        "JEQ" => "010",
        "JGE" => "011",
        "JLT" => "100",
        "JNE" => "101",
        "JLE" => "110",
        "JMP" => "111",
        _ => return Err(format!("C 指令未知 jump：{jump}")),
    };
    let bits = format!("111{cc}{dc}{jc}");
    u16::from_str_radix(&bits, 2).map_err(|e| e.to_string())
}

/// 把指令序列格式化為 .hack 文字（每行 16 位元 0/1）
pub fn to_hack_text(words: &[u16]) -> String {
    let mut s = String::new();
    for w in words {
        let _ = writeln!(s, "{w:016b}");
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    fn one(src: &str) -> u16 {
        assemble(src).unwrap()[0]
    }

    #[test]
    fn a_instruction_number() {
        assert_eq!(one("@2"), 0b0000000000000010);
        assert_eq!(one("@16384"), 0x4000);
        assert_eq!(one("@24576"), 0x6000);
        assert_eq!(one("@0"), 0x0000);
    }

    #[test]
    fn a_instruction_predefined() {
        assert_eq!(one("@SCREEN"), 0x4000);
        assert_eq!(one("@KBD"), 0x6000);
        assert_eq!(one("@R15"), 15);
        assert_eq!(one("@THAT"), 4);
    }

    #[test]
    fn c_instructions() {
        assert_eq!(one("D=A"), 0b1110110000010000);
        assert_eq!(one("D=D+A"), 0b1110000010010000);
        assert_eq!(one("M=D"), 0b1110001100001000);
        assert_eq!(one("D;JGT"), 0b1110001100000001);
        assert_eq!(one("0;JMP"), 0b1110101010000111);
        assert_eq!(one("M=-1"), 0b1110111010001000);
        assert_eq!(one("MD=M-1"), 0b1111110010011000);
        assert_eq!(one("D=D-M"), 0b1111010011010000);
        assert_eq!(one("D;JLE"), 0b1110001100000110);
        assert_eq!(one("A=M"), 0b1111110000100000);
    }

    #[test]
    fn labels_and_vars() {
        let out = assemble("@LOOP\nD;JGT\n(LOOP)\n0;JMP\n@x\nD=A\n").unwrap();
        assert_eq!(out[0], 2); // @LOOP → (LOOP) 位於指令 2
        assert_eq!(out[1], one("D;JGT"));
        assert_eq!(out[2], one("0;JMP"));
        assert_eq!(out[3], 16); // @x → 新變數 16
        assert_eq!(out[4], one("D=A"));
        // 兩個 @x 指向同一變數
        let out2 = assemble("@x\n@x\n").unwrap();
        assert_eq!(out2[0], 16);
        assert_eq!(out2[1], 16);
    }

    #[test]
    fn add_program() {
        let out = assemble("@2\nD=A\n@3\nD=D+A\n@0\nM=D\n").unwrap();
        let expect: Vec<u16> = [
            0b0000000000000010,
            0b1110110000010000,
            0b0000000000000011,
            0b1110000010010000,
            0b0000000000000000,
            0b1110001100001000,
        ]
        .into_iter()
        .collect();
        assert_eq!(out, expect);
    }

    #[test]
    fn comments_blank_lines_ignored() {
        let out = assemble("  // hi\n   @5\n// bye\n\n  D=A // never mind\n").unwrap();
        assert_eq!(out[0], 5);
        assert_eq!(out[1], one("D=A"));
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn errors_carry_original_line_numbers() {
        let e = assemble_err("@2\nXXX\n").unwrap_err();
        assert_eq!(e.line, 2);
        assert!(e.message.contains("C 指令"));
        // 訊息與 assemble()（無行號）一致
        let msg = e.message.clone();
        let e_plain = assemble("@2\nXXX\n").unwrap_err();
        assert_eq!(e_plain, msg);
        // 標籤重複：行號指向第二個 (L)
        let e = assemble_err("(L)\n@2\n(L)\n0;JMP\n").unwrap_err();
        assert_eq!(e.line, 3);
        assert!(e.message.contains("重複定義"));
        // 註解/空行也計入行號 → D=Q 在第 4 行
        let e = assemble_err("@2\n\n// c\nD=Q\n").unwrap_err();
        assert_eq!(e.line, 4);
        // assemble()（不帶行號）訊息與舊版一致
        let e2 = assemble("@2\nXXX\n").unwrap_err();
        assert_eq!(e2, "C 指令未知 comp：XXX");
    }
}