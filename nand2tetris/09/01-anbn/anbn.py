def S(n: int) -> str:
    """
    模擬 S -> aSb | ab 文法來生成 a^n b^n 形式的字串。
    :param n: 正整數，表示 a 和 b 的數量。
    :return: 字串 a...ab...b。
    """
    # 遞迴的基底情況 (Base Case): 規則 S -> ab (當 n=1 時)
    if n == 1:
        return "ab"
    
    # 遞迴步驟 (Recursive Step): 規則 S -> aSb (當 n > 1 時)
    # n-1 是因為一次遞迴消耗一個 a 和一個 b
    middle_part = S(n - 1)
    
    return 'a' + middle_part + 'b'

# 範例
print(f"n=1: {S(1)}")
print(f"n=3: {S(3)}")
print(f"n=5: {S(5)}")