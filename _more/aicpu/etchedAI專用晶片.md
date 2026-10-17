AI 晶片市場最近出現一個怪現象：新創公司 Etched 估值在短短幾個月內，飆到超過 400 億美元。
這數字背後藏著一個投資盲點：大家只看估值，卻忽略了硬體設計的真正革命。

https://gemini.google.com/app/c42561232d22cc2a

**Etched AI**（新創公司）的核心技術理念是「全面硬體化（Hardwired）Transformer 模型」。其推出的旗艦晶片 **Sohu** 專為 Transformer 語言模型（如 ChatGPT、Gemini、Claude 等）設計，捨棄了傳統 GPU 的通用性，換取極致的運算效能與能耗比。

以下為 Etched AI 的核心技術特點，以及它與傳統 GPU 的四大根本不同：

---

### 1. 架構理念：專用 ASIC vs. 通用 GPU

* **傳統 GPU（如 NVIDIA H100/B200）：**
* **通用設計（General-Purpose）：** GPU 原本設計用於圖形渲染與各種通用矩陣運算，晶片內保留了許多處理不同演算法（如 CNN、RNN、傳統物理模擬）的邏輯單元與指令集。
* **彈性代價：** 為了適應未來可能變化的 AI 模型，GPU 必須保留大量控制電路（Control Logic），導致實際執行 Transformer 運算時的**晶片利用率（FLOPS Utilization）通常僅約 30%~40%**。


* **Etched AI (Sohu 晶片)：**
* **專用硬體（ASIC）：** Etched 賭注於「Transformer 將持續作為 AI 主流」，直接將 Transformer 的核心數學公式（如 Attention 機制、Softmax、LayerNorm）**以硬體電路直接刻在晶片上**。
* **極致利用率：** 晶片不需要處理通用指令解碼或非 Transformer 的演算邏輯，**算力利用率可達 90% 以上**，大幅減少電路開銷與發熱。



---

### 2. 記憶體與吞吐量：解決 Batch Size 瓶頸

在推論（Inference）大語言模型時，傳統 GPU 常受到記憶體頻寬（Memory Bandwidth）限制。

* **傳統 GPU 的痛點：** 當同時處理大量使用者請求（高 Batch Size）時，GPU 需要頻繁在 HBM 記憶體與核心算力單元之間搬運資料，導致延遲劇增或效能瓶頸。
* **Etched 的解決方案：**
* Sohu 晶片配備大容量 HBM3 記憶體，並透過專門的資料流架構，在進行極高 Batch Size（數千個併發請求）時**幾乎不會發生效能衰退（No Performance Degradation）**。
* 官方宣稱，單台搭載 8 顆 Sohu 晶片的伺服器，在特定 Transformer 推論任務上能提供相當於 **160 顆 NVIDIA H100 GPU** 的吞吐量。



---

### 3. 電壓與功耗優化：低電壓超高算力密度

* **傳統 GPU：** 為了保持廣汎的相容性與時脈彈性，運作電壓較高，散熱與功耗（TDP）是極大的挑戰。
* **Etched AI：** 精簡了控制邏輯後，晶片的數學運算區塊可以在**低於傳統 AI 晶片一半的電壓**下穩定運作。這使得晶片能以更高的密度排列算力單元，實現極高的能效比（Performance-per-Watt）與更低的營運成本。

---

### 4. 對比總結

| 比較維度 | 傳統 GPU (例如 NVIDIA) | Etched AI (Sohu 晶片) |
| --- | --- | --- |
| **晶片類型** | 通用平行處理器 (GPGPU) | Transformer 專用集成電路 (ASIC) |
| **適用範圍** | 各類 AI 模型、圖形渲染、科學計算 | **僅限 Transformer 相關模型** |
| **算力利用率** | 約 30% - 40% | **超高 (可達 90%+ )** |
| **適應性** | **極高**（若未來出現新型模型可透過軟體更新支援） | **無**（若 AI 演算法不再使用 Transformer，晶片將失效） |
| **主要定位** | 模型訓練（Training）與推論（Inference） | **極大規模的高速推論（Inference）** |

---

### 潛在風險與挑戰

雖然 Etched 的架構在效能與成本上展現出巨大的理論優勢，但其最大的隱憂在於「硬體僵化」：

1. **演算法更迭風險：** 若未來 AI 社群轉向完全不包含 Transformer 結構的新架構（如新型 State Space Models / Mamba 等），專用 ASIC 將無法彈性轉向。
2. **生態系壁壘：** NVIDIA 的 CUDA 軟體生態提供了極高的開發者粘性，Etched 需要提供優良的編譯器支援，才能讓現有的 PyTorch/JAX 模型無縫轉移。