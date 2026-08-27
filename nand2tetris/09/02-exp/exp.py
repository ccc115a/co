import random

def generate_expression(current_depth: int, max_depth: int) -> str:
    """
    遞迴地生成一個隨機的數學運算式。
    
    :param current_depth: 當前的遞迴深度 (用於控制複雜度)。
    :param max_depth: 允許的最大遞迴深度。
    :return: 隨機生成的數學運算式字串。
    """
    
    # --- 1. 定義終結符 (Terminals) ---
    variables = ['x', 'y', 'z', 'a', 'b']
    operators = ['+', '-', '*', '/']
    
    # --- 2. 終止條件 (Base Case) ---
    # 當達到最大深度或隨機決定停止時，生成一個因子 (Factor)
    if current_depth >= max_depth or random.random() < 0.4:  # 40% 機率終止
        
        # 隨機選擇生成數字還是變數
        if random.random() < 0.6: # 60% 機率生成數字
            return str(random.randint(1, 100))
        else:
            return random.choice(variables)

    # --- 3. 遞迴步驟 (Recursive Step) ---
    else:
        # 選擇生成二元運算式還是括號
        choice = random.choice(['binary', 'parentheses'])
        
        if choice == 'binary':
            # 生成 E op E 形式

            # 隨機選擇一個運算符
            op = random.choice(operators)
            
            # 遞迴生成左側和右側的子表達式
            left_expr = generate_expression(current_depth + 1, max_depth)
            right_expr = generate_expression(current_depth + 1, max_depth)
            
            # 返回完整的二元表達式
            return f"{left_expr} {op} {right_expr}"

        elif choice == 'parentheses':
            # 生成 (E) 形式
            
            # 遞迴生成內部表達式
            inner_expr = generate_expression(current_depth + 1, max_depth)
            
            # 返回括號包裹的表達式
            return f"({inner_expr})"


# --- 範例使用 ---
max_complexity = 3 # 設定運算式的最大複雜度

print(f"--- 隨機生成複雜度 <= {max_complexity} 的運算式 ---")

for i in range(5):
    # 從深度 1 開始生成
    expr = generate_expression(current_depth=1, max_depth=max_complexity)
    print(f"運算式 {i+1}: {expr}")

print("\n--- 增加複雜度 (Max Depth = 5) ---")
for i in range(3):
    expr = generate_expression(current_depth=1, max_depth=5)
    print(f"運算式 {i+1}: {expr}")