//! HackHDL 的 AST 與解析結果。
//!
//! 支援的語法子集（涵蓋本 repo 全部 34 個 .hdl）：
//! ```text
//! CHIP Name {
//!     IN  a, b[16], c;      // 單 bit 或 bus
//!     OUT out[16], zr, ng;
//!     PARTS:
//!     SubChip (a=a, b[0]=true, b[1..15]=false, out[0..7]=w, out[15]=x, out=out);
//! }
//! ```

use std::fmt;

/// 單一 pin 宣告（IN 或 OUT）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pin {
    pub name: String,
    pub width: u16,
}

/// 連到 pin 的位置：整條 / 單 bit / 範圍切片
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Range {
    Whole,
    Bit(u16),
    Slice(u16, u16),
}

impl Range {
    pub fn bits(&self) -> u16 {
        match *self {
            Range::Whole | Range::Bit(_) => 1,
            Range::Slice(lo, hi) => hi - lo + 1,
        }
    }
    pub fn lo(&self) -> u16 {
        match *self {
            Range::Whole | Range::Bit(0) | Range::Slice(0, _) => 0,
            Range::Bit(i) => i,
            Range::Slice(lo, _) => lo,
        }
    }
}

/// 連線的右側（訊號源）：常數，或 wire / chip IN pin 的整條或切片
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Expr {
    Const(bool),
    Sig { name: String, range: Range },
}

/// 一條 `pin=expr` 連線
#[derive(Debug, Clone)]
pub struct PinConn {
    pub pin: String,
    pub pin_range: Range,
    pub src: Expr,
}

/// 一個子晶片實例
#[derive(Debug, Clone)]
pub struct Part {
    /// 子晶片名稱 == 實例標籤（例如 `ARegister`、`Mux16`）
    pub chip: String,
    pub conns: Vec<PinConn>,
}

/// 一個晶片
#[derive(Debug, Clone)]
pub struct Chip {
    pub name: String,
    pub in_pins: Vec<Pin>,
    pub out_pins: Vec<Pin>,
    pub parts: Vec<Part>,
}

impl Chip {
    pub fn pin_width(&self, name: &str) -> Option<u16> {
        self.in_pins
            .iter()
            .chain(self.out_pins.iter())
            .find(|p| p.name == name)
            .map(|p| p.width)
    }
}

/// 帶行列資訊的語法錯誤
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub line: usize,
    pub col: usize,
    pub msg: String,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}: {}", self.line, self.col, self.msg)
    }
}

impl std::error::Error for ParseError {}