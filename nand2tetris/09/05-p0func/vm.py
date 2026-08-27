import operator
import ast

class VirtualMachine:
    def __init__(self, ir_code):
        self.code = ir_code           # 四元組指令集
        self.ip = 0                   # 指令指標 (Instruction Pointer)
        
        # 函數呼叫堆疊 (Call Stack)
        # 每個元素是一個字典，代表該函數的區域變數環境 (Local Scope)
        # 預設有一個全域環境 (Global Scope)
        self.environment = [{}] 
        
        # 儲存 (return_ip, return_target_var) 的堆疊
        self.ret_stack = []
        
        # 參數緩衝區 (用於 param 指令暫存參數)
        self.args_buffer = []
        
        # 標籤查找表
        self.labels = self._scan_labels()

    def _scan_labels(self):
        """預先掃描所有 label 和 func_entry 的位置"""
        labels = {}
        for index, quad in enumerate(self.code):
            op, arg1, _, _ = quad
            if op == 'label' or op == 'func_entry':
                labels[arg1] = index
        return labels

    def _get_val(self, arg):
        """取得數值：如果是數字字串則轉 int，如果是變數則從當前環境查找"""
        if arg is None or arg == '-':
            return None
        # 嘗試轉換為數字
        try:
            return int(arg)
        except ValueError:
            # 查找變數 (從堆疊頂端的環境找)
            env = self.environment[-1]
            if arg in env:
                return env[arg]
            else:
                raise ValueError(f"Variable '{arg}' not defined in current scope {env}")

    def _set_val(self, name, value):
        """設定變數值到當前環境"""
        self.environment[-1][name] = value

    def run(self):
        ops = {
            '+': operator.add,
            '-': operator.sub,
            '*': operator.mul,
            '/': operator.floordiv, # 假設整數除法
            '<=': operator.le,
            '==': operator.eq,
        }

        print(f"{'Executing IR':=^30}")
        
        while self.ip < len(self.code):
            op, arg1, arg2, result = self.code[self.ip]
            
            # Debug 訊息 (可選)
            # print(f"IP:{self.ip:02d} | {op} {arg1} {arg2} {result} | Env: {self.environment[-1]}")

            if op in ops:
                # 數學與邏輯運算
                v1 = self._get_val(arg1)
                v2 = self._get_val(arg2)
                res = ops[op](v1, v2)
                # 將布林值轉為 1/0
                if isinstance(res, bool):
                    res = 1 if res else 0
                self._set_val(result, res)
                self.ip += 1

            elif op == '=':
                # 賦值
                val = self._get_val(arg1)
                self._set_val(result, val)
                self.ip += 1

            elif op == 'print':
                val = self._get_val(arg1)
                print(f">> OUTPUT: {val}")
                self.ip += 1

            elif op == 'goto':
                self.ip = self.labels[arg1]

            elif op == 'if_false':
                cond = self._get_val(arg1)
                if cond == 0: # False
                    self.ip = self.labels[result]
                else:
                    self.ip += 1

            elif op == 'label' or op == 'func_entry':
                # 標籤不執行任何動作
                self.ip += 1

            # --- 函數呼叫相關指令 ---
            
            elif op == 'param':
                # 將參數值推入緩衝區
                val = self._get_val(arg1)
                self.args_buffer.append(val)
                self.ip += 1

            elif op == 'call':
                func_name = arg1
                # arg2 是參數數量 (此處 VM 實作可以依賴 args_buffer，暫不使用計數)
                target_var = result # 函數回傳後要存入的變數名

                # 1. 記錄返回地址 (下一行指令) 和 接收回傳值的變數
                self.ret_stack.append((self.ip + 1, target_var))
                
                # 2. 建立新的執行環境 (Scope)
                self.environment.append({})
                
                # 3. 跳轉到函數入口
                self.ip = self.labels[func_name]

            elif op == 'recv':
                # 從緩衝區取出參數，存入當前環境的變數中
                # FIFO: 先 param 的先 recv
                val = self.args_buffer.pop(0) 
                self._set_val(arg1, val)
                self.ip += 1

            elif op == 'return':
                # 1. 計算回傳值
                ret_val = self._get_val(arg1) if arg1 != '-' else None
                
                # 2. 銷毀當前環境
                self.environment.pop()
                
                # 3. 恢復上一層狀態
                if self.ret_stack:
                    ret_ip, target_var = self.ret_stack.pop()
                    self.ip = ret_ip
                    # 如果有變數需要接收回傳值
                    if target_var != '-' and ret_val is not None:
                        self._set_val(target_var, ret_val)
                else:
                    # 堆疊為空，代表程式結束 (主程式 return)
                    break

            else:
                raise ValueError(f"Unknown instruction: {op}")

        print(f"{'Execution Finished':=^30}")

def load_ir_from_file(filename):
    """
    讀取以空白分隔的中間碼檔案。
    
    格式範例:
    goto         L0         -          -
    +            a          b          t0
    """
    ir_code = []
    
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                # 1. 去除整行前後的空白
                line = line.strip()
                
                # 2. 跳過空行或註解 (# 開頭)
                if not line or line.startswith('#'):
                    continue
                
                # 3. 使用 split() 自動依據空白切割
                # split() 會自動處理連續的多個空格，並回傳字串列表
                parts = line.split()
                
                # 4. 檢查是否剛好是 4 個欄位
                if len(parts) != 4:
                    print(f"[警告] 第 {line_num} 行格式錯誤 (預期 4 個欄位，讀到 {len(parts)} 個): {line}")
                    continue
                
                # 5. 轉換成 Tuple 並加入列表
                # parts 裡面的元素已經是純字串 (例如 'goto', 'L0', '-', '-')
                ir_code.append(tuple(parts))

        return ir_code

    except FileNotFoundError:
        print(f"[錯誤] 找不到檔案: {filename}")
        sys.exit(1)
    except Exception as e:
        print(f"[錯誤] 讀取檔案時發生問題: {e}")
        sys.exit(1)

# --- 程式碼執行區塊 (Main) ---

if __name__ == "__main__":
    import sys
    # 檢查是否提供了檔案路徑參數
    if len(sys.argv) != 2:
        print("用法: python vm.py <中間碼檔案路徑>")
        sys.exit(1)
    
    # 從命令列參數中取得檔案路徑
    ir_file_path = sys.argv[1]
    
    # 讀取中間碼
    ir_code_data = load_ir_from_file(ir_file_path)
    
    if ir_code_data:
        print(f"成功讀取 {len(ir_code_data)} 條指令。開始執行...")
        
        # 實例化並運行虛擬機
        vm = VirtualMachine(ir_code_data)
        vm.run()
    else:
        print("未讀取到任何有效的中間碼指令。")