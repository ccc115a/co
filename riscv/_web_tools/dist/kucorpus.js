// cu2rv DSL 語料（tools/build.js 由 kernels/*.ku 產生，勿手動編輯）
// web/app.js 優先用它覆蓋 DSL 下拉選單。
globalThis.RVJS_KUCORPUS = [
  { name: "saxpy", src: "# saxpy.ku — 常數縮放加法：C[i] = a*A[i] + B[i]（a=2）\n# 展示 param＋暫存變數＋多敘述 kernel\nlanes 4\nn 8\nmem A @ 0x100\nmem B @ 0x120\nmem C @ 0x140\nparam a = 2\ninit:\n  A[i] = i + 1\n  B[i] = i + 2\nkernel:\n  t = a * A[i]\n  C[i] = t + B[i]\n" },
  { name: "tiny", src: "# tiny.ku — 單通道最小例（供 rvemu 單通道自檢：tid=0、ntid=1）\n# lanes=1 時單通道算完全部元素，verify 全過，exit=0\nlanes 1\nn 2\nmem A @ 0x100\nmem B @ 0x120\nmem C @ 0x140\ninit:\n  A[i] = i + 1\n  B[i] = 10 * (i + 1)\nkernel:\n  C[i] = A[i] + B[i]\n" },
  { name: "vecadd", src: "# vecadd.ku — 向量加法（對應 riscvgpu/prog.s 語意：C[i]=A[i]+B[i]）\n# A[i]=i+1、B[i]=10*(i+1)、C[i]=11*(i+1)；4 通道各算 2 個\n# 驗證鏈：node cli/cu2rv.js kernels/vecadd.ku -o /tmp/vecadd.s\n#   → node cli/rvasm.js /tmp/vecadd.s → 暫代 prog.hex 跑 iverilog（見 kernels/README.md）\nlanes 4\nn 8\nmem A @ 0x100\nmem B @ 0x120\nmem C @ 0x140\ninit:\n  A[i] = i + 1\n  B[i] = 10 * (i + 1)\nkernel:\n  C[i] = A[i] + B[i]\n" }
];
