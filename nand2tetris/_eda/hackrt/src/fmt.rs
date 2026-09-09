//! 官方 HardwareSimulator 的輸出格式（逐字元對齊 .cmp）。
//!
//! `output-list` 每個欄位格式 `%[BDSX]{a}.{b}.{c}`：
//! - `a`：欄位值前面固定的空白數
//! - `b`：值本身的對齊寬度（二進位/十進位右對齊、符號左對齊）
//! - `c`：欄位值後面固定的空白數
//!
//! 表頭：變數名原樣在總寬度 `a+b+c` 內置中（超過則截斷，奇數餘格放右邊）。
//! 未定義值：整個欄位填 `*`。

/// 欄位格式種類
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Bin,
    Dec,
    Hex,
    Sym,
}

/// output-list 中的一個欄位
#[derive(Debug, Clone)]
pub struct OutField {
    /// 變數名稱（`time` 為特殊符號欄位）
    pub name: String,
    pub kind: Kind,
    pub a: usize,
    pub b: usize,
    pub c: usize,
}

impl OutField {
    pub fn width(&self) -> usize {
        self.a + self.b + self.c
    }
}

/// 把文字置中到寬度 `w`（截斷到 w，奇數餘格放右邊）
pub fn center(text: &str, w: usize) -> String {
    if text.len() >= w {
        return text[..w].to_string();
    }
    let left = (w - text.len()) / 2;
    let right = w - text.len() - left;
    format!("{}{}{}", " ".repeat(left), text, " ".repeat(right))
}

/// 值欄位：二進位零填補到寬度 b（超過則不放開）
pub fn bin_field(v: u16, b: usize) -> String {
    format!("{v:0>b$b}")
}

/// 值欄位：有號十進位右對齊（寬度 b）
pub fn dec_field(v: u16, b: usize) -> String {
    format!("{:>b$}", v as i16, b = b)
}

/// 值欄位：十六進位右對齊（寬度 b）
pub fn hex_field(v: u16, b: usize) -> String {
    let s = format!("{v:04X}");
    if s.len() >= b {
        s
    } else {
        format!("{s:>b$}")
    }
}

/// 產生表頭列（第一行）
pub fn header_line(fields: &[OutField]) -> String {
    let body: Vec<String> = fields
        .iter()
        .map(|f| center(&f.name, f.width()))
        .collect();
    format!("|{}|", body.join("|"))
}

/// 由目前值產生一列資料
///
/// `get` 傳回該名稱的值；`None` 表示未定義（輸出 `***`）。
/// `time_str` 在 `%S` 欄位（名稱 `time`）使用。
pub fn data_line(
    fields: &[OutField],
    time_str: &str,
    mut get: impl FnMut(&str) -> Option<u16>,
) -> String {
    let mut body: Vec<String> = Vec::with_capacity(fields.len());
    for f in fields {
        if f.kind == Kind::Sym {
            let txt = if f.name == "time" { time_str } else { "" };
            let cell = if txt.len() >= f.b {
                txt.to_string()
            } else {
                format!("{txt:<b$}", b = f.b)
            };
            body.push(format!("{}{}{}", " ".repeat(f.a), cell, " ".repeat(f.c)));
            continue;
        }
        let v = get(&f.name);
        let cell = match v {
            None => "*".repeat(f.b),
            Some(v) => match f.kind {
                Kind::Bin => bin_field(v, f.b),
                Kind::Dec => dec_field(v, f.b),
                Kind::Hex => hex_field(v, f.b),
                Kind::Sym => unreachable!(),
            },
        };
        body.push(format!("{}{}{}", " ".repeat(f.a), cell, " ".repeat(f.c)));
    }
    format!("|{}|", body.join("|"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn f(name: &str, kind: Kind, a: usize, b: usize, c: usize) -> OutField {
        OutField { name: name.into(), kind, a, b, c }
    }

    #[test]
    fn matches_and_cmp() {
        let fields = [
            f("a", Kind::Bin, 3, 1, 3),
            f("b", Kind::Bin, 3, 1, 3),
            f("out", Kind::Bin, 3, 1, 3),
        ];
        assert_eq!(header_line(&fields), "|   a   |   b   |  out  |");
        assert_eq!(
            data_line(&fields, "", |n| Some(match n {
                "a" => 0,
                "b" => 0,
                _ => 0,
            })),
            "|   0   |   0   |   0   |"
        );
    }

    #[test]
    fn matches_add16_cmp() {
        let fields = [
            f("a", Kind::Bin, 1, 16, 1),
            f("b", Kind::Bin, 1, 16, 1),
            f("out", Kind::Bin, 1, 16, 1),
        ];
        assert_eq!(header_line(&fields), "|        a         |        b         |       out        |");
        assert_eq!(
            data_line(&fields, "", |n| Some(match n {
                "a" => 0,
                "b" => 0xFFFF,
                "out" => 0xFFFF,
                _ => unreachable!(),
            })),
            "| 0000000000000000 | 1111111111111111 | 1111111111111111 |"
        );
    }

    #[test]
    fn matches_cpu_time() {
        let fields = [
            f("time", Kind::Sym, 0, 4, 0),
            f("reset", Kind::Bin, 2, 1, 2),
            f("inM", Kind::Dec, 0, 6, 0),
        ];
        assert_eq!(header_line(&fields), "|time|reset| inM  |");
        assert_eq!(
            data_line(&fields, "0+", |n| Some(match n {
                "inM" => 0,
                "reset" => 0,
                _ => unreachable!(),
            })),
            "|0+  |  0  |     0|"
        );
    }
}