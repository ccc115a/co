# CUDA (Compute Unified Device Architecture)

## 概述

CUDA 是 NVIDIA 於 2007 年推出的平行運算平台和 API，允許程式設計師使用 C/C++ 語言直接控制 GPU 進行通用計算（GPGPU）。CUDA 的出現徹底改變了高效能運算的格局，讓數以百萬計的開發者能夠利用 GPU 的平行運算能力加速各種應用，從深度學習訓練到科學模擬，從影像處理到密碼學。CUDA 目前是深度學習領域最主流的加速框架，幾乎所有主流深度學習框架都支援 CUDA。

CUDA 的設計核心是將 GPU 視為一個可程式化的平行運算設備。與傳統的圖形 API（如 OpenGL、DirectX）不同，CUDA 提供了完整的開發工具鏈，包括編譯器、調試器、性能分析器，讓開發者能夠像使用 CPU 一樣使用 GPU。CUDA 還提供了豐富的函式庫（如 cuBLAS、cuFFT、cuDNN），涵蓋線性代數、傅立葉變換、神經網路等常見運算任務。

## 硬體架構

### GPU 硬體層級

```
┌─────────────────────────────────────────────────────────────────┐
│                        CUDA 硬體架構                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  主機 (Host)                                                    │
│  ┌─────────────────────┐                                        │
│  │     CPU + RAM       │                                        │
│  └──────────┬──────────┘                                        │
│             │ PCIe                                              │
│  設備 (Device)                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    GPU 晶片                               │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌─────────────┐  │  │
│  │  │      SM 0     │  │      SM 1     │  │   SM N-1   │  │  │
│  │  │  ┌──────────┐ │  │  ┌──────────┐ │  │ ┌─────────┐ │  │  │
│  │  │  │ CUDA Core│ │  │  │ CUDA Core│ │  │ │CUDA Core│ │  │  │
│  │  │  │ (SP)     │ │  │  │ (SP)     │ │  │ │ (SP)    │ │  │  │
│  │  │  │ TensorCore│ │  │  │TensorCore│ │  │ │TensorCore│ │  │  │
│  │  │  │  L1 Cache│ │  │  │ L1 Cache │ │  │ │ L1 Cache │ │  │  │
│  │  │  │  Shared   │ │  │  │  Shared  │ │  │ │  Shared  │ │  │  │
│  │  │  └──────────┘ │  │  └──────────┘ │  │ └─────────┘ │  │  │
│  │  └────────────────┘  └────────────────┘  └─────────────┘  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  全域記憶體 (Global Memory) - HBM/HBM2/HBM3                    │
│  頻寬: 900GB/s ~ 3.5TB/s                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 關鍵硬體概念

SM（Streaming Multiprocessor）是 GPU 的基本運算單元，每個 SM 包含多個 CUDA 核心（又稱 Streaming Processor，SP），以及 Tensor Core、Register File、Shared Memory、L1 Cache 等資源。不同架構的 SM 設計差異很大，例如 Volta 架構引入的 Tensor Core 專門加速矩陣乘法運算。

執行緒（Thread）是 GPU 執行的基本單位，數百萬個執行緒同時運行形成巨大的平行度。執行緒以 32 個為一組，稱為 Warp，是 GPU 執行的最小調度單位。一個 Warp 內的執行緒執行完全相同的指令，但處理不同的資料（SIMT 模式）。

## 程式設計模型

### 執行階層

```cuda
// 執行階層結構
// Grid (最多 2^31-1 blocks)
// └── Block (最多 1024 threads)
//     └── Thread (執行 kernel 的基本單位)

__global__ void myKernel(int *data) {
    // 計算執行緒 ID
    int blockId = blockIdx.x;                    // 區塊 ID (1D/2D/3D)
    int threadId = threadIdx.x;                  // 執行緒 ID (區塊內)
    int globalId = blockId * blockDim.x + threadId; // 全域 ID
    
    // 每個執行緒執行相同代碼，但處理不同資料
    data[globalId] *= 2;
}

int main() {
    // 配置執行參數
    dim3 block(256);    // 每區塊 256 個執行緒
    dim3 grid(1024);    // 1024 個區塊
    
    // 總共 256K 個執行緒同時執行
    myKernel<<<grid, block>>>(d_data);
    
    cudaDeviceSynchronize();  // 等待完成
}
```

### 記憶體模型

```cuda
// 各種記憶體的使用

// 全域記憶體 (Global Memory)
// - 所有執行緒可見，壽命與程式相同
// - 頻寬高但延遲高 (400-900 GB/s)
__global__ void global_mem(float *data) {
    data[blockIdx.x] = 1.0f;
}

// 共享記憶體 (Shared Memory)
// - 同區塊內執行緒共享
// - 低延遲 (約 1 TB/s)，需要手動管理
__global__ void shared_mem(float *data) {
    __shared__ float shared[256];  // 宣告共享記憶體
    
    int tid = threadIdx.x;
    shared[tid] = data[blockIdx.x * blockDim.x + tid];
    __syncthreads();  // 同步區塊內執行緒
    
    // 使用共享記憶體進行計算
    if (tid > 0) {
        shared[tid] += shared[tid - 1];
    }
    __syncthreads();
    
    data[blockIdx.x * blockDim.x + tid] = shared[tid];
}

// 暫存器 (Registers)
// - 每執行緒私有，最高速度
// - 數量有限 (64K per SM)

__global__ void registers() {
    float local_var = 0;  // 盡量使用寄存器
    for (int i = 0; i < 10; i++) {
        local_var += i;
    }
}

// 常數記憶體 (Constant Memory)
// - 唯讀，全域可見
// - 需要 __constant__ 修飾詞
__constant__ float const_data[256];

// 纹理記憶體 (Texture Memory)
// - 優化的唯讀記憶體
// - 適合 2D/3D 局部性
texture<float, cudaTextureType2D> texRef;
```

## 核心函式庫

### cuBLAS

```cuda
#include <cublas_v2.h>

void matrix_multiply(float *A, float *B, float *C, int N) {
    cublasHandle_t handle;
    cublasCreate(&handle);
    
    float alpha = 1.0f;
    float beta = 0.0f;
    
    // C = alpha * A * B + beta * C
    // A: N x N, B: N x N, C: N x N
    cublasSgemm(handle,
                CUBLAS_OP_N, CUBLAS_OP_N,
                N, N, N,
                &alpha,
                A, N,
                B, N,
                &beta,
                C, N);
    
    cublasDestroy(handle);
}
```

### cuFFT

```cuda
#include <cufft.h>

void fft_2d(float *input, float *output, int N) {
    cufftHandle plan;
    cufftPlan2d(&plan, N, N, CUFFT_C2C);
    
    // 執行 FFT (複數到複數)
    cufftExecC2C(plan, (cufftComplex*)input, 
                 (cufftComplex*)output, CUFFT_FORWARD);
    
    cufftDestroy(plan);
}
```

### cuDNN (深度學習)

```cuda
#include <cudnn.h>

void conv_forward(float *input, float *weight, 
                 float *output, int N, int C, int H, int W,
                 int K, int R, int S) {
    cudnnHandle_t handle;
    cudnnCreate(&handle);
    
    // 創建 tensor 描述符
    cudnnTensorDescriptor_t inputDesc, outputDesc, weightDesc;
    cudnnCreateTensorDescriptor(&inputDesc);
    cudnnSetTensor4dDescriptor(inputDesc, CUDNN_TENSOR_NCHW,
                               CUDNN_DATA_FLOAT, N, C, H, W);
    
    // 卷積描述符
    cudnnConvolutionDescriptor_t convDesc;
    cudnnCreateConvolutionDescriptor(&convDesc);
    cudnnSetConvolution2dDescriptor(convDesc, 1, 1, 1, 1, 1, 1,
                                   CUDNN_CROSS_CORRELATION,
                                   CUDNN_DATA_FLOAT);
    
    // 執行卷積
    cudnnConvolutionForward(handle,
                           &alpha, inputDesc, input,
                           weightDesc, weight,
                           convDesc, algo, workspace, workspaceSize,
                           &beta, outputDesc, output);
    
    cudnnDestroy(handle);
}
```

## 效能優化

### 記憶體存取優化

```cuda
// 合併記憶體訪問 (Coalesced Access)
__global__ void coalesced(float *data) {
    int tid = blockIdx.x * blockDim.x + threadIdx.x;
    // 好：連續訪問
    data[tid] = compute(data[tid]);
}

// 跨步訪問 (Stride Access) - 效能較差
__global__ void strided(float *data, int stride) {
    int tid = blockIdx.x * blockDim.x + threadIdx.x;
    // 壞：每個執行緒訪問相隔 stride 的位置
    data[tid * stride] = compute(data[tid * stride]);
}

// 避免-bank conflict
// 共享記憶體有 32 banks，訪問相同 bank 會序列化
__shared__ float shared[256];  // 256 個 float

// 不好：所有執行緒訪問同一 bank
// good: 使用 padding 避免衝突
__shared__ float shared_padded[256 + 16];  // 加上 padding
```

### 計算優化

```cuda
// 避免 warp divergence
__global__ void branch_optimized(float *data) {
    int tid = blockIdx.x * blockDim.x + threadIdx.x;
    
    // 使用 try-catch 模式
    if (tid % 32 == 0) {
        // 只占執行緒的 1/32
    } else {
        // 其餘 31/32 執行
    }
    // 改進：使用 __builtin_expect 提示分支預測
}

// 充分利用每個 warp
// 讓每個 warp 處理 32 個連續元素
__global__ void vectorized(float *input, float *output) {
    int tid = blockIdx.x * blockDim.x + threadIdx.x;
    float4 data = ((float4*)input)[tid];  // 一次讀取 4 個 float
    data.x = compute(data.x);
    data.y = compute(data.y);
    data.z = compute(data.z);
    data.w = compute(data.w);
    ((float4*)output)[tid] = data;
}
```

### 指令級優化

```cuda
// 使用 intrinsic 函數
// 取代
float result = sqrtf(x);
// 使用
float result = __fsqrt_rn(x);  // 更快但精度略低

// 取代
float result = sin(x);
// 使用
float result = __sinf(x);  // 更快的近似

// 避免浪費運算
// 不好
if (threadIdx.x < N) {
    float x = data[globalId];
    // 使用 log 和 exp
    data[globalId] = exp(log(x) + 1.0f);  // 等於 x * e
}
// 好：直接乘法
if (threadIdx.x < N) {
    data[globalId] = data[globalId] * 2.71828f;
}

// 使用 warp shuffle 進行資料交換
__device__ float warp_reduce(float val) {
    for (int offset = 16; offset > 0; offset /= 2) {
        val += __shfl_down_sync(0xffffffff, val, offset);
    }
    return val;
}
```

### 流水線與非同步

```cuda
// 重疊計算與傳輸
void overlapped(float *d_data, float *h_data, int size) {
    cudaStream_t stream1, stream2;
    cudaStreamCreate(&stream1);
    cudaStreamCreate(&stream2);
    
    // 非同步複製與計算
    cudaMemcpyAsync(d_data, h_data, size, 
                    cudaMemcpyHostToDevice, stream1);
    
    kernel<<<grid, block, 0, stream2>>>(d_data);
    
    cudaMemcpyAsync(h_output, d_data, size,
                    cudaMemcpyDeviceToHost, stream1);
    
    cudaStreamSynchronize(stream1);
    cudaStreamSynchronize(stream2);
}

// 雙緩衝 (Double Buffering)
__global__ void compute_kernel(float *in, float *out, float *buffer) {
    __shared__ float s_data[256];
    // 使用雙緩衝避免依賴
    s_data[threadIdx.x] = in[globalId];
    __syncthreads();
    
    // 計算
    out[globalId] = compute(s_data);
}
```

## 除錯與性能分析

### CUDA 調試工具

```bash
# 使用 cuda-gdb 調試
cuda-gdb ./program

# 常用命令
break kernel_name
run
print variable
continue
step

# 使用 cuda-memcheck 檢查記憶體錯誤
cuda-memcheck ./program

# 使用 Nsight 進行圖形化調試
nsight -cudalog ./program
```

### 性能分析

```cuda
// 使用 CUDA Events 測量時間
cudaEvent_t start, stop;
cudaEventCreate(&start);
cudaEventCreate(&stop);

cudaEventRecord(start);
kernel<<<grid, block>>>(d_data);
cudaEventRecord(stop);

cudaEventSynchronize(stop);
float milliseconds = 0;
cudaEventElapsedTime(&milliseconds, start, stop);

// 使用Nvtx標記
#include <nvtx3/nvtx.h>

nvtxMark("kernel start");
kernel<<<grid, block>>>(d_data);
nvtxMark("kernel end");

// 在Nsight Compute中查看
// ncu --set full ./program
// ncu --metrics sm__throughput.avg.pct_of_peak_slots_hint ./program
```

### 常見性能問題

| 問題 | 原因 | 解決方法 |
|------|------|----------|
| 低 occupancy | 區塊太小或資源不足 | 增加區塊大小 |
| 記憶體瓶頸 | 未合併訪問 | 重新排列資料 |
| Warp divergence | 分支過多 | 重構代碼 |
| 頻寬限制 | 計算密度低 | 使用更多暫存器/共享記憶體 |

## 應用實例

### 深度學習訓練

```cuda
// 簡化的矩陣乘法 (矩陣乘法的優化版本)
__global__ void sgemm(float *A, float *B, float *C, int M, int N, int K) {
    __shared__ float As[32][32];
    __shared__ float Bs[32][32];
    
    int bx = blockIdx.x, by = blockIdx.y;
    int tx = threadIdx.x, ty = threadIdx.y;
    
    int row = by * 32 + ty;
    int col = bx * 32 + tx;
    
    float sum = 0;
    
    for (int k = 0; k < (K + 31) / 32; k++) {
        // 載入到共享記憶體
        if (row < M && k * 32 + tx < K)
            As[ty][tx] = A[row * K + k * 32 + tx];
        else
            As[ty][tx] = 0;
            
        if (col < N && k * 32 + ty < K)
            Bs[ty][tx] = B[(k * 32 + ty) * N + col];
        else
            Bs[ty][tx] = 0;
        
        __syncthreads();
        
        // 計算
        for (int i = 0; i < 32; i++)
            sum += As[ty][i] * Bs[i][tx];
        
        __syncthreads();
    }
    
    if (row < M && col < N)
        C[row * N + col] = sum;
}
```

### 影像處理

```cuda
// 卷積濾波
__global__ void conv2d(float *input, float *output, 
                       int width, int height,
                       const float *kernel, int kSize) {
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;
    
    if (x < width && y < height) {
        float sum = 0;
        int offset = kSize / 2;
        
        for (int ky = 0; ky < kSize; ky++) {
            for (int kx = 0; kx < kSize; kx++) {
                int ix = min(max(x + kx - offset, 0), width - 1);
                int iy = min(max(y + ky - offset, 0), height - 1);
                sum += input[iy * width + ix] * 
                       kernel[ky * kSize + kx];
            }
        }
        
        output[y * width + x] = sum;
    }
}
```

### 粒子模擬

```cuda
// N-body 模擬
__global__ void nbody(float *posX, float *posY, float *posZ,
                      float *velX, float *velY, float *velZ,
                      float *mass, int N) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= N) return;
    
    float ax = 0, ay = 0, az = 0;
    
    for (int j = 0; j < N; j++) {
        if (i == j) continue;
        
        float dx = posX[j] - posX[i];
        float dy = posY[j] - posY[i];
        float dz = posZ[j] - posZ[i];
        
        float distSq = dx*dx + dy*dy + dz*dz + 1e-6f;
        float dist = sqrtf(distSq);
        float force = mass[j] / distSq;
        
        ax += force * dx / dist;
        ay += force * dy / dist;
        az += force * dz / dist;
    }
    
    velX[i] += ax * dt;
    velY[i] += ay * dt;
    velZ[i] += az * dt;
}
```

## CUDA 與深度學習框架

主流深度學習框架都使用 CUDA 進行 GPU 加速：

| 框架 | CUDA 支援 |
|------|----------|
| TensorFlow | CUDA + cuDNN |
| PyTorch | CUDA + cuDNN |
| JAX | CUDA + cuDNN |
| MXNet | CUDA + cuDNN |
| Caffe | CUDA + cuDNN |

```python
# PyTorch 使用 CUDA
import torch

# 檢查 CUDA 可用性
print(torch.cuda.is_available())
print(torch.cuda.get_device_name(0))

# 創建 CUDA tensor
x = torch.randn(1000, 1000).cuda()
y = torch.randn(1000, 1000).cuda()

# 在 GPU 上運算
z = torch.mm(x, y)

# 移動回 CPU
z_cpu = z.cpu()
```

## 版本與特性

| CUDA 版本 | 發布年份 | 主要特性 |
|-----------|----------|----------|
| CUDA 1.0 | 2007 | 初始版本 |
| CUDA 2.0 | 2008 | 支援 Fermi |
| CUDA 3.0 | 2010 | 支援 Kepler |
| CUDA 5.0 | 2012 | Dynamic Parallelism |
| CUDA 6.0 | 2014 | Unified Memory |
| CUDA 8.0 | 2016 | Pascal 支援 |
| CUDA 10.0 | 2018 | Tensor Core 優化 |
| CUDA 11.0 | 2020 | Ampere 支援 |
| CUDA 12.0 | 2022 | Hopper 支援 |

## 相關概念

- [GPU架構](GPU架構.md) - GPU 硬體架構
- [平行運算](平行運算.md) - 平行計算理論
- [深度學習](深度學習.md) - 深度學習應用

## Tags

#CUDA #GPU #平行運算 #GPGPU #深度學習 #NVIDIA