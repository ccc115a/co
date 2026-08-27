import re
import sys

class Compiler:
    def __init__(self, code):
        self.tokens = self.tokenize(code)
        self.pos = 0
        self.temp_count = 0
        self.label_count = 0
        self.ir_code = []

    def tokenize(self, code):
        token_specification = [
            # 新增 fn 和 return 關鍵字
            ('KEYWORD', r'\b(let|while|if|else|print|fn|return)\b'),
            ('NUMBER',  r'\b\d+\b'),
            ('ID',      r'\b[a-zA-Z_][a-zA-Z0-9_]*\b'),
            ('OP',      r'(<=|==|\+|\-|\*|/|=)'),
            ('SKIP',    r'[ \t\n]+'),
            ('MISC',    r'[;(){},]'), # 新增逗號
        ]
        tok_regex = '|'.join('(?P<%s>%s)' % pair for pair in token_specification)
        get_token = re.compile(tok_regex).match
        line = code
        pos = 0
        mo = get_token(line)
        tokens = []
        while mo is not None:
            kind = mo.lastgroup
            value = mo.group(kind)
            if kind != 'SKIP':
                tokens.append((kind, value))
            pos = mo.end()
            mo = get_token(line, pos)
        return tokens

    # --- 輔助工具 ---
    def peek(self):
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return None

    def consume(self, expected_value=None):
        token = self.peek()
        if not token:
            raise SyntaxError("Unexpected end of input")
        if expected_value and token[1] != expected_value:
            raise SyntaxError(f"Expected '{expected_value}', found '{token[1]}'")
        self.pos += 1
        return token

    def new_temp(self):
        t = f"t{self.temp_count}"
        self.temp_count += 1
        return t

    def new_label(self):
        l = f"L{self.label_count}"
        self.label_count += 1
        return l

    def emit(self, op, arg1, arg2, result):
        self.ir_code.append((op, arg1, arg2, result))

    # --- 解析邏輯 ---

    def parse_program(self):
        # 如果有函數定義，通常要先跳過定義區塊直接執行主程式，
        # 但為了簡化，這裡假設進入點是第一行，或由外部邏輯控制跳轉。
        start_label = self.new_label()
        self.emit('goto', start_label, '-', '-') # 跳到主程式開始
        
        while self.pos < len(self.tokens):
            token = self.peek()
            if token[1] == 'fn':
                self.parse_function_def()
            else:
                # 標記主程式開始的地方 (只標記一次)
                if start_label:
                    self.emit('label', start_label, '-', '-')
                    start_label = None 
                self.parse_statement()

    def parse_function_def(self):
        self.consume('fn')
        func_name = self.consume()[1]
        
        # 生成函數入口標籤
        self.emit('func_entry', func_name, '-', '-')
        
        self.consume('(')
        # 解析參數列表 (這裡僅消耗 token，實務上需加入符號表)
        params = []
        if self.peek()[1] != ')':
            while True:
                param_name = self.consume()[1] # 參數名
                params.append(param_name)
                # 選擇性生成: 接收參數的 IR (看實作慣例)
                self.emit('recv', param_name, '-', '-') 
                if self.peek()[1] == ',':
                    self.consume(',')
                else:
                    break
        self.consume(')')
        
        self.parse_block()
        # 函數結束隱含 return (若沒寫 return)
        self.emit('return', '-', '-', '-')

    def parse_statement(self):
        token = self.peek()
        if token[1] == 'let':
            self.parse_declaration()
        elif token[1] == 'while':
            self.parse_while()
        elif token[1] == 'if':
            self.parse_if()
        elif token[1] == 'print':
            self.parse_print()
        elif token[1] == 'return':
            self.parse_return()
        elif token[1] == '{':
            self.parse_block()
        elif token[0] == 'ID' or token[0] == 'NUMBER':
            # 表達式語句 (如 function call)
            self.parse_expression()
            self.consume(';')
        else:
            self.consume() # 容錯

    def parse_block(self):
        self.consume('{')
        while self.peek()[1] != '}':
            self.parse_statement()
        self.consume('}')

    def parse_declaration(self):
        self.consume('let')
        identifier = self.consume()[1]
        self.consume('=')
        expr_result = self.parse_expression()
        self.consume(';')
        self.emit('=', expr_result, '-', identifier)

    def parse_print(self):
        self.consume('print')
        expr_result = self.parse_expression()
        self.consume(';')
        self.emit('print', expr_result, '-', '-')

    def parse_return(self):
        self.consume('return')
        expr_result = self.parse_expression()
        self.consume(';')
        self.emit('return', expr_result, '-', '-')

    def parse_while(self):
        self.consume('while')
        self.consume('(')
        start_l, end_l = self.new_label(), self.new_label()
        self.emit('label', start_l, '-', '-')
        cond = self.parse_expression()
        self.consume(')')
        self.emit('if_false', cond, '-', end_l)
        self.parse_block()
        self.emit('goto', start_l, '-', '-')
        self.emit('label', end_l, '-', '-')

    def parse_if(self):
        self.consume('if')
        self.consume('(')
        cond = self.parse_expression()
        self.consume(')')
        else_l, end_l = self.new_label(), self.new_label()
        self.emit('if_false', cond, '-', else_l)
        self.parse_block() # true block
        self.emit('goto', end_l, '-', '-')
        self.emit('label', else_l, '-', '-')
        if self.peek() and self.peek()[1] == 'else':
            self.consume('else')
            self.parse_block() # false block
        self.emit('label', end_l, '-', '-')

    def parse_expression(self):
        # 簡單的左結合解析
        left = self.parse_term()
        while self.peek() and self.peek()[0] == 'OP' and self.peek()[1] != '=':
            op = self.consume()[1]
            right = self.parse_term()
            temp = self.new_temp()
            self.emit(op, left, right, temp)
            left = temp
        return left

    def parse_term(self):
        token = self.peek()
        if token[0] == 'NUMBER':
            return self.consume()[1]
        elif token[0] == 'ID':
            # 檢查是否為函數呼叫: ID(...)
            name = self.consume()[1]
            if self.peek()[1] == '(':
                return self.parse_function_call(name)
            return name
        else:
            raise SyntaxError(f"Unexpected term: {token}")

    def parse_function_call(self, func_name):
        self.consume('(')
        args = []
        if self.peek()[1] != ')':
            while True:
                # 遞迴解析引數表達式
                arg_val = self.parse_expression()
                args.append(arg_val)
                if self.peek()[1] == ',':
                    self.consume(',')
                else:
                    break
        self.consume(')')
        
        # 生成 Param 指令
        for arg in args:
            self.emit('param', arg, '-', '-')
            
        # 生成 Call 指令
        result_temp = self.new_temp()
        # arg1: 函數名, arg2: 參數數量, result: 接收回傳值的暫存器
        self.emit('call', func_name, str(len(args)), result_temp)
        return result_temp

# --- 主程式執行區塊 ---

if __name__ == "__main__":
    # 檢查是否提供了檔案路徑參數
    if len(sys.argv) < 2:
        print("使用方式: python compiler.py <原始碼檔案路徑>")
        print("範例: python compiler.py source.code > ir.txt")
        sys.exit(1)
    
    source_filename = sys.argv[1]
    
    try:
        # 讀取程式碼檔案
        with open(source_filename, 'r', encoding='utf-8') as f:
            source_code = f.read()
            
        # 編譯程式碼
        compiler = Compiler(source_code)
        compiler.parse_program()

        # 輸出 IR (這裡輸出純格式，方便重定向到檔案)
        for q in compiler.ir_code:
            op, a1, a2, res = q
            # 使用 tab 隔開，或者固定寬度空格，讓您的 load_ir_from_file 容易讀取
            # 這裡使用您之前要求的固定寬度對齊格式
            print(f"{op:<12} {a1:<10} {a2:<10} {res:<10}")
            
    except FileNotFoundError:
        print(f"錯誤: 找不到檔案 '{source_filename}'")
        sys.exit(1)
    except Exception as e:
        print(f"編譯時發生錯誤: {e}")
        sys.exit(1)