from code import Code

code = Code()

def parse_c_instruction(instruction):
    comp = dest = jump = ''
    if '=' in instruction:
        dest, comp = instruction.split('=')
    else:
        comp = instruction
    if ';' in comp:
        comp, jump = comp.split(';')
    return dest, comp, jump

def translate_a_instruction(instruction):
    address = int(instruction[1:])
    binary_address = format(address, '015b')
    return '0' + binary_address

def translate_c_instruction(instruction):
    global code
    dest, comp, jump = parse_c_instruction(instruction)
    comp_binary = '111' + code.comp(comp) + code.dest(dest) + code.jump(jump)
    return comp_binary

def assemble(assembly_code):
    machine_code = []
    for line in assembly_code:
        line = line.strip()
        if not line or line.startswith('//'):
            continue
        if line.startswith('@'):
            machine_code.append(translate_a_instruction(line))
        else:
            machine_code.append(translate_c_instruction(line))
    return machine_code

# Example usage:
assembly_code = [
    '@2',
    'D=A',
    '@3',
    'D=D+A',
    '@0',
    'M=D',
]

machine_code = assemble(assembly_code)

for i in range(len(machine_code)):
    print(f"{machine_code[i]}\t{assembly_code[i]}")

