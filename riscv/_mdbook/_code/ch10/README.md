# ch10 範例：開源 GPGPU 與著色器管線

對應書中 10.1（Vortex GPGPU）、10.2（MIAOW 與 OpenCL 工具鏈）、
10.3（Vulkan / OpenGL 著色器：SPIR-V 到自訂 ISA）。

## 檔案說明

- `saxpy.cl`：OpenCL SAXPY kernel（同一份 source 可走 MIAOW / Vortex 後端）。
- `host_opencl.c`：標準 OpenCL host 端，條件編譯：有 `<CL/cl.h>` 才編真正邏輯，否則印安裝提示。
- `spirv_flow.sh`：GLSL→SPIR-V→RISC-V GPU 編譯管線腳本，缺工具或缺 shader 時印安裝指引並 dry-run。
- `vortex_notes.md`：Vortex 上機步驟：upstream 連結、編譯與跑 hello 的指令序列，不複製其程式碼。
- `Makefile`：語法檢查與 dry-run。

## 執行指令

```bash
cc -fsyntax-only host_opencl.c
cc host_opencl.c -o host_opencl && ./host_opencl  # 無標頭亦可編，會印提示
bash -n spirv_flow.sh
bash spirv_flow.sh        # 缺工具時 dry-run，屬正常
make test
```
