//! VM→HACK 組合語言轉換器（ch07/08，移植自 `08/vm2asm.c`，byte 相容）。
//!
//! 支援完整 VM 指令：stack 算術（add/sub/neg/and/or/not/eq/gt/lt）、
//! push/pop（constant/local/argument/this/that/temp/pointer/static）、
//! label/goto/if-goto、function/call/return（含多檔案的 `Sys.init` bootstrap）。
//!
//! 多檔（bootstrap）模式下，VM 的 `label/goto/if-goto` 標記會加上 `函式$` 前綴
//! （依 ch08 的函式作用域規範），避免不同 VM 檔之間的標記衝突；單檔模式與課程
//! C 版 `vm2asm.c` **逐位元相同**，可直接拿既有測試檔 `.asm` 做回歸對照。
//!
//! 產生之組語：單檔模式與課程 C 版 `vm2asm.c` **逐位元相同**，可直接拿既有測試檔 `.asm`
//! 做回歸對照；多檔模式加函式作用域標記（見註）。

use std::path::Path;

struct Writer {
    out: String,
    label_count: usize,
    return_count: usize,
    /// 多檔模式（bootstrap）下方把 `label/goto/if-goto` 標記加上 `函式$` 前綴，
    /// 避免不同 VM 檔（不同函式）的標記互相衝突。單檔模式維持與 C 版逐位元相同。
    scope: bool,
    /// 目前所在的函式名稱（遇到 `function` 指令時更新）。
    cur_func: String,
}

impl Writer {
    fn new() -> Self {
        Writer { out: String::new(), label_count: 0, return_count: 0, scope: false, cur_func: String::new() }
    }

    /// 取得要輸出的標記名：多檔模式加 `函式$` 前綴，單檔模式用原名。
    fn label_name(&self, arg: &str) -> String {
        if self.scope && !self.cur_func.is_empty() {
            format!("{}${}", self.cur_func, arg)
        } else {
            arg.to_string()
        }
    }
    fn w(&mut self, s: &str) {
        self.out.push_str(s);
    }
}

/// 把單一 VM 文字檔的核對內容寫進共用的 Writer（計數器隨檔案累積，與 C 版全域變數一致）。
fn translate_into(wr: &mut Writer, vm: &str, current_file: &str) {
    for raw in vm.lines() {
        // 移除 `//` 註解並 trim
        let line = match raw.split("//").next() {
            Some(s) => s.trim(),
            None => continue,
        };
        if line.is_empty() {
            continue;
        }
        let toks: Vec<&str> = line.split_whitespace().collect();
        let cmd = match toks.first() {
            Some(c) => *c,
            None => continue,
        };
        let arg1 = toks.get(1).copied().unwrap_or("");
        let arg2 = toks.get(2).copied().unwrap_or("").parse::<u16>().unwrap_or(0);
        wr.w(&format!("// {line}\n"));
        match cmd {
            "add" | "sub" | "neg" | "and" | "or" | "not" | "eq" | "gt" | "lt" => {
                write_arithmetic(wr, cmd);
            }
            "push" => write_push(wr, current_file, arg1, arg2),
            "pop" => write_pop(wr, current_file, arg1, arg2),
            "label" => wr.w(&format!("({})\n", wr.label_name(arg1))),
            "goto" => wr.w(&format!("@{}\n0;JMP\n", wr.label_name(arg1))),
            "if-goto" => wr.w(&format!("@SP\nAM=M-1\nD=M\n@{}\nD;JNE\n", wr.label_name(arg1))),
            "function" => {
                wr.cur_func = arg1.to_string();
                write_function(wr, arg1, arg2);
            }
            "call" => write_call(wr, arg1, arg2),
            "return" => write_return(wr),
            _ => {} // 未知指令：與 C 版一致，靜默略過
        }
    }
}

/// 把單一 VM 文字檔轉成 HACK 組合語言（不寫 bootstrap）。
/// `current_file`：static 段名前綴（basename 不含 `.vm`）。
pub fn translate_file(vm: &str, current_file: &str) -> String {
    let mut wr = Writer::new();
    translate_into(&mut wr, vm, current_file);
    wr.out
}

/// 多檔案轉換：輸入 `(顯示路徑, VM 原始碼)` 清單；超過一個檔時加上
/// `SP=256` + `call Sys.init 0` 的 bootstrap（與 `vm2asm.c` 一致）。
pub fn translate(inputs: &[(String, String)], bootstrap: bool) -> String {
    let mut wr = Writer::new();
    wr.scope = bootstrap;
    if bootstrap {
        wr.w("// Bootstrap code\n");
        wr.w("// Initialize SP = 256\n");
        wr.w("@256\nD=A\n@SP\nM=D\n");
        wr.w("// Call Sys.init\n");
        write_call(&mut wr, "Sys.init", 0);
    }
    for (path, src) in inputs {
        let current_file = Path::new(path)
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.clone());
        wr.w(&format!("\n// ========== File: {path} ==========\n"));
        translate_into(&mut wr, src, &current_file);
    }
    wr.out
}

fn write_arithmetic(wr: &mut Writer, cmd: &str) {
    match cmd {
        "add" => wr.w("@SP\nAM=M-1\nD=M\nA=A-1\nM=D+M\n"),
        "sub" => wr.w("@SP\nAM=M-1\nD=M\nA=A-1\nM=M-D\n"),
        "neg" => wr.w("@SP\nA=M-1\nM=-M\n"),
        "and" => wr.w("@SP\nAM=M-1\nD=M\nA=A-1\nM=D&M\n"),
        "or" => wr.w("@SP\nAM=M-1\nD=M\nA=A-1\nM=D|M\n"),
        "not" => wr.w("@SP\nA=M-1\nM=!M\n"),
        "eq" | "gt" | "lt" => {
            let cond = match cmd {
                "eq" => "D;JEQ",
                "gt" => "D;JGT",
                _ => "D;JLT",
            };
            let n = wr.label_count;
            wr.label_count += 1;
            wr.w("@SP\nAM=M-1\nD=M\nA=A-1\nD=M-D\n");
            wr.w(&format!("@TRUE_{n}\n{cond}\n"));
            wr.w("@SP\nA=M-1\nM=0\n");
            wr.w(&format!("@END_{n}\n0;JMP\n"));
            wr.w(&format!("(TRUE_{n})\n@SP\nA=M-1\nM=-1\n"));
            wr.w(&format!("(END_{n})\n"));
        }
        _ => {}
    }
}

fn write_push(wr: &mut Writer, current_file: &str, seg: &str, index: u16) {
    let push = "@SP\nA=M\nM=D\n@SP\nM=M+1\n";
    match seg {
        "constant" => {
            wr.w(&format!("@{index}\nD=A\n"));
            wr.w(push);
        }
        "local" | "argument" | "this" | "that" => {
            let sym = match seg {
                "local" => "LCL",
                "argument" => "ARG",
                "this" => "THIS",
                _ => "THAT",
            };
            wr.w(&format!("@{index}\nD=A\n@{sym}\nA=D+M\nD=M\n"));
            wr.w(push);
        }
        "temp" => {
            wr.w(&format!("@{}\nD=M\n", 5 + index));
            wr.w(push);
        }
        "pointer" => {
            let sym = if index == 0 { "THIS" } else { "THAT" };
            wr.w(&format!("@{sym}\nD=M\n"));
            wr.w(push);
        }
        "static" => {
            wr.w(&format!("@{current_file}.{index}\nD=M\n"));
            wr.w(push);
        }
        _ => {}
    }
}

fn write_pop(wr: &mut Writer, current_file: &str, seg: &str, index: u16) {
    match seg {
        "local" | "argument" | "this" | "that" => {
            let sym = match seg {
                "local" => "LCL",
                "argument" => "ARG",
                "this" => "THIS",
                _ => "THAT",
            };
            wr.w(&format!("@{index}\nD=A\n@{sym}\nD=D+M\n@R13\nM=D\n"));
            wr.w("@SP\nAM=M-1\nD=M\n@R13\nA=M\nM=D\n");
        }
        "temp" => {
            wr.w(&format!("@SP\nAM=M-1\nD=M\n@{}\nM=D\n", 5 + index));
        }
        "pointer" => {
            let sym = if index == 0 { "THIS" } else { "THAT" };
            wr.w(&format!("@SP\nAM=M-1\nD=M\n@{sym}\nM=D\n"));
        }
        "static" => {
            wr.w(&format!("@SP\nAM=M-1\nD=M\n@{current_file}.{index}\nM=D\n"));
        }
        // C 版對 constant 的 pop 不做任何事
        _ => {}
    }
}

fn write_function(wr: &mut Writer, name: &str, n_locals: u16) {
    wr.w(&format!("({name})\n"));
    for _ in 0..n_locals {
        wr.w("@SP\nA=M\nM=0\n@SP\nM=M+1\n");
    }
}

fn write_call(wr: &mut Writer, name: &str, n_args: u16) {
    let ret = format!("{name}$ret.{}", wr.return_count);
    wr.return_count += 1;
    // push return address
    wr.w(&format!("@{ret}\nD=A\n@SP\nA=M\nM=D\n@SP\nM=M+1\n"));
    // push LCL, ARG, THIS, THAT
    wr.w("@LCL\nD=M\n@SP\nA=M\nM=D\n@SP\nM=M+1\n");
    wr.w("@ARG\nD=M\n@SP\nA=M\nM=D\n@SP\nM=M+1\n");
    wr.w("@THIS\nD=M\n@SP\nA=M\nM=D\n@SP\nM=M+1\n");
    wr.w("@THAT\nD=M\n@SP\nA=M\nM=D\n@SP\nM=M+1\n");
    // ARG = SP - 5 - n_args
    wr.w(&format!("@SP\nD=M\n@5\nD=D-A\n@{n_args}\nD=D-A\n@ARG\nM=D\n"));
    // LCL = SP
    wr.w("@SP\nD=M\n@LCL\nM=D\n");
    // goto function
    wr.w(&format!("@{name}\n0;JMP\n"));
    // (return label)
    wr.w(&format!("({ret})\n"));
}

fn write_return(wr: &mut Writer) {
    // frame = LCL
    wr.w("@LCL\nD=M\n@R13\nM=D\n");
    // retAddr = *(frame-5)
    wr.w("@5\nA=D-A\nD=M\n@R14\nM=D\n");
    // *ARG = pop()
    wr.w("@SP\nAM=M-1\nD=M\n@ARG\nA=M\nM=D\n");
    // SP = ARG + 1
    wr.w("@ARG\nD=M+1\n@SP\nM=D\n");
    // THAT = *(frame-1)
    wr.w("@R13\nAM=M-1\nD=M\n@THAT\nM=D\n");
    // THIS = *(frame-2)
    wr.w("@R13\nAM=M-1\nD=M\n@THIS\nM=D\n");
    // ARG = *(frame-3)
    wr.w("@R13\nAM=M-1\nD=M\n@ARG\nM=D\n");
    // LCL = *(frame-4)
    wr.w("@R13\nAM=M-1\nD=M\n@LCL\nM=D\n");
    // goto retAddr
    wr.w("@R14\nA=M\n0;JMP\n");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(src: &str) -> String {
        translate_file(src, "SimpleAdd")
    }

    #[test]
    fn simple_add() {
        let out = t("push constant 2\npush constant 3\nadd\n");
        let expect = "\
// push constant 2
@2
D=A
@SP
A=M
M=D
@SP
M=M+1
// push constant 3
@3
D=A
@SP
A=M
M=D
@SP
M=M+1
// add
@SP
AM=M-1
D=M
A=A-1
M=D+M
";
        assert_eq!(out, expect);
    }

    #[test]
    fn comparison_uses_true_end_labels() {
        let out = t("push constant 1\npush constant 2\neq\npush constant 3\ngt\n");
        assert!(out.contains("@TRUE_0\nD;JEQ\n"));
        assert!(out.contains("(TRUE_0)\n@SP\nA=M-1\nM=-1\n"));
        assert!(out.contains("(END_0)\n"));
        assert!(out.contains("@TRUE_1\nD;JGT\n"));
    }

    #[test]
    fn segments() {
        let out = t(concat!(
            "push local 2\n",
            "pop this 3\n",
            "push temp 1\n",
            "pop pointer 1\n",
            "push static 4\n",
            "pop static 4\n",
        ));
        assert!(out.contains("@LCL\nA=D+M\nD=M\n"));
        assert!(out.contains("@THIS\nD=D+M\n@R13\nM=D\n"));
        assert!(out.contains("@6\nD=M\n"));
        assert!(out.contains("@THAT\nM=D\n"));
        assert!(out.contains("@SimpleAdd.4\nD=M\n"));
        assert!(out.contains("@SimpleAdd.4\nM=D\n"));
    }

    #[test]
    fn function_call_return() {
        let out = t("function Foo.test 2\npush local 0\ncall Bar.main 1\nreturn\n");
        assert!(out.contains("(Foo.test)\n@SP\nA=M\nM=0\n@SP\nM=M+1\n"));
        assert!(out.contains("(Bar.main$ret.0)\n"));
        assert!(out.contains("@SP\nD=M\n@5\nD=D-A\n@1\nD=D-A\n@ARG\nM=D\n"));
        assert!(out.contains("@R13\nAM=M-1\nD=M\n@LCL\nM=D\n"));
        assert!(out.contains("@R14\nA=M\n0;JMP\n"));
    }

    #[test]
    fn bootstrap_layout() {
        let out = translate(
            &[
                ("Sys.vm".into(), "function Sys.init 0\nreturn\n".into()),
                ("Main.vm".into(), "function Main.main 0\nreturn\n".into()),
            ],
            true,
        );
        assert!(out.starts_with(
            "// Bootstrap code\n// Initialize SP = 256\n@256\nD=A\n@SP\nM=D\n// Call Sys.init\n"
        ));
        assert!(out.contains("(Sys.init$ret.0)"));
        assert!(out.contains("// ========== File: Main.vm ==========\n"));
        assert!(out.contains("(Sys.init)\n"));

        // 單一檔案不加 bootstrap
        let single = translate(&[("SimpleAdd.vm".into(), "push constant 1\n".into())], false);
        assert!(!single.contains("@256"));
    }

    #[test]
    fn multifile_scopes_user_labels() {
        // 兩檔各自有 `label WHILE_EXP2`：多檔模式必須加函式前綴避免相撞
        let out = translate(
            &[
                (
                    "A.vm".into(),
                    "function A.f 0\nlabel WHILE_EXP2\ngoto WHILE_EXP2\nif-goto WHILE_EXP2\nreturn\n".into(),
                ),
                (
                    "B.vm".into(),
                    "function B.g 0\nlabel WHILE_EXP2\ngoto WHILE_EXP2\nif-goto WHILE_EXP2\nreturn\n".into(),
                ),
            ],
            true,
        );
        assert!(out.contains("(A.f$WHILE_EXP2)\n"));
        assert!(out.contains("(B.g$WHILE_EXP2)\n"));
        assert!(out.contains("@A.f$WHILE_EXP2\n0;JMP\n"));
        assert!(out.contains("@A.f$WHILE_EXP2\nD;JNE\n"));
        // 不能有未加前綴的裸標記
        assert!(!out.contains("(WHILE_EXP2)\n"));
    }

    #[test]
    fn single_file_keeps_raw_labels() {
        // 單檔模式與 C 版逐位元一致：標記不加工
        let out = t("function A.f 0\nlabel WHILE_EXP2\ngoto WHILE_EXP2\nif-goto WHILE_EXP2\nreturn\n");
        assert!(out.contains("(WHILE_EXP2)\n"));
        assert!(out.contains("@WHILE_EXP2\n0;JMP\n"));
        assert!(out.contains("@WHILE_EXP2\nD;JNE\n"));
    }
}