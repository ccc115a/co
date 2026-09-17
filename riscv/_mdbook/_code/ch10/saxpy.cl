// saxpy.cl：OpenCL SAXPY kernel（對應 10.2）
// y[i] = a * x[i] + y[i]；位址空間 __global 即住 global memory。
__kernel__ void saxpy(__global float *x,
                      __global float *y,
                      float a,
                      int n) {
    int i = get_global_id(0);  // 每 work-item 一個 i（Vortex→thread ID）
    if (i < n) y[i] = a * x[i] + y[i];
}
