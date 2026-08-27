#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <dirent.h>
#include <sys/stat.h>

#define MAX_LINE 256
#define MAX_LABEL 128
#define MAX_FILES 100

// 全域變數
static int label_count = 0;
static int return_count = 0;
static char current_file[MAX_LABEL] = "";

// 移除字串前後空白
char* trim(char* str) {
    char* end;
    while(isspace((unsigned char)*str)) str++;
    if(*str == 0) return str;
    end = str + strlen(str) - 1;
    while(end > str && isspace((unsigned char)*end)) end--;
    end[1] = '\0';
    return str;
}

// 移除註解
void remove_comment(char* line) {
    char* comment = strstr(line, "//");
    if (comment) *comment = '\0';
}

// 寫入算術運算
void write_arithmetic(FILE* out, const char* command) {
    if (strcmp(command, "add") == 0) {
        fprintf(out, "@SP\nAM=M-1\nD=M\nA=A-1\nM=D+M\n");
    } else if (strcmp(command, "sub") == 0) {
        fprintf(out, "@SP\nAM=M-1\nD=M\nA=A-1\nM=M-D\n");
    } else if (strcmp(command, "neg") == 0) {
        fprintf(out, "@SP\nA=M-1\nM=-M\n");
    } else if (strcmp(command, "and") == 0) {
        fprintf(out, "@SP\nAM=M-1\nD=M\nA=A-1\nM=D&M\n");
    } else if (strcmp(command, "or") == 0) {
        fprintf(out, "@SP\nAM=M-1\nD=M\nA=A-1\nM=D|M\n");
    } else if (strcmp(command, "not") == 0) {
        fprintf(out, "@SP\nA=M-1\nM=!M\n");
    } else if (strcmp(command, "eq") == 0) {
        fprintf(out, "@SP\nAM=M-1\nD=M\nA=A-1\nD=M-D\n");
        fprintf(out, "@TRUE_%d\nD;JEQ\n", label_count);
        fprintf(out, "@SP\nA=M-1\nM=0\n");
        fprintf(out, "@END_%d\n0;JMP\n", label_count);
        fprintf(out, "(TRUE_%d)\n@SP\nA=M-1\nM=-1\n", label_count);
        fprintf(out, "(END_%d)\n", label_count);
        label_count++;
    } else if (strcmp(command, "gt") == 0) {
        fprintf(out, "@SP\nAM=M-1\nD=M\nA=A-1\nD=M-D\n");
        fprintf(out, "@TRUE_%d\nD;JGT\n", label_count);
        fprintf(out, "@SP\nA=M-1\nM=0\n");
        fprintf(out, "@END_%d\n0;JMP\n", label_count);
        fprintf(out, "(TRUE_%d)\n@SP\nA=M-1\nM=-1\n", label_count);
        fprintf(out, "(END_%d)\n", label_count);
        label_count++;
    } else if (strcmp(command, "lt") == 0) {
        fprintf(out, "@SP\nAM=M-1\nD=M\nA=A-1\nD=M-D\n");
        fprintf(out, "@TRUE_%d\nD;JLT\n", label_count);
        fprintf(out, "@SP\nA=M-1\nM=0\n");
        fprintf(out, "@END_%d\n0;JMP\n", label_count);
        fprintf(out, "(TRUE_%d)\n@SP\nA=M-1\nM=-1\n", label_count);
        fprintf(out, "(END_%d)\n", label_count);
        label_count++;
    }
}

// 寫入 push 指令
void write_push(FILE* out, const char* segment, int index) {
    if (strcmp(segment, "constant") == 0) {
        fprintf(out, "@%d\nD=A\n@SP\nA=M\nM=D\n@SP\nM=M+1\n", index);
    } else if (strcmp(segment, "local") == 0) {
        fprintf(out, "@%d\nD=A\n@LCL\nA=D+M\nD=M\n@SP\nA=M\nM=D\n@SP\nM=M+1\n", index);
    } else if (strcmp(segment, "argument") == 0) {
        fprintf(out, "@%d\nD=A\n@ARG\nA=D+M\nD=M\n@SP\nA=M\nM=D\n@SP\nM=M+1\n", index);
    } else if (strcmp(segment, "this") == 0) {
        fprintf(out, "@%d\nD=A\n@THIS\nA=D+M\nD=M\n@SP\nA=M\nM=D\n@SP\nM=M+1\n", index);
    } else if (strcmp(segment, "that") == 0) {
        fprintf(out, "@%d\nD=A\n@THAT\nA=D+M\nD=M\n@SP\nA=M\nM=D\n@SP\nM=M+1\n", index);
    } else if (strcmp(segment, "temp") == 0) {
        fprintf(out, "@%d\nD=M\n@SP\nA=M\nM=D\n@SP\nM=M+1\n", 5 + index);
    } else if (strcmp(segment, "pointer") == 0) {
        const char* ptr = (index == 0) ? "THIS" : "THAT";
        fprintf(out, "@%s\nD=M\n@SP\nA=M\nM=D\n@SP\nM=M+1\n", ptr);
    } else if (strcmp(segment, "static") == 0) {
        fprintf(out, "@%s.%d\nD=M\n@SP\nA=M\nM=D\n@SP\nM=M+1\n", current_file, index);
    }
}

// 寫入 pop 指令
void write_pop(FILE* out, const char* segment, int index) {
    if (strcmp(segment, "local") == 0) {
        fprintf(out, "@%d\nD=A\n@LCL\nD=D+M\n@R13\nM=D\n", index);
        fprintf(out, "@SP\nAM=M-1\nD=M\n@R13\nA=M\nM=D\n");
    } else if (strcmp(segment, "argument") == 0) {
        fprintf(out, "@%d\nD=A\n@ARG\nD=D+M\n@R13\nM=D\n", index);
        fprintf(out, "@SP\nAM=M-1\nD=M\n@R13\nA=M\nM=D\n");
    } else if (strcmp(segment, "this") == 0) {
        fprintf(out, "@%d\nD=A\n@THIS\nD=D+M\n@R13\nM=D\n", index);
        fprintf(out, "@SP\nAM=M-1\nD=M\n@R13\nA=M\nM=D\n");
    } else if (strcmp(segment, "that") == 0) {
        fprintf(out, "@%d\nD=A\n@THAT\nD=D+M\n@R13\nM=D\n", index);
        fprintf(out, "@SP\nAM=M-1\nD=M\n@R13\nA=M\nM=D\n");
    } else if (strcmp(segment, "temp") == 0) {
        fprintf(out, "@SP\nAM=M-1\nD=M\n@%d\nM=D\n", 5 + index);
    } else if (strcmp(segment, "pointer") == 0) {
        const char* ptr = (index == 0) ? "THIS" : "THAT";
        fprintf(out, "@SP\nAM=M-1\nD=M\n@%s\nM=D\n", ptr);
    } else if (strcmp(segment, "static") == 0) {
        fprintf(out, "@SP\nAM=M-1\nD=M\n@%s.%d\nM=D\n", current_file, index);
    }
}

// 寫入 label 指令
void write_label(FILE* out, const char* label) {
    fprintf(out, "(%s)\n", label);
}

// 寫入 goto 指令
void write_goto(FILE* out, const char* label) {
    fprintf(out, "@%s\n0;JMP\n", label);
}

// 寫入 if-goto 指令
void write_if_goto(FILE* out, const char* label) {
    fprintf(out, "@SP\nAM=M-1\nD=M\n@%s\nD;JNE\n", label);
}

// 寫入 function 指令
void write_function(FILE* out, const char* func_name, int num_locals) {
    fprintf(out, "(%s)\n", func_name);
    for (int i = 0; i < num_locals; i++) {
        fprintf(out, "@SP\nA=M\nM=0\n@SP\nM=M+1\n");
    }
}

// 寫入 call 指令
void write_call(FILE* out, const char* func_name, int num_args) {
    char return_label[MAX_LABEL];
    snprintf(return_label, MAX_LABEL, "%s$ret.%d", func_name, return_count++);
    
    // Push return address
    fprintf(out, "@%s\nD=A\n@SP\nA=M\nM=D\n@SP\nM=M+1\n", return_label);
    
    // Push LCL, ARG, THIS, THAT
    fprintf(out, "@LCL\nD=M\n@SP\nA=M\nM=D\n@SP\nM=M+1\n");
    fprintf(out, "@ARG\nD=M\n@SP\nA=M\nM=D\n@SP\nM=M+1\n");
    fprintf(out, "@THIS\nD=M\n@SP\nA=M\nM=D\n@SP\nM=M+1\n");
    fprintf(out, "@THAT\nD=M\n@SP\nA=M\nM=D\n@SP\nM=M+1\n");
    
    // ARG = SP - 5 - num_args
    fprintf(out, "@SP\nD=M\n@5\nD=D-A\n@%d\nD=D-A\n@ARG\nM=D\n", num_args);
    
    // LCL = SP
    fprintf(out, "@SP\nD=M\n@LCL\nM=D\n");
    
    // goto function
    fprintf(out, "@%s\n0;JMP\n", func_name);
    
    // (return_label)
    fprintf(out, "(%s)\n", return_label);
}

// 寫入 return 指令
void write_return(FILE* out) {
    // frame = LCL
    fprintf(out, "@LCL\nD=M\n@R13\nM=D\n");
    
    // retAddr = *(frame-5)
    fprintf(out, "@5\nA=D-A\nD=M\n@R14\nM=D\n");
    
    // *ARG = pop()
    fprintf(out, "@SP\nAM=M-1\nD=M\n@ARG\nA=M\nM=D\n");
    
    // SP = ARG + 1
    fprintf(out, "@ARG\nD=M+1\n@SP\nM=D\n");
    
    // THAT = *(frame-1)
    fprintf(out, "@R13\nAM=M-1\nD=M\n@THAT\nM=D\n");
    
    // THIS = *(frame-2)
    fprintf(out, "@R13\nAM=M-1\nD=M\n@THIS\nM=D\n");
    
    // ARG = *(frame-3)
    fprintf(out, "@R13\nAM=M-1\nD=M\n@ARG\nM=D\n");
    
    // LCL = *(frame-4)
    fprintf(out, "@R13\nAM=M-1\nD=M\n@LCL\nM=D\n");
    
    // goto retAddr
    fprintf(out, "@R14\nA=M\n0;JMP\n");
}

// 處理單個 VM 指令
void process_command(FILE* out, char* line) {
    char command[MAX_LINE], arg1[MAX_LINE], arg2[MAX_LINE];
    int num_tokens = sscanf(line, "%s %s %s", command, arg1, arg2);
    
    if (num_tokens == 0) return;
    
    // 算術/邏輯指令
    if (strcmp(command, "add") == 0 || strcmp(command, "sub") == 0 ||
        strcmp(command, "neg") == 0 || strcmp(command, "eq") == 0 ||
        strcmp(command, "gt") == 0 || strcmp(command, "lt") == 0 ||
        strcmp(command, "and") == 0 || strcmp(command, "or") == 0 ||
        strcmp(command, "not") == 0) {
        write_arithmetic(out, command);
    }
    // push 指令
    else if (strcmp(command, "push") == 0) {
        write_push(out, arg1, atoi(arg2));
    }
    // pop 指令
    else if (strcmp(command, "pop") == 0) {
        write_pop(out, arg1, atoi(arg2));
    }
    // label 指令
    else if (strcmp(command, "label") == 0) {
        write_label(out, arg1);
    }
    // goto 指令
    else if (strcmp(command, "goto") == 0) {
        write_goto(out, arg1);
    }
    // if-goto 指令
    else if (strcmp(command, "if-goto") == 0) {
        write_if_goto(out, arg1);
    }
    // function 指令
    else if (strcmp(command, "function") == 0) {
        write_function(out, arg1, atoi(arg2));
    }
    // call 指令
    else if (strcmp(command, "call") == 0) {
        write_call(out, arg1, atoi(arg2));
    }
    // return 指令
    else if (strcmp(command, "return") == 0) {
        write_return(out);
    }
}

// 寫入 bootstrap 程式碼
void write_bootstrap(FILE* out) {
    fprintf(out, "// Bootstrap code\n");
    fprintf(out, "// Initialize SP = 256\n");
    fprintf(out, "@256\n");
    fprintf(out, "D=A\n");
    fprintf(out, "@SP\n");
    fprintf(out, "M=D\n");
    fprintf(out, "// Call Sys.init\n");
    write_call(out, "Sys.init", 0);
}

// 處理單個 VM 檔案
void translate_file(FILE* out, const char* filename) {
    FILE* in = fopen(filename, "r");
    if (!in) {
        printf("警告: 無法開啟檔案 %s\n", filename);
        return;
    }
    
    // 取得檔案名稱 (不含路徑和副檔名)
    const char* base_name = strrchr(filename, '/');
    if (!base_name) base_name = strrchr(filename, '\\');
    if (!base_name) base_name = filename;
    else base_name++;
    
    strncpy(current_file, base_name, MAX_LABEL - 1);
    char* dot = strrchr(current_file, '.');
    if (dot) *dot = '\0';
    
    fprintf(out, "\n// ========== File: %s ==========\n", filename);
    
    // 處理每一行
    char line[MAX_LINE];
    while (fgets(line, MAX_LINE, in)) {
        remove_comment(line);
        char* trimmed = trim(line);
        if (strlen(trimmed) > 0) {
            fprintf(out, "// %s\n", trimmed);
            process_command(out, trimmed);
        }
    }
    
    fclose(in);
}

int main(int argc, char* argv[]) {
    if (argc < 3) {
        printf("使用方式: %s <output.asm> <file1.vm> [file2.vm] ...\n", argv[0]);
        return 1;
    }
    
    FILE* out = fopen(argv[1], "w");
    if (!out) {
        printf("無法建立輸出檔案: %s\n", argv[1]);
        return 1;
    }
    
    // 多檔案時寫入 bootstrap
    if (argc > 3) {
        write_bootstrap(out);
    }
    
    // 處理每個輸入檔案
    for (int i = 2; i < argc; i++) {
        translate_file(out, argv[i]);
    }
    
    fclose(out);
    printf("轉換完成: %s\n", argv[1]);
    return 0;
}