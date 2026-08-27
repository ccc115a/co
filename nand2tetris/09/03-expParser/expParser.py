import re

class Tokenizer:
    def __init__(self, expression: str):
        # 匹配數字、變數(單字母)、運算符號或括號
        # \d+ : 數字
        # [a-zA-Z] : 單個變數
        # [+\-*/()] : 運算符或括號
        self.tokens = re.findall(r'\d+|[a-zA-Z]|[+\-*/()]', expression)
        self.current_index = 0

    def get_next_token(self):
        if self.current_index < len(self.tokens):
            token = self.tokens[self.current_index]
            self.current_index += 1
            return token
        return None

    def peek_token(self):
        if self.current_index < len(self.tokens):
            return self.tokens[self.current_index]
        return None

class Parser:
    def __init__(self, expression: str, variables: dict = None):
        self.tokenizer = Tokenizer(expression.replace(' ', '')) # 移除空格
        self.variables = variables if variables is not None else {}

    def parse(self):
        """
        開始解析運算式 E。
        """
        return self._expression()

    def _factor(self):
        """
        模擬 E -> (E) | id | num 的一部分 (處理最基本的單元)。
        """
        token = self.tokenizer.get_next_token()

        if token is None:
            raise ValueError("Unexpected end of expression.")

        if token == '(':
            # 規則 E -> (E)
            result = self._expression()
            if self.tokenizer.get_next_token() != ')':
                raise ValueError("Missing closing parenthesis ')'")
            return result
        
        elif token.isdigit():
            # 規則 E -> num
            return float(token)
        
        elif token.isalpha():
            # 規則 E -> id
            if token in self.variables:
                return self.variables[token]
            else:
                raise NameError(f"Variable '{token}' not defined.")
        
        else:
            raise ValueError(f"Unexpected token: {token}")

    def _expression(self):
        """
        模擬文法的主體 E -> E op E，由於是遞迴下降，需要先計算最左側的 E。
        """
        # 初始的左側表達式 (left-hand side)
        result = self._factor() 

        # 循環檢查是否有運算符 E op E
        while True:
            op = self.tokenizer.peek_token()

            if op in ['+', '-', '*', '/']:
                # 規則 E -> E op E
                self.tokenizer.get_next_token() # 消耗運算符
                
                # 遞迴計算右側的表達式 (right-hand side)
                # 注意：由於我們不處理優先級，這裡簡單地將當前結果作為左操作數，
                # 然後計算右操作數，實現從左到右的計算。
                right = self._factor()
                
                if op == '+':
                    result += right
                elif op == '-':
                    result -= right
                elif op == '*':
                    result *= right
                elif op == '/':
                    if right == 0:
                        raise ZeroDivisionError("Division by zero.")
                    result /= right
            else:
                # 遇到非運算符 (例如 ')' 或 None)，結束循環
                break

        return result

# --- 範例使用 ---

# 設置變數值
variables_map = {'x': 10, 'y': 5, 'z': 2}

print("--- 簡易解析器範例 (從左到右計算，忽略標準優先級) ---")

expressions = [
    "10 + 2 * 3",           # 期望結果: (10 + 2) * 3 = 36
    "5 - 2 + 1",            # 期望結果: (5 - 2) + 1 = 4
    "x + y / z",            # 期望結果: (10 + 5) / 2 = 7.5
    "y * (3 + z)",          # 期望結果: 5 * (3 + 2) = 25
]

for expr in expressions:
    try:
        parser = Parser(expr, variables_map)
        result = parser.parse()
        
        # 確認整個字串是否都被消耗
        if parser.tokenizer.peek_token() is not None:
             raise ValueError("Extra tokens at the end of expression.")

        print(f"表達式: {expr.ljust(15)} | 計算結果 (L-to-R): {result}")
    except Exception as e:
        print(f"表達式: {expr.ljust(15)} | 錯誤: {e}")

# 錯誤範例
print("\n--- 錯誤範例 ---")
try:
    Parser("(1 + 2").parse()
except ValueError as e:
    print(f"錯誤測試: (1 + 2  | 錯誤: {e}")