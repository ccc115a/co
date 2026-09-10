//! `hackemu` GUI：用 egui/eframe 開一個視窗，顯示 HACK 螢幕（512×256）、
//! KBD 鍵盤輸入，並提供 載入 / 執行 / 暫停 / 單步 / 重置 / 速度 控制。
//!
//! 用法：
//! - `hackemu [file.bin|file.hack]`       開 GUI（可先載入程式）
//! - `hackemu --headless <file> [--max N]` 無畫面執行 N 條並印出狀態（測試用）

use std::collections::BTreeSet;
use std::path::Path;

use eframe::egui;
use hackemu::{
    Vm, KEY_BACKSPACE, KEY_DELETE, KEY_DOWN, KEY_END, KEY_ESCAPE, KEY_HOME, KEY_INSERT, KEY_LEFT,
    KEY_NEWLINE, KEY_PAGE_DOWN, KEY_PAGE_UP, KEY_RIGHT, KEY_UP, KEY_F1, SCREEN_COLS,
    SCREEN_ROWS,
};

fn main() -> eframe::Result {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(i) = args.iter().position(|a| a == "--headless") {
        return headless(&args[i + 1..]);
    }
    let file = args.first().cloned();
    eframe::run_native(
        "HACK Emulator",
        eframe::NativeOptions {
            viewport: egui::ViewportBuilder::default()
                .with_inner_size([760.0, 560.0])
                .with_min_inner_size([480.0, 360.0]),
            ..Default::default()
        },
        Box::new(move |_cc| {
            let mut app = HackApp::new();
            if let Some(f) = &file {
                let _ = app.load(f);
            }
            Ok(Box::new(app))
        }),
    )
}

/// egui 的 Key → HACK 鍵盤碼（ASCII 32-126 + 128-152 特殊鍵），依值傳入。
fn key_code(key: egui::Key) -> Option<u16> {
    use egui::Key;
    let k = key as u8;
    if (Key::A as u8..=Key::Z as u8).contains(&k) {
        return Some(b'A' as u16 + (k - Key::A as u8) as u16);
    }
    if (Key::Num0 as u8..=Key::Num9 as u8).contains(&k) {
        return Some(b'0' as u16 + (k - Key::Num0 as u8) as u16);
    }
    if (Key::F1 as u8..=Key::F12 as u8).contains(&k) {
        return Some(KEY_F1 + (k - Key::F1 as u8) as u16);
    }
    let code = match key {
        Key::Home => KEY_HOME,
        Key::End => KEY_END,
        Key::PageUp => KEY_PAGE_UP,
        Key::PageDown => KEY_PAGE_DOWN,
        Key::Insert => KEY_INSERT,
        Key::Delete => KEY_DELETE,
        Key::Escape => KEY_ESCAPE,
        Key::ArrowLeft => KEY_LEFT,
        Key::ArrowUp => KEY_UP,
        Key::ArrowRight => KEY_RIGHT,
        Key::ArrowDown => KEY_DOWN,
        Key::Enter => KEY_NEWLINE,
        Key::Backspace => KEY_BACKSPACE,
        Key::Space => b' ' as u16,
        Key::Minus => b'-' as u16,
        Key::Equals => b'=' as u16,
        Key::Comma => b',' as u16,
        Key::Period => b'.' as u16,
        Key::Slash => b'/' as u16,
        Key::Semicolon => b';' as u16,
        Key::Colon => b':' as u16,
        Key::Backtick => b'`' as u16,
        Key::OpenBracket => b'[' as u16,
        Key::CloseBracket => b']' as u16,
        Key::OpenCurlyBracket => b'{' as u16,
        Key::CloseCurlyBracket => b'}' as u16,
        Key::Backslash => b'\\' as u16,
        Key::Quote => b'\'' as u16,
        Key::Pipe => b'|' as u16,
        Key::Questionmark => b'?' as u16,
        Key::Exclamationmark => b'!' as u16,
        _ => return None,
    };
    Some(code)
}

struct HackApp {
    vm: Vm,
    path: String,
    status: String,
    running: bool,
    steps_per_frame: usize,
    texture: Option<egui::TextureHandle>,
    pressed: BTreeSet<u16>,
}

impl HackApp {
    fn new() -> Self {
        HackApp {
            vm: Vm::new(),
            path: String::new(),
            status: "No program loaded".into(),
            running: false,
            steps_per_frame: 500,
            texture: None,
            pressed: BTreeSet::new(),
        }
    }

    fn load(&mut self, path: &str) -> Result<(), String> {
        self.vm.load_file(path)?;
        self.pressed.clear();
        self.vm.set_key(0);
        self.path = path.to_string();
        self.status = format!(
            "Loaded {} ({} instructions)",
            Path::new(path)
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default(),
            self.vm.rom.len()
        );
        self.running = false;
        Ok(())
    }

    /// 從 egui 事件更新 KBD（HACK 鍵盤只剩一組鍵碼，取最後按下的）。
    fn handle_input(&mut self, ctx: &egui::Context) {
        let events: Vec<egui::Event> = ctx.input(|i| i.events.clone());
        for ev in events {
            match ev {
                egui::Event::Key {
                    key,
                    physical_key,
                    pressed,
                    repeat,
                    ..
                } => {
                    let code = key_code(key).or_else(|| physical_key.and_then(key_code));
                    if let Some(c) = code {
                        if pressed && !repeat {
                            self.pressed.insert(c);
                        } else if !pressed {
                            self.pressed.remove(&c);
                        }
                    }
                }
                egui::Event::Text(text) => {
                    if let Some(&c) = text.as_bytes().last() {
                        self.pressed.insert(c as u16);
                    }
                }
                _ => {}
            }
        }
        let kbd = self.pressed.iter().next_back().copied().unwrap_or(0);
        self.vm.set_key(kbd);
    }

    fn refresh_screen(&mut self, ctx: &egui::Context) {
        let mut px = vec![egui::Color32::from_rgb(240, 240, 240); SCREEN_ROWS * SCREEN_COLS];
        for r in 0..SCREEN_ROWS {
            for c in 0..SCREEN_COLS {
                if self.vm.screen_pixel(r, c) {
                    px[r * SCREEN_COLS + c] = egui::Color32::from_rgb(0, 0, 0);
                }
            }
        }
        let img = egui::ColorImage::new([SCREEN_COLS, SCREEN_ROWS], px);
        if let Some(t) = &mut self.texture {
            t.set(img, egui::TextureOptions::NEAREST);
        } else {
            self.texture = Some(ctx.load_texture("screen", img, egui::TextureOptions::NEAREST));
        }
    }
}

impl eframe::App for HackApp {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        self.handle_input(&ctx);
        if self.running && self.steps_per_frame > 0 {
            self.vm.run(self.steps_per_frame as u64);
        }

        egui::Panel::top("controls").show(ui, |ui| {
            ui.horizontal(|ui| {
                let load_clicked = ui.button("Load").clicked();
                let resp = ui.add(egui::TextEdit::singleline(&mut self.path).desired_width(300.0));
                if load_clicked
                    || (resp.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)))
                {
                    let path = self.path.trim().to_string();
                    match self.load(&path) {
                        Ok(()) => {}
                        Err(e) => self.status = e,
                    }
                }
                if ui.button(if self.running { "Pause" } else { "Run" }).clicked() {
                    self.running = !self.running;
                }
                ui.add_enabled(!self.running, egui::Button::new("Step")).clicked().then(|| {
                    self.vm.run(1);
                });
                if ui.button("Reset").clicked() {
                    self.vm.reset();
                    self.running = false;
                }
                ui.label("Speed");
                ui.add(egui::Slider::new(&mut self.steps_per_frame, 0..=50_000).logarithmic(true));
                ui.label("(instr/frame)");
            });
            ui.horizontal(|ui| {
                ui.label(self.status.clone());
                ui.separator();
                ui.monospace(format!(
                    "PC {:04X}  A {:04X}  D {:04X}  SP {}  cycles {}",
                    self.vm.pc, self.vm.a, self.vm.d, self.vm.ram[0], self.vm.cycles
                ));
            });
        });

        self.refresh_screen(&ctx);

        egui::CentralPanel::default().show(ui, |ui| {
            if let Some(tex) = &self.texture {
                let avail = ui.available_size();
                let scale = (avail.x / SCREEN_COLS as f32)
                    .min(avail.y / SCREEN_ROWS as f32)
                    .min(2.0);
                let size = egui::vec2(SCREEN_COLS as f32 * scale, SCREEN_ROWS as f32 * scale);
                ui.centered_and_justified(|ui| {
                    ui.add(egui::Image::new((tex.id(), size)));
                });
            } else {
                ui.centered_and_justified(|ui| {
                    ui.label("No program loaded — type a path and press Load");
                });
            }
        });
    }
}

/// `--headless <file> [--max N]`：不開視窗，跑 N 條後印出狀態（供自動化/驗證）。
fn headless(args: &[String]) -> eframe::Result {
    let Some(file) = args.first() else {
        eprintln!("usage: hackemu --headless <file.bin|.hack> [--max N]");
        std::process::exit(2);
    };
    let mut max = 100_000u64;
    if let Some(i) = args.iter().position(|a| a == "--max") {
        max = args.get(i + 1).and_then(|s| s.parse().ok()).unwrap_or(max);
    }
    let mut vm = Vm::new();
    if let Err(e) = vm.load_file(file) {
        eprintln!("{e}");
        std::process::exit(2);
    }
    println!("loaded {} ({} instructions)", file, vm.rom.len());
    println!("before: PC={} A={} D={} SP={}", vm.pc, vm.a, vm.d, vm.ram[0]);
    vm.run(max);
    println!(
        "after: PC={} A={} D={} SP={} cycles={}",
        vm.pc, vm.a, vm.d, vm.ram[0], vm.cycles
    );
    println!("RAM[0..16]: {:?}\nRAM[16] static: {}", &vm.ram[0..16], vm.ram[16]);
    Ok(())
}