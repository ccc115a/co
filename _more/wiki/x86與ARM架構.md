---
tags: [處理器架構, x86, ARM, RISC, CISC]
date: 2026-04-15
source_count: 2
last_updated: 2026-04-15
---

# x86 與 ARM 架構：主流處理器設計

## 概述

x86 和 ARM 是當今最廣泛使用的兩大處理器架構。x86 由 Intel 在 1978 年推出，最初用於個人電腦，如今主宰著桌上型電腦、筆電和伺服器市場。ARM（Acorn RISC Machine）成立於 1990 年，專注於精簡指令集計算，最初用於嵌入式系統，如今已成為行動裝置、物聯網和蘋果 M 系列晶片的基礎。

理解這兩種架構的差異對於系統程式設計、效能優化和跨平台開發至關重要。x86 是複雜指令集計算（CISC）架構，強調指令的功能豐富性；ARM 是精簡指令集計算（RISC）架構，強調指令的簡潔和高效執行。兩種架構各有優勢：x86 在需要強大運算能力的場景表現出色，ARM 在功耗敏感的場景更具優勢。

## x86 架構

### 歷史與發展

x86 架構始於 Intel 8086 處理器，此後經歷了多次重大演進。從 16 位元的 8086/8088，到 32 位元的 80386（IA-32），再到 64 位元的 x86-64（由 AMD 推出，又稱 AMD64），x86 架構不斷擴展以滿足效能需求。

```assembly
; x86-64 基礎語法
section .data
    message db 'Hello, World!', 0
    fmt db '%s', 0

section .text
    global _start

_start:
    ; 系統呼叫寫入 stdout
    mov rax, 1          ; sys_write
    mov rdi, 1          ; file descriptor (stdout)
    mov rsi, message    ; buffer address
    mov rdx, 13         ; length
    syscall

    ; 系統呼叫退出
    mov rax, 60         ; sys_exit
    xor rdi, rdi        ; exit code 0
    syscall
```

### 暫存器架構

x86-64 提供 16 個通用暫存器，每個 64 位元。這些暫存器有特定的用途約定，在函數呼叫中有明確的角色定義。

```assembly
; x86-64 暫存器使用約定
; 呼叫者保存 (Caller-saved): rax, rcx, rdx, rsi, rdi, r8-r11

; 被呼叫者保存 (Callee-saved): rbx, rbp, r12-r15

; 特殊用途暫存器
; rax: 返回值、乘法/除法結果、系統呼叫號
; rsp: 堆疊指標 (Stack Pointer)
; rbp: 框架指標 (Frame Pointer)
; rip: 指令指標 (Instruction Pointer)
; rflags: 狀態標誌

; 函數呼叫示例
; size_t strlen(const char* str)
strlen:
    xor rax, rax        ; rax = 0 (計數器)
.loop:
    cmp byte [rdi + rax], 0  ; 比較字元是否為 '\0'
    je .done            ; 如果是則結束
    inc rax             ; 否則計數器 +1
    jmp .loop           ; 繼續循環
.done:
    ret                 ; 返回計數器值

; 棧幀操作
push rbp
mov rbp, rsp
sub rsp, 32            ; 分配本地變量空間
; ... 函數體 ...
mov rsp, rbp
pop rbp
ret

; 結構化異常處理 (SEH) - Windows
; 使用 .try/.except 塊處理異常
```

### SIMD 指令集

x86 提供多種 SIMD（單指令多數據）擴展，用於加速多媒體和科學計算。

```assembly
; SSE/AVX 指令示例 - 向量加法
section .text
    global vector_add

vector_add:
    ; 輸入: rdi = 目標陣列, rsi = 源陣列, rdx = 元素數量
    xor rcx, rcx                    ; i = 0
    mov rax, rdx                    ; 保存元素數量
    sar rdx, 4                     ; 元素數/16 (AVX 處理 256-bit = 8 float)
    
.loop:
    vmovups ymm0, [rsi + rcx * 4]  ; 加載 8 個 float
    vaddps ymm0, ymm0, [rdi + rcx * 4]  ; ymm0 = ymm0 + 目標[i]
    vmovups [rdi + rcx * 4], ymm0  ; 儲存結果
    add rcx, 8                     ; i += 8
    dec rdx
    jnz .loop
    
    vzeroupper                      ; 清除上半部 YMM 狀態
    ret

; 使用 SIMD 加速的 memcpy
memcpy_simd:
    push rbp
    mov rbp, rsp
    mov rax, rdi                    ; 保存目標地址
    mov rcx, rdx                    ; 字節數
    and rdi, -32                    ; 對齊目標地址
    and rsi, -32                    ; 對齊源地址
    
    ; 處理對齊部分 (32-byte 塊)
    shr rcx, 5                      ; /32
.loop_aligned:
    vmovups ymm0, [rsi]
    vmovups ymm1, [rsi + 32]
    vmovups ymm2, [rsi + 64]
    vmovups ymm3, [rsi + 96]
    vmovups [rdi], ymm0
    vmovups [rdi + 32], ymm1
    vmovups [rdi + 64], ymm2
    vmovups [rdi + 96], ymm3
    add rsi, 128
    add rdi, 128
    dec rcx
    jnz .loop_aligned
    
    vzeroupper
    pop rbp
    ret
```

### C 語言與 x86 組合

```c
// x86-64 系統呼叫接口
// Linux 系統呼叫號
#define SYS_READ  0
#define SYS_WRITE 1
#define SYS_EXIT 60

// 內聯組裝示例
static inline long syscall(long n, long a, long b, long c, long d, long e, long f) {
    long ret;
    __asm__ volatile (
        "movq %[n], %%rax\n\t"
        "movq %[a], %%rdi\n\t"
        "movq %[b], %%rsi\n\t"
        "movq %[c], %%rdx\n\t"
        "movq %[d], %%r10\n\t"
        "movq %[e], %%r8\n\t"
        "movq %[f], %%r9\n\t"
        "syscall"
        : "=a" (ret)
        : [n] "r" (n), [a] "r" (a), [b] "r" (b), [c] "r" (c),
          [d] "r" (d), [e] "r" (e), [f] "r" (f)
        : "rcx", "r11", "memory"
    );
    return ret;
}

// 優化字節複製
void *fast_memcpy(void *dest, const void *src, size_t n) {
    unsigned char *d = dest;
    const unsigned char *s = src;
    
    // 對齊拷貝
    while ((size_t)d % 8 && n) {
        *d++ = *s++;
        n--;
    }
    
    // SIMD 拷貝
    while (n >= 32) {
        __asm__ volatile (
            "movups %[s], %%xmm0\n\t"
            "movups 16(%[s]), %%xmm1\n\t"
            "movups %%xmm0, %[d]\n\t"
            "movups %%xmm1, 16(%[d])\n\t"
            : [d] "+r" (d), [s] "+r" (s)
            :
            : "xmm0", "xmm1", "memory"
        );
        s += 32;
        d += 32;
        n -= 32;
    }
    
    // 尾部拷貝
    while (n--) {
        *d++ = *s++;
    }
    
    return dest;
}

// 條件分支優化
// 避免分支預測失敗的條件移動
int find_max_branchless(int a, int b) {
    int diff = a - b;
    int sign = diff >> 31;        // 獲取符號位
    return a - ((a - b) & sign);
}

// 使用 likely/unlikely 提示
#define likely(x)   __builtin_expect(!!(x), 1)
#define unlikely(x) __builtin_expect(!!(x), 0)

int binary_search(int *arr, int n, int target) {
    int lo = 0, hi = n;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (likely(arr[mid] < target)) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}
```

## ARM 架構

### 歷史與發展

ARM 架構起源於 1985 年 Acorn Computers 的 ARM1，目前由 ARM Holdings 設計並授權。ARM 採用精簡指令集（RISC）設計，強調高效率、低功耗和簡單的解碼邏輯。ARM 的授權模式使其能夠被多家晶片廠商採用，包括蘋果、三星、高通、華為等。

```assembly
; ARM64 (AArch64) 基礎語法
.section .data
msg:    .asciz "Hello, World!\n"

.section .text
.global _start

_start:
    mov x0, #1              ; file descriptor (stdout)
    ldr x1, =msg            ; buffer address
    mov x2, #14             ; length
    mov x8, #64            ; syscall number (write)
    svc #0                  ; syscall
    
    mov x0, #0              ; exit code
    mov x8, #93             ; syscall number (exit)
    svc #0
```

### 暫存器架構

ARM64 提供 31 個通用暫存器（X0-X30），每個 64 位元。暫存器有明確的呼叫約定。

```assembly
; ARM64 暫存器約定
; X0-X7: 參數和返回值
; X8:    系統呼叫號 / 子程式結果
; X9-X15: 臨時暫存器 (呼叫者保存)
; X19-X28: 保存的臨時暫存器 (被呼叫者保存)
; X29:   框架指標 (FP)
; X30:   連結暫存器 (LR) - 函數返回地址
; SP:    堆疊指標
; PC:    程式計數器

; 函數調用
; x0 = strlen(x1)
strlen:
    mov x0, #0              ; count = 0
.loop:
    ldrb w2, [x1, x0]       ; load byte
    cbz w2, .done           ; if zero, done
    add x0, x0, #1          ; count++
    b .loop
.done:
    ret

; 棧幀操作
function_prologue:
    stp x29, x30, [sp, #-16]!  ; 保存 FP 和 LR
    mov x29, sp                 ; 建立新的框架
    
function_epilogue:
    mov sp, x29                 ; 恢復 SP
    ldp x29, x30, [sp], #16    ; 恢復 FP 和 LR
    ret
```

### SIMD 和向量指令

ARM 提供 NEON SIMD 擴展和 SVE/SVE2 可變向量長度指令。

```assembly
; NEON 指令示例 - 向量加法
.section .text
.global neon_vector_add

neon_vector_add:
    ; x0 = 目標, x1 = 源1, x2 = 源2, x3 = 元素數
    mov x4, #0              ; i = 0
    lsr x5, x3, #2         ; 元素數/4 (每個 vadd 處理 4 個 float)
    
.loop:
    ld1 {v0.4s}, [x1], #16 ; 加載 4 個 float
    ld1 {v1.4s}, [x2], #16 ; 加載 4 個 float
    fadd v0.4s, v0.4s, v1.4s ; 向量加法
    st1 {v0.4s}, [x0], #16 ; 儲存結果
    subs x5, x5, #1
    b.ne .loop
    
    ret

; 矩陣乘法優化 (GEMM)
gemm_neon:
    ; x0 = C (M x N), x1 = A (M x K), x2 = B (K x N), x3 = M, x4 = N, x5 = K
    stp x29, x30, [sp, #-16]!
    mov x29, sp
    
    mov x6, #0              ; i = 0 (M 循環)
.m_loop:
    mov x7, #0             ; j = 0 (N 循環)
.n_loop:
    mov x8, #0             ; k = 0
    eor v0.16b, v0.16b, v0.16b  ; 初始化結果為 0
    
.k_loop:
    ; C[i][j] += A[i][k] * B[k][j]
   ldr q1, [x1, x8, lsl #2]      ; 載入 A[i][k:k+4]
    mov x9, x5
    madd x9, x6, x5, x8         ; k + i*K
    add x10, x2, x7, lsl #2     ; &B[0][j]
    add x10, x10, x8, lsl #2    ; &B[k][j]
    ldr q2, [x10]                ; 載入 B[k:k+4][j]
    fmla v0.4s, v1.4s, v2.4s    ; 乘加
    add x8, x8, #4
    cmp x8, x5
    b.lt .k_loop
    
    ; 儲存結果
    madd x9, x6, x4, x7          ; i*N + j
    str q0, [x0, x9, lsl #2]
    
    add x7, x7, #1
    cmp x7, x4
    b.lt .n_loop
    
    add x6, x6, #1
    cmp x6, x3
    b.lt .m_loop
    
    ldp x29, x30, [sp], #16
    ret
```

### Rust 與 ARM 組合

```rust
// ARM64 內聯組裝
#[cfg(target_arch = "aarch64")]
mod armasm {
    #[inline(always)]
    pub unsafe fn clz(x: u64) -> u32 {
        let result: u32;
        llvm_asm!("clz $0, $1" : "=r"(result) : "r"(x));
        result
    }
    
    #[inline(always)]
    pub unsafe fn atomic_add(ptr: *mut u32, val: u32) -> u32 {
        let result: u32;
        llvm_asm!(
            "1: ldxr w0, [x1]
               add w0, w0, w2
               stxr w3, w0, [x1]
               cbnz w3, 1b"
            : "=&r"(result)
            : "r"(ptr), "r"(val), "{x3}"(0)
            : "memory"
            : "volatile"
        );
        result
    }
}

// 優化的字節複製
#[target_feature(enable = "neon")]
pub unsafe fn memcpy_neon(dst: *mut u8, src: *const u8, len: usize) -> *mut u8 {
    let mut d = dst;
    let s = src;
    let mut n = len;
    
    // 對齊拷貝
    while d.align_offset(16) != 0 && n > 0 {
        *d = *s;
        d = d.add(1);
        s = s.add(1);
        n -= 1;
    }
    
    // NEON 拷貝 (16 bytes per iteration)
    while n >= 64 {
        core::arch::aarch64::vst1q_u8(d, core::arch::aarch64::vld1q_u8(s));
        core::arch::aarch64::vst1q_u8(d.add(16), core::arch::aarch64::vld1q_u8(s.add(16)));
        core::arch::aarch64::vst1q_u8(d.add(32), core::arch::aarch64::vld1q_u8(s.add(32)));
        core::arch::aarch64::vst1q_u8(d.add(48), core::arch::aarch64::vld1q_u8(s.add(48)));
        d = d.add(64);
        s = s.add(64);
        n -= 64;
    }
    
    // 尾部拷貝
    while n > 0 {
        *d = *s;
        d = d.add(1);
        s = s.add(1);
        n -= 1;
    }
    
    dst
}

// 條件執行優化
#[inline(always)]
pub fn conditional_move<T: Copy>(cond: bool, then_val: T, else_val: T) -> T {
    let result: T;
    #[cfg(target_arch = "aarch64")]
    {
        let then_val = then_val;
        let else_val = else_val;
        let cond = cond as u64;
        unsafe {
            llvm_asm!(
                "csel {0}, {1}, {2}, ne",
                out(reg) result,
                in(reg) then_val,
                in(reg) else_val,
                in("x4") cond
            );
        }
    }
    #[cfg(not(target_arch = "aarch64"))]
    {
        result = if cond { then_val } else { else_val };
    }
    result
}

// SIMD 加速的點積
#[target_feature(enable = "neon")]
pub unsafe fn dot_product_f32(a: &[f32], b: &[f32]) -> f32 {
    let mut result = core::arch::aarch64::v dupq_n_f32(0.0);
    
    let chunks = a.chunks(4);
    let b_chunks = b.chunks(4);
    
    for (av, bv) in chunks.zip(b_chunks) {
        let a_vec = core::arch::aarch64::vld1q_f32(av.as_ptr());
        let b_vec = core::arch::aarch64::vld1q_f32(bv.as_ptr());
        result = core::arch::aarch64::vfmaq_f32(result, a_vec, b_vec);
    }
    
    let sum = core::arch::aarch64::vpaddq_f32(result, result);
    core::arch::aarch64::vgetq_lane_f32(sum, 0) + core::arch::aarch64::vgetq_lane_f32(sum, 2)
}
```

## 架構比較

### 指令集特點

```c
// 架構差異總結
/*
| 特性           | x86-64                | ARM64                |
|----------------|----------------------|----------------------|
| 指令集類型     | CISC                 | RISC                 |
| 指令長度       | 1-15 bytes           | 4 bytes (固定)       |
| 暫存器數量     | 16 通用 + 16 SIMD    | 31 通用 + 32 SIMD    |
| 記憶體模型     | TSO (Total Store Order)| TSO                 |
| 函數呼叫約定   | System V / Microsoft | AAPCS                |
| 向量暫存器     | XMM/YMM/ZMM          | V0-V31               |
| 典型功耗       | 15-125W              | 0.5-30W              |
*/

// 跨平台程式設計注意事項
// 1. 位元組序 (Endianness)
// x86 和 ARM64 都是小端序，但在網路協定中需注意
uint32_t swap_endian(uint32_t x) {
    return ((x & 0x000000FF) << 24) |
           ((x & 0x0000FF00) << 8)  |
           ((x & 0x00FF0000) >> 8)  |
           ((x & 0xFF000000) >> 24);
}

// 2. 記憶體對齊
// ARM64 對未對齊存取有更嚴格的限制
struct alignas(16) AlignedData {
    float data[4];
};

// 3. 原子操作
// 兩種架構都支援 LSE (Large System Extensions) / ARMv8.1
#ifdef __aarch64__
    __atomic_add_fetch(&counter, 1, __ATOMIC_SEQ_CST);
#else
    __atomic_add_fetch(&counter, 1, __ATOMIC_SEQ_CST);
#endif
```

### 效能考慮

```c
// 架構特定的優化
#if defined(__x86_64__)
    // x86 特定的優化
    #define PREFETCH_READ(ptr) _mm_prefetch((ptr), _MM_HINT_T0)
    #define PREFETCH_WRITE(ptr) _mm_prefetch((ptr), _MM_HINT_T1)
    #define NOP() _mm_pause()
    
    // 緩存線預取
    #define PREFETCH(ptr, offset) _mm_prefetch((const char*)(ptr) + offset, _MM_HINT_T0)
    
#elif defined(__aarch64__)
    // ARM64 特定的優化
    #define PREFETCH_READ(ptr) __builtin_prefetch((ptr), 0, 3)
    #define PREFETCH_WRITE(ptr) __builtin_prefetch((ptr), 1, 3)
    #define NOP() __asm__ volatile("yield")
    
    #define PREFETCH(ptr, offset) __builtin_prefetch((const char*)(ptr) + offset, 0, 3)
#endif

// 避免依賴特定暫存器的程式碼
// 這段程式碼在兩種架構上都應該工作
void process_array(float *arr, size_t n) {
    #pragma GCC ivdep
    for (size_t i = 0; i < n; i++) {
        arr[i] = arr[i] * 2.0f + 1.0f;
    }
}

// 使用編譯器內建函數獲得最佳效能
void optimized_copy(void *dest, const void *src, size_t n) {
    #if defined(__x86_64__)
        __memcpy_avx_unaligned(dest, src, n);
    #elif defined(__aarch64__)
        __memcpy_simd(dest, src, n);
    #else
        memcpy(dest, src, n);
    #endif
}
```

## 系統程式應用

### 作業系統內核

```c
// 架構通用的上下文切換
struct thread_context {
    uint64_t sp;      // 堆疊指標
    uint64_t pc;      // 程式計數器
    uint64_t x[29];   // x0-x28 (通用暫存器)
    uint64_t lr;      // 連結暫存器
    uint64_t fpsr;    // 浮點狀態
    // 其他狀態...
};

// x86-64 上下文切換
#if defined(__x86_64__)
void context_switch(struct thread_context *old, struct thread_context *new) {
    __asm__ volatile (
        "pushfq\n\t"
        "push %%rbp\n\t"
        "push %%rbx\n\t"
        "push %%r12\n\t"
        "push %%r13\n\t"
        "push %%r14\n\t"
        "push %%r15\n\t"
        
        "mov %%rsp, %[old_sp]\n\t"
        "mov %[new_sp], %%rsp\n\t"
        
        "pop %%r15\n\t"
        "pop %%r14\n\t"
        "pop %%r13\n\t"
        "pop %%r12\n\t"
        "pop %%rbx\n\t"
        "pop %%rbp\n\t"
        "popfq\n\t"
        
        : [old_sp] "=m" (old->sp)
        : [new_sp] "r" (new->sp)
        : "memory"
    );
}

// ARM64 上下文切換
#elif defined(__aarch64__)
void context_switch(struct thread_context *old, struct thread_context *new) {
    __asm__ volatile (
        "stp x19, x20, [%[old], #0]\n\t"
        "stp x21, x22, [%[old], #16]\n\t"
        "stp x23, x24, [%[old], #32]\n\t"
        "stp x25, x26, [%[old], #48]\n\t"
        "stp x27, x28, [%[old], #64]\n\t"
        "stp x29, x30, [%[old], #80]\n\t"
        "mov x19, sp\n\t"
        "str x19, [%[old], #88]\n\t"
        
        "ldr x19, [%[new], #88]\n\t"
        "mov sp, x19\n\t"
        "ldp x29, x30, [%[new], #80]\n\t"
        "ldp x27, x28, [%[new], #64]\n\t"
        "ldp x25, x26, [%[new], #48]\n\t"
        "ldp x23, x24, [%[new], #32]\n\t"
        "ldp x21, x22, [%[new], #16]\n\t"
        "ldp x19, x20, [%[new], #0]\n\t"
        
        : : [old] "r" (old), [new] "r" (new)
        : "memory"
    );
}
#endif
```

## 總結

x86 和 ARM 架構代表了兩種不同的處理器設計哲學。x86 的 CISC 設計提供了豐富的指令集和向後兼容性，而 ARM 的 RISC 設計則強調簡潔和功耗效率。隨著蘋果 M 系列晶片和 ARM 伺服器的興起，以及 x86 在高效能運算領域的持續創新，了解這兩種架構對於現代系統程式設計者來說越來越重要。

## 相關頁面

- [計算機結構的歷史](./計算機結構的歷史.md) - 處理器架構的發展歷程
- [快取一致性](./快取一致性.md) - 多核處理器的快取同步
- [分支預測](./分支預測.md) - 提升流水線效率的技術

## 標籤

#處理器架構 #x86 #ARM #RISC #CISC #SIMD
