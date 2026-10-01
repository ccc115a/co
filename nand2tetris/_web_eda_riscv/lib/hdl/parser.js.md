# `parser.js` 程式設計原理

`parser.js` 負責讀入 `.hdl` 格式的原始純文字字串，將它轉換成具有結構關係的 `ast.js` 抽象語法樹。本模組採取直觀的 **Lexer + Recursive Descent (遞迴下降) Parser** 寫法，能提供精確到行與列的錯誤訊息。

## 階段一：Lexer (詞法分析) - 產生 Tokens

Lexer 的工作是把字串「切」成一個個帶有語意並標示位置 (Line:Column) 的標記 (Tokens)。
會跳過空格和註解 (`//` 與 `/* */`)，並萃取出符號與變數名稱。

**範例解析**：
當 Lexer 看到字串：`IN a, b[16];`
它會迴圈逐字元處理，產出一組類似陣列的結果：
```javascript
[
  [{ t: 'Ident', s: 'IN' }, 1, 1],
  [{ t: 'Ident', s: 'a' }, 1, 4],
  [{ t: 'Comma' }, 1, 5],
  [{ t: 'Ident', s: 'b' }, 1, 7],
  [{ t: 'LBracket' }, 1, 8],
  [{ t: 'Num', n: 16 }, 1, 9],
  [{ t: 'RBracket' }, 1, 11],
  [{ t: 'Semi' }, 1, 12]
]
```
*(每個 Token 都嚴格帶上這是在原始碼的第幾行、第幾個字元，未來發生錯誤時才能精準報錯。)*

## 階段二：Parser (語法分析) - 建構 AST

這個階段的 `Parser` Class 負責讀取 Token 來建構 `AST` 類別，實作技術是典型的 「遞迴下降 (Recursive Descent)」。主要由幾個核心驅動函式構成：
- `peek()` 與 `next()` 用來查看與吞下（Consume） Tokens。
- `expectIdent()` 與 `expect()` 負責強硬匹配特定 Token，若不符則拋出 `ParseError`。

**範例解析**：
當執行 `parsePins()` 時來解析剛才的 Tokens，程式內部邏輯會運作成這樣：
1. `name = expectIdent()` ➜ 得到 `"a"`
2. `width` 暫定為 1。
3. `peek()` 看到 `,` 號，知道這組腳位沒指定陣列寬度所以略過 `[ 寬度 ]` 的判斷。
4. 儲存 `{ name: "a", width: 1 }`
5. `next()` 吃掉 `,`，進入下一圈迴圈。
6. `name = expectIdent()` ➜ 得到 `"b"`
7. `peek()` 看到 `〔` (`LBracket`)，此時進入判定路徑：
   - 吞下 `[`
   - `expect('Num')` 取得數字 `16` 將 `width` 變更為 16。
   - 吞下 `]`
8. 儲存 `{ name: "b", width: 16 }`
9. `peek()` 看到 `;` (`Semi`)，知道結尾了，退出函式並回傳腳位陣列。

透過這套一體成型的 Lexer 與 Parser 設計，使用者在瀏覽器編寫 HDL 時能夠獲得「第幾行第幾列預期 `[某字元]` 但卻看到了 `[某字元]`」這般高可讀性的回饋。
