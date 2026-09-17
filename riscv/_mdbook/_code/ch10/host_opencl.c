// host_opencl.c：標準 OpenCL host 端（對應 10.1、10.2）。
// 有 OpenCL 標頭才編真正邏輯，否則印提示即退出（條件編譯）。
#if __has_include(<CL/cl.h>)
#include <CL/cl.h>
#include <stdio.h>
#include <stdlib.h>

int main(void) {
    // 1. 取平台與裝置（此處僅示意第一步：列出平台數）
    cl_uint nplat = 0;
    if (clGetPlatformIDs(0, NULL, &nplat) != CL_SUCCESS) {
        printf("clGetPlatformIDs 失敗\n");
        return 1;
    }
    printf("OpenCL 平台數：%u（接著建 context / queue / 載入 saxpy.cl）\n",
           (unsigned)nplat);
    return 0;
}
#else
// 無 OpenCL 標頭時的退路：照樣可編過
#include <stdio.h>
int main(void) {
    printf("未找到 <CL/cl.h>：請安裝 OpenCL 標頭（如 pocl / ocl-headers）後重編。\n");
    return 0;
}
#endif
// 編譯：cc host_opencl.c -o host_opencl -lOpenCL（有標頭時）
// 語法檢查：cc -fsyntax-only host_opencl.c
