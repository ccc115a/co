# GPU 架構 (GPU Architecture)

## 概述

圖形處理器 (Graphics Processing Unit, GPU) 最初為加速圖形渲染而設計，現已成為通用平行運算的核心硬體，特別適合大量資料平行運算。

## CPU vs GPU 架構

```
CPU 架構                          GPU 架構
┌─────────────────┐               ┌─────────────────────────┐
│                 │               │  SM    SM    SM    SM   │
│  ┌───┐ ┌───┐   │               │ ┌─────┐ ┌─────┐ ┌─────┐ │
│  │Core│ │Core│   │               │ │Core │ │Core │ │Core │ │
│  └───┘ └───┘   │               │ ├─────┤ ├─────┤ ├─────┤ │
│  ┌───┐ ┌───┐   │               │ │Core │ │Core │ │Core │ │
│  │Core│ │Core│   │               │ └─────┘ └─────┘ └─────┘ │
│  └───┘ └───┘   │               │ ┌─────┐ ┌─────┐ ┌─────┐ │
│     ↑          │               │ │Core │ │Core │ │Core │ │
│  Cache         │               │ └─────┘ └─────┘ └─────┘ │
│     ↑          │               │         Cache            │
│  Control       │               │         ↑                │
│     ↑          │               │       Control            │
│  DRAM          │               │         ↑                │
└─────────────────┘               └─────────────────────────┘

特點:                    特點:
- 少量強大核心            - 大量小型核心
- 低延遲優化              - 高吞吐量優化
- 大型快取               - 共享記憶體
- 複雜分支預測            - 適合規則運算
```

## NVIDIA GPU 架構

### Fermi 架構 (2010)
- 16 個 SM (Streaming Multiprocessor)
- 每個 SM 32 個 CUDA 核心
- 總共 512 個核心

### Kepler 架構 (2012)
- 15 個 SMX
- 每個 SMX 192 個核心
- 硬體支援 동時多執行緒

### Pascal 架構 (2016)
- 56 個 SM
- 每個 SM 64 個核心
- 高頻寬 HBM2 記憶體

### Volta 架構 (2017)
- 80 個 SM
- Tensor Core 加速矩陣運算
- 獨立執行緒排程

### Turing 架構 (2018)
- RT Core 光線追蹤硬體
- 強化 AI 推理能力

### Ampere 架構 (2020)
- 第三代 Tensor Core
- PCI Express 4.0
- 更快的 Ray Tracing

### Hopper 架構 (2022)
- 第四代 Tensor Core
- Transformer 引擎
- 分散式共享記憶體

## CUDA 程式設計模型

### 基本概念
```
Grid ──┬── Block 0 ──┬── Thread 0
       │             ├── Thread 1
       │             └── ...
       │
       ├── Block 1 ──┬── Thread 0
       │             ├── Thread 1
       │             └── ...
       │
       └── Block 2 ──┬── ...
```

### Hello World
```cuda
#include <stdio.h>

__global__ void hello_kernel() {
    int tid = blockIdx.x * blockDim.x + threadIdx.x;
    printf("Hello from thread %d\n", tid);
}

int main() {
    int num_blocks = 2;
    int threads_per_block = 4;
    
    hello_kernel<<<num_blocks, threads_per_block>>>();
    cudaDeviceSynchronize();
    
    return 0;
}
```

編譯執行：
```bash
nvcc hello.cu -o hello
./hello
```

### 記憶體層級
```
┌────────────────────────────────────────────────────────┐
│                    GPU 裝置                             │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │              全域記憶體 (GMEM)                    │ │
│  │  - 所有執行緒可存取                               │ │
│  │  - 高頻寬但高延遲                                 │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  ┌────────────────┐  ┌────────────────┐              │
│  │ 共享記憶體      │  │  共享記憶體     │              │
│  │ (Block 0)      │  │  (Block 1)     │              │
│  │ 區塊內�用       │  │  區塊內共享     │              │
│  └────────────────┘  └────────────────┘              │
│                                                        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│  │ Reg  │ │ Reg  │ │ Reg  │ │ Reg  │ │ Reg  │ ...    │
│  │ L1   │ │ L1   │ │ L1   │ │ L1   │ │ L1   │       │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘       │
└────────────────────────────────────────────────────────┘
```

### 矩陣相加
```cuda
__global__ void matrix_add(float *A, float *B, float *C, int N) {
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    int col = blockIdx.x * blockDim.x + threadIdx.x;
    
    if (row < N && col < N) {
        int idx = row * N + col;
        C[idx] = A[idx] + B[idx];
    }
}

int main() {
    int N = 1024;
    size_t size = N * N * sizeof(float);
    
    float *d_A, *d_B, *d_C;
    cudaMalloc(&d_A, size);
    cudaMalloc(&d_B, size);
    cudaMalloc(&d_C, size);
    
    // 複製資料到 GPU
    cudaMemcpy(d_A, h_A, size, cudaMemcpyHostToDevice);
    cudaMemcpy(d_B, h_B, size, cudaMemcpyHostToDevice);
    
    // 設定執行組態
    dim3 block(16, 16);
    dim3 grid((N + 15) / 16, (N + 15) / 16);
    
    // 執行核心
    matrix_add<<<grid, block>>>(d_A, d_B, d_C, N);
    
    // 複製結果回主機
    cudaMemcpy(h_C, d_C, size, cudaMemcpyDeviceToHost);
    
    cudaFree(d_A); cudaFree(d_B); cudaFree(d_C);
    return 0;
}
```

## OpenCL 程式設計

```c
__kernel void vector_add(__global const float *a,
                         __global const float *b,
                         __global float *c,
                         int n) {
    int gid = get_global_id(0);
    if (gid < n) {
        c[gid] = a[gid] + b[gid];
    }
}
```

## GPU 硬體規格對照

| 型號 | 運算單元 | VRAM | 頻寬 |
|------|----------|------|------|
| RTX 4090 | 16384 CUDA | 24GB GDDR6X | 1008 GB/s |
| A100 | 6912 CUDA | 40/80GB HBM2 | 2TB/s |
| H100 | 16896 CUDA | 80GB HBM3 | 3.35TB/s |

## 應用場景

| 領域 | 應用 |
|------|------|
| 深度學習 | 訓練、推論 |
| 科學計算 | CFD、分子動力學 |
| 圖形渲染 | 即時 Ray Tracing |
| 密碼學 | 雜湊計算 |
| 資料庫 | GPU 加速查詢 |

## CUDA 最佳化技巧

### 合併記憶體存取
```cuda
// 好：合併存取
__global__ void good_access(float *data, int N) {
    int tid = blockIdx.x * blockDim.x + threadIdx.x;
    if (tid < N) {
        data[tid] *= 2.0f;  // 連續存取
    }
}

// 壞：跨步存取
__global__ void bad_access(float *data, int N) {
    int tid = blockIdx.x * blockDim.x + threadIdx.x;
    if (tid < N/2) {
        data[tid * 2] *= 2.0f;  // 跨步存取
    }
}
```

### 共享記憶體使用
```cuda
__global__ void shared_memory_kernel(float *data, int N) {
    __shared__ float shared[256];
    
    int tid = threadIdx.x;
    int gid = blockIdx.x * blockDim.x + tid;
    
    // 載入到共享記憶體
    shared[tid] = (gid < N) ? data[gid] : 0;
    __syncthreads();
    
    // 計算
    if (tid > 0 && tid < 255) {
        shared[tid] = (shared[tid-1] + shared[tid] + shared[tid+1]) / 3.0f;
    }
    __syncthreads();
    
    // 寫回
    if (gid < N) {
        data[gid] = shared[tid];
    }
}
```

## 相關資源

- 相關主題：[平行運算](平行運算.md)
- 相關主題：[記憶體](記憶體.md)

## Tags

#GPU #CUDA #平行運算 #SIMD
