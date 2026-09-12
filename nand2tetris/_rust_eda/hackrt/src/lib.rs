//! hackrt：HackHDL 的執行期。
//!
//! - `fmt`：官方 HardwareSimulator 的輸出格式
//! - `tst`：`.tst` 腳本解析與執行、與 `.cmp` 比對

pub mod fmt;
pub mod tst;

pub use tst::{parse_script, run, report_compare, Script, TopModel};

/// 內建 Nand 的 Boolean 行為
pub fn nand(a: u16, b: u16) -> u16 {
    if !(a != 0 && b != 0) {
        1
    } else {
        0
    }
}