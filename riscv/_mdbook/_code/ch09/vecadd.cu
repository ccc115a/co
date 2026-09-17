// vecadd.cu：CUDA SAXPY 範例（對應 9.1、9.2）
// y[i] = a * x[i] + y[i]；註解標出 host/device 分界。
#include <cuda_runtime.h>
#include <stdio.h>

// ===== device 端：跑在 GPU（Host-side 下是 NVIDIA SASS）=====
__global__ void saxpy(float *x, float *y, float a, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;  // 每執行緒一個 i
    if (i < n) y[i] = a * x[i] + y[i];
}

// ===== host 端：跑在 CPU（含 RISC-V 當 Host 時亦同）=====
int main(void) {
    const int n = 1 << 20;
    const size_t bytes = n * sizeof(float);
    float *d_x = NULL, *d_y = NULL;  // device 指標
    float *h_y = new float[n];       // host 緩衝（示意）
    for (int i = 0; i < n; i++) h_y[i] = 0.0f;

    cudaMalloc(&d_x, bytes);  // host 呼叫：在 device 配記憶體
    cudaMalloc(&d_y, bytes);
    cudaMemcpy(d_x, h_y, bytes, cudaMemcpyHostToDevice);  // H2D 搬運

    int blk = 256;  // 每 block 執行緒數（warp 整數倍）
    int grid = (n + blk - 1) / blk;
    saxpy<<<grid, blk>>>(d_x, d_y, 2.0f, n);  // host 發射 device kernel
    cudaDeviceSynchronize();  // 等待完成

    cudaMemcpy(h_y, d_y, bytes, cudaMemcpyDeviceToHost);  // D2H 取回
    printf("saxpy done, y[0]=%f\n", h_y[0]);
    cudaFree(d_x);
    cudaFree(d_y);
    delete[] h_y;
    return 0;
}
// 編譯（x86/NVIDIA Host）：nvcc -o vecadd vecadd.cu -arch=sm_80
// RISC-V 當 Host 時：host 編譯器換 riscv64，kernel 仍是 SASS（見 9.2）。
