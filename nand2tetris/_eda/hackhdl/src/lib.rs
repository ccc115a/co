//! hackhdl：HackHDL 的解析與詳述，產出可直接 codegen 的 IR。
//!
//! ```text
//! 語法分析   (ast, parser)   →  詳述 (elab)   →  IR (Elab)
//! hdl 原始碼                    解析子晶片、接線、拓樸排序
//! ```

pub mod ast;
pub mod elab;
pub mod parser;

pub use elab::{elab, load_library, merge_libs, Elab, ElabChip, ElabError};
pub use parser::parse_hdl;