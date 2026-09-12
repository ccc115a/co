//! `hackserve`：網頁版 HACK CPU/OS Emulator 的伺服端（v0.8，路線 B）。
//!
//! - `GET /` 與靜態檔：`../web/`（瀏覽器薄前端，純 HTML/JS/Canvas）。
//! - `GET /ws` WebSocket：每連線一個獨立 `hackemu::Vm`。
//! - 協定（JSON over WS，見 `_doc/v0.8.md`）：
//!   - c→s `assemble{asm}` ／ `load{asm}`
//!   - c→s `simulate{steps}`／`step`／`reset`
//!   - c→s `setKey{code,down}` ／ `ramDump{start,len}`
//!   - s→c `snapshot{pc,a,d,sp,cycles,halted,kbd,rows:[{r,g,b}]}`（螢幕差量 base64）
//!
//! 每幀模型與 egui 版一致：前端節拍 → `simulate` → snapshot → 繪製。

use axum::extract::ws::{Message, Utf8Bytes, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use hackemu::{SCREEN_BASE, SCREEN_ROWS, SCREEN_WORDS, KBD_ADDR, Vm};
use serde_json::{json, Value};
use std::net::SocketAddr;
use tower_http::services::ServeDir;

mod hdl;

/// 單一連線的模擬器 state：一個 VM + 螢幕差量追蹤 + 組譯上下文。
struct SessionState {
    vm: Vm,
    rom_words: usize,
    asm: String,
    /// 第 i 個 asm 行 → ROM 位址；None = 註解/空白/標籤（不產指令）。
    line_map: Vec<Option<usize>>,
    /// 上一幀 SCREEN 內容（比 word）、每列版本號。
    last_screen: Vec<u16>,
    gen: Vec<u32>,
}

impl SessionState {
    fn new() -> Self {
        SessionState {
            vm: Vm::new(),
            rom_words: 0,
            asm: String::new(),
            line_map: Vec::new(),
            last_screen: vec![0; SCREEN_WORDS],
            gen: vec![0; SCREEN_ROWS],
        }
    }

    fn set_asm(&mut self, asm: &str, words: &[u16]) {
        self.asm = asm.to_string();
        self.rom_words = words.len();
        // .asm 一行 = 一 ROM word（hackasm 不含多行巨集）；跳過註解/空白/標籤。
        self.line_map = Vec::new();
        let mut addr = 0usize;
        for line in asm.lines() {
            let t = line.split("//").next().unwrap_or("").trim();
            if t.is_empty() || (t.starts_with('(') && t.ends_with(')')) {
                self.line_map.push(None);
            } else {
                self.line_map.push(Some(addr));
                addr += 1;
            }
        }
    }

    /// 掃描 SCREEN 與上次快照的差異，包成每列的 base64 差量（word 大端序）。
    fn snapshot(&mut self, reset: bool, id: u64) -> String {
        let mut rows = Vec::new();
        for r in 0..SCREEN_ROWS {
            let off = r * 32;
            let cur = &self.vm.ram[SCREEN_BASE + off..SCREEN_BASE + off + 32];
            if cur != &self.last_screen[off..off + 32] {
                self.last_screen[off..off + 32].copy_from_slice(cur);
                self.gen[r] = self.gen[r].wrapping_add(1);
                let mut bytes = [0u8; 64];
                for w in 0..32 {
                    let word = cur[w];
                    bytes[2 * w] = (word >> 8) as u8; // 大端序，JS 端 DataView.getUint16(i,false)
                    bytes[2 * w + 1] = word as u8;
                }
                rows.push(json!({ "r": r, "g": self.gen[r], "b": STANDARD.encode(bytes) }));
            }
        }
        json!({
            "type": "snapshot",
            "id": id,
            "reset": reset,
            "pc": self.vm.pc,
            "a": self.vm.a,
            "d": self.vm.d,
            "sp": self.vm.ram[0],
            "cycles": self.vm.cycles,
            "halted": (self.vm.pc as usize) >= self.vm.rom.len(),
            "kbd": self.vm.ram[KBD_ADDR],
            "lines": self.vm.rom.len(),
            "regs": self.vm.ram[0..16].to_vec(),
            "rows": rows,
        })
        .to_string()
    }
}

/// 處理一條客戶端訊息，回傳要送出的訊息（可能多條/空）。
fn handle_text(state: &mut SessionState, text: &str) -> Vec<String> {
    let id = serde_json::from_str::<Value>(text)
        .ok()
        .and_then(|v| v["id"].as_u64())
        .unwrap_or(0);
    let v: Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(e) => return vec![reply(&json!({"type":"error","message": e.to_string()}), id)],
    };
    let t = v["type"].as_str().unwrap_or("");
    let asm = v["asm"].as_str().unwrap_or("").to_string();
    match t {
        "assemble" => match hackasm::assemble_err(&asm) {
            Ok(words) => {
                state.set_asm(&asm, &words);
                vec![reply(
                    &json!({"type":"asm-result","ok":true,"words":words.len(),
                            "lines":asm.lines().count()}),
                    id,
                )]
            }
            Err(e) => vec![reply(
                &json!({"type":"asm-result","ok":false,"error":e.message,
                        "errorLine":e.line,"lines":asm.lines().count()}),
                id,
            )],
        },
        "load" => match hackasm::assemble_err(&asm) {
            Ok(words) => {
                let mut bytes = Vec::with_capacity(words.len() * 2);
                for w in &words {
                    bytes.extend_from_slice(&w.to_le_bytes());
                }
                state.vm.reset();
                state.vm.load_bin(&bytes).ok();
                state.set_asm(&asm, &words);
                vec![reply(
                    &json!({"type":"loaded","ok":true,"rom":words.len(),
                            "lines":asm.lines().count(),
                            "map": state.line_map}),
                    id,
                )]
            }
            Err(e) => vec![reply(
                &json!({"type":"loaded","ok":false,"error":e.message,
                        "errorLine":e.line,"lines":asm.lines().count()}),
                id,
            )],
        },
        "simulate" | "step" => {
            let n = if t == "step" {
                1
            } else {
                v["steps"].as_u64().unwrap_or(1_000_000)
            };
            state.vm.run(n);
            vec![state.snapshot(false, id)]
        }
        "reset" => {
            state.vm.reset();
            vec![state.snapshot(true, id)]
        }
        "setKey" => {
            let code = v["code"].as_u64().unwrap_or(0) as u16;
            let down = v["down"].as_bool().unwrap_or(true);
            state.vm.set_key(if down { code } else { 0 });
            vec![]
        }
        "ramDump" => {
            let start = v["start"].as_u64().unwrap_or(0) as usize;
            let len = v["len"].as_u64().unwrap_or(64).min(512) as usize;
            let data: Vec<u16> = state.vm.ram[start..start + len.min(state.vm.ram.len() - start)]
                .iter()
                .copied()
                .collect();
            vec![reply(&json!({"type":"ramDump","start":start,"len":data.len(),"data":data}), id)]
        }
        other => vec![reply(&json!({"type":"error","message": format!("未知訊息型別：{other}")}), id)],
    }
}

/// 回包帶 id 的送出訊息。
pub(crate) fn reply(body: &Value, id: u64) -> String {
    let mut m = body.clone();
    if let Value::Object(o) = &mut m {
        o.insert("id".into(), Value::from(id));
    }
    m.to_string()
}

#[tokio::main]
async fn main() {
    let web = format!("{}/../web", env!("CARGO_MANIFEST_DIR"));
    let app = Router::new()
        .route("/ws", get(ws_handler))
        .fallback_service(ServeDir::new(web));
    let port: u16 = std::env::args()
        .collect::<Vec<_>>()
        .windows(2)
        .find(|w| w[0] == "--port")
        .and_then(|w| w[1].parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .unwrap_or_else(|e| panic!("bind {addr}: {e}"));
    println!("hackserve 已在 http://127.0.0.1:{port} 提供（WebSocket /ws）");
    axum::serve(listener, app).await.unwrap();
}

async fn ws_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(session)
}

/// 每連線一 session：依序處理訊息、送回 snapshot。
async fn session(mut ws: WebSocket) {
    let mut state = SessionState::new();
    while let Some(msg) = ws.recv().await {
        let Ok(msg) = msg else { break };
        let Message::Text(txt) = msg else { continue };
        // hdl-* 訊息是 async 路徑（會 spawn hdl2rs / 孵 cargo），其餘走原 sync 路徑
        let v: Value = serde_json::from_str(&txt).unwrap_or_default();
        let t = v["type"].as_str().unwrap_or("").to_string();
        if t == "hdl-list" {
            let id = v["id"].as_u64().unwrap_or(0);
            let r = reply(&hdl::list_corpus(), id);
            if ws.send(Message::Text(Utf8Bytes::from(r))).await.is_err() {
                return;
            }
        } else if t == "hdl-source" {
            let id = v["id"].as_u64().unwrap_or(0);
            let r = hdl::source_reply(&v, id);
            if ws.send(Message::Text(Utf8Bytes::from(r))).await.is_err() {
                return;
            }
        } else if t == "hdl-run" {
            let id = v["id"].as_u64().unwrap_or(0);
            let r = hdl::run_reply(&v, id).await;
            if ws.send(Message::Text(Utf8Bytes::from(r))).await.is_err() {
                return;
            }
        } else {
            for r in handle_text(&mut state, &txt) {
                if ws.send(Message::Text(Utf8Bytes::from(r))).await.is_err() {
                    return;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap(s: &mut SessionState) -> Value {
        serde_json::from_str(&s.snapshot(false, 0)).unwrap()
    }

    /// 從某個 snapshot 的 rows 中抽指定 row 的 base64，解回 32 個 u16。
    fn extract_row(snap: &Value, r0: usize) -> Vec<u16> {
        for row in snap["rows"].as_array().unwrap() {
            if row["r"].as_u64().unwrap() as usize == r0 {
                let b = STANDARD.decode(row["b"].as_str().unwrap()).unwrap();
                return (0..32).map(|i| u16::from_be_bytes([b[2 * i], b[2 * i + 1]])).collect();
            }
        }
        vec![]
    }

    const ADD: &str = "@2\nD=A\n@3\nD=D+A\n@0\nM=D\n@0\n0;JMP\n";

    #[test]
    fn load_then_simulate_r1_eq5() {
        let mut s = SessionState::new();
        let out = handle_text(&mut s, &json!({"type":"load","asm":ADD}).to_string());
        let loaded: Value = serde_json::from_str(&out[0]).unwrap();
        assert!(loaded["ok"].as_bool().unwrap());
        assert_eq!(loaded["rom"].as_u64().unwrap(), 8);
        // RAM[0]=5：跑 8 條已到 0;JMP
        let out = handle_text(&mut s, &json!({"type":"simulate","steps":8}).to_string());
        let snap: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(snap["sp"].as_u64().unwrap(), 5);
        assert_eq!(snap["pc"].as_u64().unwrap(), 0, "末尾 0;JMP 跳回 ROM[0]");
        assert!(!snap["halted"].as_bool().unwrap());
        // line_map：ADD 8 行全部有指令 → 0..7
        assert_eq!(s.line_map.iter().flatten().copied().collect::<Vec<_>>(), vec![0,1,2,3,4,5,6,7]);
    }

    #[test]
    fn screen_delta_sends_changed_row() {
        let mut s = SessionState::new();
        let out = handle_text(&mut s, &json!({"type":"load","asm":"@SCREEN\nM=-1\n@0\n0;JMP\n"}).to_string());
        assert!(serde_json::from_str::<Value>(&out[0]).unwrap()["ok"].as_bool().unwrap());
        // step1=@SCREEN（A 指令），step2=M=-1 才寫入
        let out = handle_text(&mut s, &json!({"type":"simulate","steps":2}).to_string());
        let snap: Value = serde_json::from_str(&out[0]).unwrap();
        let words = extract_row(&snap, 0);
        assert_eq!(words[0], 0xFFFF, "row0 word0 應全黑");
        // 第二次 simulate 不再送變動（畫面沒變）→ rows 空
        let out = handle_text(&mut s, &json!({"type":"simulate","steps":1}).to_string());
        let snap2: Value = serde_json::from_str(&out[0]).unwrap();
        assert!(snap2["rows"].as_array().unwrap().is_empty());
    }

    #[test]
    fn reset_blanks_screen() {
        let mut s = SessionState::new();
        let _ = handle_text(&mut s, &json!({"type":"load","asm":"@SCREEN\nM=-1\n@0\n0;JMP\n"}).to_string());
        let out = handle_text(&mut s, &json!({"type":"simulate","steps":2}).to_string());
        let snap: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(extract_row(&snap, 0)[0], 0xFFFF);
        let out = handle_text(&mut s, &json!({"type":"reset"}).to_string());
        let snap: Value = serde_json::from_str(&out[0]).unwrap();
        assert!(snap["reset"].as_bool().unwrap());
        let w = extract_row(&snap, 0);
        assert_eq!(w[0], 0, "reset 後 row0 應全白");
    }

    #[test]
    fn assemble_error_reports() {
        let mut s = SessionState::new();
        let out = handle_text(&mut s, &json!({"type":"load","asm":"@2\nXXX\n"}).to_string());
        let m: Value = serde_json::from_str(&out[0]).unwrap();
        assert!(!m["ok"].as_bool().unwrap());
        assert_eq!(m["errorLine"].as_u64().unwrap(), 2, "錯誤應指向第 2 行");
        assert!(m["error"].as_str().unwrap().contains("C 指令"));
    }
}