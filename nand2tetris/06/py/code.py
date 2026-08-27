class Code:
    @staticmethod
    def dest(mnemonic):
        return {
            '':   '000',
            'M':  '001',
            'D':  '010',
            'MD': '011',
            'A':  '100',
            'AM': '101',
            'AD': '110',
            'AMD':'111',
        }[mnemonic]

    @staticmethod
    def comp(mnemonic):
        return {
            '0':   '0101010',
            '1':   '0111111',
            '-1':  '0111010',
            'D':   '0001100',
            'A':   '0110000',
            '!D':  '0001101',
            '!A':  '0110001',
            '-D':  '0001111',
            '-A':  '0110011',
            'D+1': '0011111',
            'A+1': '0110111',
            'D-1': '0001110',
            'A-1': '0110010',
            'D+A': '0000010',
            'D-A': '0010011',
            'A-D': '0000111',
            'D&A': '0000000',
            'D|A': '0010101',
        }[mnemonic]

    @staticmethod
    def jump(mnemonic):
        return {
            '':   '000',
            'JGT':'001',
            'JEQ':'010',
            'JGE':'011',
            'JLT':'100',
            'JNE':'101',
            'JLE':'110',
            'JMP':'111',
        }[mnemonic]

if __name__ == '__main__':
    # Example usage:
    code = Code()
    print(code.dest('D'))  # Output: '010'
    print(code.comp('A+1'))  # Output: '0110111'
    print(code.jump('JGT'))  # Output: '001'
