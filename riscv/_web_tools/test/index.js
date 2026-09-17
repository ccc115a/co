// test/index.js：讓 `node --test test/` 在目錄被當作進入點解析時也能跑全測試。
// （此 node 版本不展開目錄參數，故由本檔載入 test.js；新版 node 若同時掃到
// test.js，會重複註冊一次測試，仍全綠，僅計數加倍。）
import './test.js';
import './cu2rv.js';
import './web.js';
