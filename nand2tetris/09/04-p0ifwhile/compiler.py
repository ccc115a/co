import re

class Compiler:
    def __init__(self, code):
        self.tokens = self.tokenize(code)
        self.pos = 0
        self.temp_count = 0
        self.label_count = 0
        self.ir_code = []  # 儲存生成的四元組

    def tokenize(self, code):
        # 定義 token 的正規表達式規則
        token_specification = [
            ('KEYWORD', r'\b(let|while|if|else|print)\b'), # 關鍵字
            ('NUMBER',  r'\b\d+\b'),            # 整數
            ('ID',      r'\b[a-zA-Z_][a-zA-Z0-9_]*\b'), # 變數名稱
            ('OP',      r'(<=|==|\+|=)'),       # 運算子
            ('SKIP',    r'[ \t\n]+'),           # 空白與換行
            ('MISC',    r'[;(){}]'),            # 其他符號
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

    # --- 輔助函式 ---
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

    # --- 解析與生成函式 (對應 BNF) ---

    def parse_program(self):
        while self.pos < len(self.tokens):
            self.parse_statement()

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
        elif token[1] == '{':
            self.parse_block()
        else:
            # 忽略多餘的分號或未預期符號
            self.consume()

    def parse_block(self):
        self.consume('{')
        while self.peek()[1] != '}':
            self.parse_statement()
        self.consume('}')

    def parse_declaration(self):
        self.consume('let')
        identifier = self.consume()[1] # 取得變數名
        self.consume('=')
        expr_result = self.parse_expression()
        self.consume(';')
        # 生成四元組: (=, 表達式結果, -, 變數)
        self.emit('=', expr_result, '-', identifier)

    def parse_print(self):
        self.consume('print')
        expr_result = self.parse_expression()
        self.consume(';')
        # 生成四元組: (print, 表達式結果, -, -)
        self.emit('print', expr_result, '-', '-')

    def parse_while(self):
        self.consume('while')
        self.consume('(')
        
        start_label = self.new_label()
        end_label = self.new_label()
        
        # 標記迴圈開始位置
        self.emit('label', start_label, '-', '-')
        
        cond_result = self.parse_expression()
        self.consume(')')
        
        # 如果條件為假，跳轉到結束
        self.emit('if_false', cond_result, '-', end_label)
        
        self.parse_statement() # 解析 block
        
        # 執行完 block 後跳回開始
        self.emit('goto', start_label, '-', '-')
        
        # 標記結束位置
        self.emit('label', end_label, '-', '-')

    def parse_if(self):
        self.consume('if')
        self.consume('(')
        cond_result = self.parse_expression()
        self.consume(')')
        
        else_label = self.new_label()
        end_label = self.new_label()
        
        # 如果條件為假，跳轉到 else 標籤
        self.emit('if_false', cond_result, '-', else_label)
        
        self.parse_statement() # True block
        
        # True block 執行完後，跳過 else block
        self.emit('goto', end_label, '-', '-')
        
        # 標記 Else 開始位置
        self.emit('label', else_label, '-', '-')
        
        if self.peek() and self.peek()[1] == 'else':
            self.consume('else')
            self.parse_statement() # False block
            
        # 標記整個 if 結束位置
        self.emit('label', end_label, '-', '-')

    def parse_expression(self):
        # 處理左運算元 (Term)
        left = self.parse_term()
        
        # 檢查是否有運算子 (如 + 或 <=)
        # 因為 BNF 定義是不分優先順序，所以簡單地由左向右解析
        while self.peek() and self.peek()[0] == 'OP' and self.peek()[1] != '=':
            op = self.consume()[1]
            right = self.parse_term()
            temp = self.new_temp()
            # 生成運算四元組: (op, left, right, temp)
            self.emit(op, left, right, temp)
            left = temp # 結果變成下一次運算的左運算元
            
        return left

    def parse_term(self):
        token = self.consume()
        return token[1] # 回傳變數名或數字字串

# --- 主程式執行 ---

source_code = """
let i = 1;
let sum = 0;

while (i <= 5) {
    let sum = sum + i;
    let i = i + 1;
    
    if (i == 3) {
        print sum;
    } else {
        print i;
    }
}
print sum;
"""

compiler = Compiler(source_code)
compiler.parse_program()

# 輸出結果
print(f"{'OP':<10} {'ARG1':<10} {'ARG2':<10} {'RESULT':<10}")
print("-" * 40)
for q in compiler.ir_code:
    # 處理 None 或 '-' 以美化輸出
    op, a1, a2, res = q
    print(f"{op:<10} {a1:<10} {a2:<10} {res:<10}")
