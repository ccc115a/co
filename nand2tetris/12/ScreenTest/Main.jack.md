# ScreenTest/Main.jack 程式說明

這是第 12 章 OS 的螢幕類別（`Screen.jack`）測試主程式。它畫出一幅「房子＋太陽」的點陣圖，驗證 `drawLine`、`drawRectangle`、`drawCircle`、`setColor` 四個主要的圖形 API。

## 概述

- 測試目標：`Screen.setColor`、`drawLine`（水平/垂直/斜線/八方位）、`drawRectangle`（含填充）、`drawCircle`。
- 是「視覺型」測試：沒有批次比對，學生看螢幕畫面是否為一棟房子與太陽。
- 依賴：`Screen.*`、`Output.println`（完成即結束）。

## 架構總覽

`function void main()` 依序畫：

| 步驟 | 呼叫 | 意義 |
|------|------|------|
| 1 | `drawLine(0,220,511,220)` | 水平地基線（整寬） |
| 2 | `drawRectangle(280,90,410,220)` | 房身（含填充） |
| 3 | `setColor(false)` 後兩塊 `drawRectangle`：門 (350,120,390,219)、窗 (292,120,332,150) | 白色背景色擦出「洞」，驗證背景色清除 |
| 4 | `setColor(true)`；`drawCircle(360,170,3)` | 門把手黑點（圓） |
| 5 | 兩條 `drawLine` 組成屋頂斜面 | 斜線 |
| 6 | `drawCircle(140,60,30)` | 太陽 |
| 7 | 八條 `drawLine` 放射線（14,26→14,6 等） | 全向斜線 + 垂直/水平 |

最後 `return`。

## 原理

- **setColor(false)**：Screen 的顏色是「boolean」：背景（false）以 AND 清除像素、前景（true）以 OR 塗黑。測試靠「畫白色矩形挖掉門窗」來驗證背景色；若你的實作忽略 false，門窗就不會消失。
- **drawLine 的分類**：Screen.jack 以「dx=0」走垂直、以「dy=0」走水平、其餘走 Bresenham 式斜線（`drawDiagonalLine`）。測試涵蓋了水平（步驟 1、7）、垂直（步驟 7 的 14,26→14,6）、斜線（屋頂、放射線），四種都驗到。
- **drawCircle**：以「掃描線」原理：對每一「列偏移 dy（−r..r）」，算 `dx = round(sqrt(r²−dy²))`，畫水平線 (cx−dx, cy+dy, cx+dx)。太陽 30px 加上 8 條放射線即全圖。

## 實作細節

- 座標皆落在 512×256 內；`drawRectangle` 的 (x1,y1,x2,y2) 定義左上、右下。
- 步驟 3 的門窗是「白畫在房子方塊內」，若 OS 用 `setColor(true)` 填滿黑色陣列再清除，這裡就自然形成鏤空的凹洞。
- 這些數字正是教科書 ScreenTest 的標準測試資料，也可拿來驗證「自己再畫一條對角線」的正確性。

## 測試與驗證

VM Emulator 載入 `ScreenTest`（含 `Screen.vm`、`Math.vm`、`Output.vm`、`String.vm`、`Keyboard.vm`、`Array.vm`、`Memory.vm`）直接 Run。預期畫面：

- 底部一條水平線；
- 其上矩形房身，中央白色門洞與窗洞，門上有小黑點把手；
- 兩條斜線交成屋頂；
- 左上角太陽（空心大圓）外接八條輻射線。

`ScreenTest.tst` 若存在並載入，執行方式相同；因為輸出是圖形，通常用眼睛比對基準圖。

## 延伸討論

這個測試同時涵蓋了「填滿矩形（逐列水平線）」與「圓（逐列水平線）」——兩者皆以 `drawHorizontalLine` 提升效能（一次寫 16 位元而非逐像素）。若你的 `drawHorizontalLine` 有 bug，房子會出現鋸齒或整列黑掉。真實顯示驅動也用「水平掃描線」實作多邊形填充，這裡是它最樸素的版本。