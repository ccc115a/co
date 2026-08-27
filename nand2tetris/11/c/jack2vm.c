/**
 * @file JackCompiler.c
 * @brief Nand2Tetris Jack 語言編譯器 C 語言實現 (單一檔案)
 *
 * 這個程式碼將多個 Python 版本的 Jack 編譯器檔案合併並翻譯成單一的 C 語言檔案。
 * 它包含以下幾個核心部分：
 * 1.  詞法分析器 (Lexer): 將原始碼分解成一系列的詞元 (Tokens)。
 * 2.  符號表 (Symbol Table): 管理變數、類別和子程式的識別碼及其作用域。
 * 3.  VM 寫入器 (VM Writer): 產生符合 Hack VM 規範的中間程式碼。
 * 4.  語法分析器 (Parser): 採用遞迴下降法 (Recursive Descent) 進行語法分析，
 *     並在分析過程中呼叫 VM 寫入器來產生目標程式碼。
 *
 * 每個主要的 compile_... 函式上方都附有其對應的 Jack 語言 BNF 語法規則。
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <dirent.h>
#include <sys/stat.h>
#include <stdarg.h> // 用於可變參數函式 va_list

// --- 巨集定義 ---
#define MAX_LINE_LENGTH 1024
#define MAX_TOKEN_LENGTH 256
#define MAX_TOKENS 32768
#define MAX_SYMBOLS 256
#define MAX_PATH_LENGTH 1024

//----------------------------------------------------------------------
// 1. 常數定義 (對應原 Python 專案的 JackConstant.py)
//----------------------------------------------------------------------

// Token 類型: 用於詞法分析器，標識每個詞元的類別
typedef enum {
    T_KEYWORD, T_SYM, T_NUM, T_STR, T_ID, T_EOF, T_ERROR
} TokenType;

// 關鍵字: Jack 語言的所有保留關鍵字
typedef enum {
    KW_CLASS, KW_METHOD, KW_FUNCTION, KW_CONSTRUCTOR, KW_INT, KW_BOOLEAN,
    KW_CHAR, KW_VOID, KW_VAR, KW_STATIC, KW_FIELD, KW_LET, KW_DO, KW_IF,
    KW_ELSE, KW_WHILE, KW_RETURN, KW_TRUE, KW_FALSE, KW_NULL, KW_THIS,
    KW_NONE // 代表關鍵字列表的結束
} Keyword;

// 關鍵字字串陣列，用於比對
const char* keyword_map[] = {
    "class", "method", "function", "constructor", "int", "boolean",
    "char", "void", "var", "static", "field", "let", "do", "if",
    "else", "while", "return", "true", "false", "null", "this"
};

// 符號種類: 用於符號表，區分變數的作用域和類型
typedef enum {
    SK_STATIC, // 靜態變數
    SK_FIELD,  // 欄位變數 (物件成員)
    SK_ARG,    // 引數
    SK_VAR,    // 區域變數
    SK_NONE
} SymbolKind;

// 符號種類對應到 VM 記憶體區段的名稱
const char* symbol_kind_map[] = {"static", "this", "argument", "local"};

// VM 暫存器索引
#define TEMP_RETURN 0 // 用於丟棄函式回傳值
#define TEMP_ARRAY  1 // 用於陣列賦值時暫存數值

//----------------------------------------------------------------------
// 2. 結構體定義 (對應各個 Python 類別)
//----------------------------------------------------------------------

// Token 結構: 代表一個詞法單元 (詞元)，包含類型和值
typedef struct {
    TokenType type;
    char value[MAX_TOKEN_LENGTH];
    int int_val; // 如果是數字，則儲存其整數值
} Token;

// Lex 結構: 詞法分析器，持有所有詞元和當前處理位置
typedef struct {
    Token tokens[MAX_TOKENS];
    int token_count;
    int current_token_index;
} Lex;

// Symbol 結構: 符號表中的一個條目，記錄了識別碼的名稱、類型、種類和索引
typedef struct {
    char name[MAX_TOKEN_LENGTH];
    char type[MAX_TOKEN_LENGTH];
    SymbolKind kind;
    int index;
} Symbol;

// SymbolTable 結構: 管理類別和子程式範圍的符號
typedef struct {
    Symbol class_symbols[MAX_SYMBOLS];      // 類別級別的符號 (static, field)
    int class_symbol_count;
    Symbol subroutine_symbols[MAX_SYMBOLS]; // 子程式級別的符號 (arg, var)
    int subroutine_symbol_count;
    int index_static, index_field, index_arg, index_var; // 各種符號的計數器
} SymbolTable;

// VMWriter 結構: VM 程式碼產生器，主要功能是將指令寫入輸出檔案
typedef struct {
    FILE* outfile;
} VMWriter;

// Parser 結構: 語法分析器，是整個編譯器的核心引擎。
// 它聚合了詞法分析器、符號表和 VM 寫入器，並記錄當前編譯的狀態。
typedef struct {
    Lex* lex;
    SymbolTable* symbols;
    VMWriter* vm;
    char current_class[MAX_TOKEN_LENGTH];      // 當前正在編譯的類別名稱
    char current_subroutine[MAX_TOKEN_LENGTH]; // 當前正在編譯的子程式名稱
    int label_counter; // 用於產生獨一無二的 VM 標籤
} Parser;


//----------------------------------------------------------------------
// 3. 函數原型宣告
//----------------------------------------------------------------------

// --- 錯誤處理 ---
void report_error(const char* message, const char* file, int line);
#define ERROR(msg) report_error(msg, __FILE__, __LINE__)

// --- 詞法分析器 ---
void lex_init(Lex* lex, const char* filepath);
Token* lex_advance(Lex* lex);
Token* lex_peek(Lex* lex);

// --- 符號表 ---
void symbol_table_init(SymbolTable* st);
void symbol_table_start_subroutine(SymbolTable* st);
void symbol_table_define(SymbolTable* st, const char* name, const char* type, SymbolKind kind);
int symbol_table_var_count(SymbolTable* st, SymbolKind kind);
Symbol* symbol_table_lookup(SymbolTable* st, const char* name);

// --- VM 寫入器 ---
void vm_writer_init(VMWriter* vm, const char* jack_filepath);
void vm_writer_close(VMWriter* vm);
void vm_writer_write_push(VMWriter* vm, const char* segment, int index);
void vm_writer_write_pop(VMWriter* vm, const char* segment, int index);
void vm_writer_write_arithmetic(VMWriter* vm, const char* command);
void vm_writer_write_label(VMWriter* vm, const char* label);
void vm_writer_write_goto(VMWriter* vm, const char* label);
void vm_writer_write_if(VMWriter* vm, const char* label);
void vm_writer_write_call(VMWriter* vm, const char* name, int n_args);
void vm_writer_write_function(VMWriter* vm, const char* name, int n_locals);
void vm_writer_write_return(VMWriter* vm);

// --- 語法分析器 (遞迴下降函式) ---
void parser_init(Parser* parser, const char* filepath);
void parser_destroy(Parser* parser);
void compile_class(Parser* p);
void compile_class_var_dec(Parser* p);
void compile_subroutine(Parser* p);
void compile_parameter_list(Parser* p);
void compile_var_dec(Parser* p);
void compile_statements(Parser* p);
void compile_do(Parser* p);
void compile_let(Parser* p);
void compile_while(Parser* p);
void compile_return(Parser* p);
void compile_if(Parser* p);
void compile_expression(Parser* p);
void compile_term(Parser* p);
int compile_expression_list(Parser* p);

// --- 主程式 ---
void analyze_file(const char* filepath);

//----------------------------------------------------------------------
// 4. 錯誤處理實作
//----------------------------------------------------------------------
void report_error(const char* message, const char* file, int line) {
    fprintf(stderr, "Compiler Error: %s (at %s:%d)\n", message, file, line);
    exit(1);
}

//----------------------------------------------------------------------
// 5. 詞法分析器 (Lexer) 實作
//----------------------------------------------------------------------
// 移除 Jack 原始碼中的所有註解 (// 和 /* ... */)
char* remove_comments(char* source) {
    char* result = (char*)malloc(strlen(source) + 1);
    if (!result) ERROR("Memory allocation failed");
    char* dest = result;
    char* src = source;
    int in_multiline_comment = 0;
    while (*src) {
        if (in_multiline_comment) {
            if (*src == '*' && *(src + 1) == '/') {
                in_multiline_comment = 0;
                src += 2;
            } else {
                src++;
            }
        } else {
            if (*src == '/' && *(src + 1) == '/') {
                src += 2;
                while (*src && *src != '\n') src++;
            } else if (*src == '/' && *(src + 1) == '*') {
                in_multiline_comment = 1;
                src += 2;
            } else {
                *dest++ = *src++;
            }
        }
    }
    *dest = '\0';
    return result;
}

// 將無註解的原始碼字串分解成 Token 序列
void lex_tokenize(Lex* lex, char* source_no_comments) {
    const char* symbols = "{}()[].,;+-*/&|<>=~";
    char* p = source_no_comments;
    lex->token_count = 0;
    while (*p) {
        if (isspace(*p)) { p++; continue; }
        Token* t = &lex->tokens[lex->token_count];
        // 符號
        if (strchr(symbols, *p)) {
            t->type = T_SYM;
            t->value[0] = *p; t->value[1] = '\0';
            p++;
        // 字串常數
        } else if (*p == '"') {
            t->type = T_STR;
            p++;
            char* v = t->value;
            while (*p && *p != '"') *v++ = *p++;
            *v = '\0';
            if (*p == '"') p++;
        // 數字常數
        } else if (isdigit(*p)) {
            t->type = T_NUM;
            char* v = t->value;
            while (isdigit(*p)) *v++ = *p++;
            *v = '\0';
            t->int_val = atoi(t->value);
        // 識別碼或關鍵字
        } else if (isalpha(*p) || *p == '_') {
            char* v = t->value;
            while (isalnum(*p) || *p == '_') *v++ = *p++;
            *v = '\0';
            t->type = T_ID; // 預設為識別碼
            for (int i = 0; i < KW_NONE; i++) { // 檢查是否為關鍵字
                if (strcmp(t->value, keyword_map[i]) == 0) {
                    t->type = T_KEYWORD;
                    break;
                }
            }
        } else { p++; continue; } // 忽略未知字元
        lex->token_count++;
        if (lex->token_count >= MAX_TOKENS) ERROR("Too many tokens");
    }
    lex->tokens[lex->token_count].type = T_EOF; // 在結尾加上 EOF 標記
}

// 初始化詞法分析器：讀取檔案、移除註解、進行詞法分析
void lex_init(Lex* lex, const char* filepath) {
    FILE* file = fopen(filepath, "r");
    if (!file) ERROR("Could not open file");
    fseek(file, 0, SEEK_END);
    long fsize = ftell(file);
    fseek(file, 0, SEEK_SET);
    char* source = (char*)malloc(fsize + 1);
    if (!source) ERROR("Memory allocation failed");
    fread(source, 1, fsize, file);
    fclose(file);
    source[fsize] = 0;
    char* source_no_comments = remove_comments(source);
    lex_tokenize(lex, source_no_comments);
    free(source);
    free(source_no_comments);
    lex->current_token_index = 0;
}

// 向前推進一個 Token，並回傳它
Token* lex_advance(Lex* lex) {
    if (lex->current_token_index < lex->token_count) {
        return &lex->tokens[lex->current_token_index++];
    }
    return &lex->tokens[lex->token_count]; // 持續回傳 EOF
}

// 查看下一個 Token，但不推進
Token* lex_peek(Lex* lex) {
    if (lex->current_token_index < lex->token_count) {
        return &lex->tokens[lex->current_token_index];
    }
    return &lex->tokens[lex->token_count];
}

//----------------------------------------------------------------------
// 6. 符號表 (Symbol Table) 實作
//----------------------------------------------------------------------
// 初始化符號表
void symbol_table_init(SymbolTable* st) {
    st->class_symbol_count = 0;
    st->subroutine_symbol_count = 0;
    st->index_static = 0;
    st->index_field = 0;
    symbol_table_start_subroutine(st);
}

// 開始一個新的子程式時，清空子程式範圍的符號表
void symbol_table_start_subroutine(SymbolTable* st) {
    st->subroutine_symbol_count = 0;
    st->index_arg = 0;
    st->index_var = 0;
}

// 在符號表中定義一個新的識別碼
void symbol_table_define(SymbolTable* st, const char* name, const char* type, SymbolKind kind) {
    Symbol* table;
    int* count;
    int* index;
    // 根據 kind 決定要存入哪個表格 (class 或 subroutine)
    if (kind == SK_STATIC || kind == SK_FIELD) {
        table = st->class_symbols;
        count = &st->class_symbol_count;
        index = (kind == SK_STATIC) ? &st->index_static : &st->index_field;
    } else {
        table = st->subroutine_symbols;
        count = &st->subroutine_symbol_count;
        index = (kind == SK_ARG) ? &st->index_arg : &st->index_var;
    }
    if (*count >= MAX_SYMBOLS) ERROR("Symbol table overflow");
    Symbol* s = &table[*count];
    strncpy(s->name, name, MAX_TOKEN_LENGTH - 1);
    s->name[MAX_TOKEN_LENGTH - 1] = '\0';
    strncpy(s->type, type, MAX_TOKEN_LENGTH - 1);
    s->type[MAX_TOKEN_LENGTH - 1] = '\0';
    s->kind = kind;
    s->index = (*index)++;
    (*count)++;
}

// 計算指定種類的變數數量
int symbol_table_var_count(SymbolTable* st, SymbolKind kind) {
    int count = 0;
    Symbol* table = (kind == SK_STATIC || kind == SK_FIELD) ? st->class_symbols : st->subroutine_symbols;
    int table_size = (kind == SK_STATIC || kind == SK_FIELD) ? st->class_symbol_count : st->subroutine_symbol_count;
    for (int i = 0; i < table_size; i++) {
        if (table[i].kind == kind) count++;
    }
    return count;
}

// 查詢一個識別碼的資訊。先查子程式範圍，再查類別範圍。
Symbol* symbol_table_lookup(SymbolTable* st, const char* name) {
    for (int i = 0; i < st->subroutine_symbol_count; i++) {
        if (strcmp(st->subroutine_symbols[i].name, name) == 0) return &st->subroutine_symbols[i];
    }
    for (int i = 0; i < st->class_symbol_count; i++) {
        if (strcmp(st->class_symbols[i].name, name) == 0) return &st->class_symbols[i];
    }
    return NULL; // 找不到
}

//----------------------------------------------------------------------
// 7. VM 寫入器 (VM Writer) 實作
//----------------------------------------------------------------------
// 初始化 VM 寫入器，建立 .vm 輸出檔案
void vm_writer_init(VMWriter* vm, const char* jack_filepath) {
    char vm_filepath[MAX_PATH_LENGTH], out_dir[MAX_PATH_LENGTH];
    // 建立 output/ 目錄
    const char* last_slash = strrchr(jack_filepath, '/');
    if (last_slash) {
        strncpy(out_dir, jack_filepath, last_slash - jack_filepath);
        out_dir[last_slash - jack_filepath] = '\0';
        strcat(out_dir, "/output");
    } else {
        strcpy(out_dir, "output");
    }
    mkdir(out_dir, 0755);
    // 產生輸出檔案路徑 (例如: Source.jack -> output/Source.vm)
    const char* filename = last_slash ? last_slash + 1 : jack_filepath;
    const char* dot = strrchr(filename, '.');
    if (!dot) ERROR("Invalid input file name");
    snprintf(vm_filepath, sizeof(vm_filepath), "%s/%.*s.vm", out_dir, (int)(dot - filename), filename);
    vm->outfile = fopen(vm_filepath, "w");
    if (!vm->outfile) ERROR("Could not create output VM file");
}

// 關閉檔案
void vm_writer_close(VMWriter* vm) { if (vm->outfile) fclose(vm->outfile); }
// 產生各種 VM 指令
void vm_writer_write_push(VMWriter* vm, const char* segment, int index) { fprintf(vm->outfile, "push %s %d\n", segment, index); }
void vm_writer_write_pop(VMWriter* vm, const char* segment, int index) { fprintf(vm->outfile, "pop %s %d\n", segment, index); }
void vm_writer_write_arithmetic(VMWriter* vm, const char* command) { fprintf(vm->outfile, "%s\n", command); }
void vm_writer_write_label(VMWriter* vm, const char* label) { fprintf(vm->outfile, "label %s\n", label); }
void vm_writer_write_goto(VMWriter* vm, const char* label) { fprintf(vm->outfile, "goto %s\n", label); }
void vm_writer_write_if(VMWriter* vm, const char* label) { fprintf(vm->outfile, "if-goto %s\n", label); }
void vm_writer_write_call(VMWriter* vm, const char* name, int n_args) { fprintf(vm->outfile, "call %s %d\n", name, n_args); }
void vm_writer_write_function(VMWriter* vm, const char* name, int n_locals) { fprintf(vm->outfile, "function %s %d\n", name, n_locals); }
void vm_writer_write_return(VMWriter* vm) { fprintf(vm->outfile, "return\n"); }

//----------------------------------------------------------------------
// 8. 解析器 (Parser) 實作
//----------------------------------------------------------------------
// 要求下一個 Token 必須是指定的類型和值，否則報錯
Token* parser_require_token(Parser* p, TokenType type, const char* value) {
    Token* t = lex_advance(p->lex);
    if (t->type != type || (value && strcmp(t->value, value) != 0)) {
        char err_msg[256];
        snprintf(err_msg, sizeof(err_msg), "Expected '%s', but got '%s'", value ? value : "token", t->value);
        ERROR(err_msg);
    }
    return t;
}

// --- 以下為解析器的輔助判斷函式 ---
int is_token(Parser* p, TokenType type, const char* value) { Token* t = lex_peek(p->lex); return t->type == type && (!value || strcmp(t->value, value) == 0); }
int is_keyword(Parser* p, const char* kw) { return is_token(p, T_KEYWORD, kw); }
int is_any_keyword(Parser* p, int count, ...) {
    va_list args;
    va_start(args, count);
    for (int i=0; i<count; ++i) { if(is_keyword(p, va_arg(args, const char*))) { va_end(args); return 1; } }
    va_end(args);
    return 0;
}
int is_sym(Parser* p, char c) { char s[2] = {c, '\0'}; return is_token(p, T_SYM, s); }
int is_any_sym(Parser* p, const char* syms) { Token* t = lex_peek(p->lex); return t->type == T_SYM && strchr(syms, t->value[0]); }
int is_type(Parser* p) { return is_token(p, T_ID, NULL) || is_any_keyword(p, 3, "int", "char", "boolean"); }

// --- VM 產生輔助函式 ---
// 產生 push 指令來將變數值推入堆疊
void vm_push_variable(Parser* p, const char* name) {
    Symbol* s = symbol_table_lookup(p->symbols, name);
    if (!s) { char err[256]; snprintf(err, sizeof(err), "Undefined variable: %s", name); ERROR(err); }
    vm_writer_write_push(p->vm, symbol_kind_map[s->kind], s->index);
}
// 產生 pop 指令來將堆疊頂端的值存入變數
void vm_pop_variable(Parser* p, const char* name) {
    Symbol* s = symbol_table_lookup(p->symbols, name);
    if (!s) { char err[256]; snprintf(err, sizeof(err), "Undefined variable: %s", name); ERROR(err); }
    vm_writer_write_pop(p->vm, symbol_kind_map[s->kind], s->index);
}

/**
 * @brief 編譯一個 term (項)。term 是 expression 的最小組成單位。
 * @BNF term: integerConstant | stringConstant | keywordConstant |
 *            varName | varName '[' expression ']' | subroutineCall |
 *            '(' expression ')' | unaryOp term
 */
void compile_term(Parser* p) {
    Token* t = lex_peek(p->lex);
    // 數字常數
    if (t->type == T_NUM) {
        vm_writer_write_push(p->vm, "constant", t->int_val);
        lex_advance(p->lex);
    // 字串常數
    } else if (t->type == T_STR) {
        int len = strlen(t->value);
        vm_writer_write_push(p->vm, "constant", len);
        vm_writer_write_call(p->vm, "String.new", 1);
        for(int i = 0; i < len; i++) {
            vm_writer_write_push(p->vm, "constant", (int)t->value[i]);
            vm_writer_write_call(p->vm, "String.appendChar", 2);
        }
        lex_advance(p->lex);
    // 關鍵字常數 (true, false, null, this)
    } else if (t->type == T_KEYWORD) {
        if (strcmp(t->value, "true") == 0) { vm_writer_write_push(p->vm, "constant", 0); vm_writer_write_arithmetic(p->vm, "not"); }
        else if (strcmp(t->value, "false") == 0 || strcmp(t->value, "null") == 0) { vm_writer_write_push(p->vm, "constant", 0); }
        else if (strcmp(t->value, "this") == 0) { vm_writer_write_push(p->vm, "pointer", 0); }
        lex_advance(p->lex);
    // 括號內的表達式
    } else if (is_sym(p, '(')) {
        lex_advance(p->lex);
        compile_expression(p);
        parser_require_token(p, T_SYM, ")");
    // 一元運算子
    } else if (is_any_sym(p, "-~")) {
        char op = t->value[0];
        lex_advance(p->lex);
        compile_term(p); // 遞迴呼叫 compile_term 來處理後面的項
        if (op == '-') vm_writer_write_arithmetic(p->vm, "neg");
        else vm_writer_write_arithmetic(p->vm, "not");
    // 識別碼開頭的情況，可能是變數、陣列存取或函式呼叫
    } else if (t->type == T_ID) {
        char name[MAX_TOKEN_LENGTH];
        strncpy(name, t->value, sizeof(name) - 1); name[sizeof(name) - 1] = '\0';
        lex_advance(p->lex);
        // 陣列存取: varName '[' expression ']'
        if (is_sym(p, '[')) {
            vm_push_variable(p, name); // push 陣列基底位址
            lex_advance(p->lex);
            compile_expression(p);     // push 索引
            parser_require_token(p, T_SYM, "]");
            vm_writer_write_arithmetic(p->vm, "add"); // 計算 address = base + index
            vm_writer_write_pop(p->vm, "pointer", 1); // 將 address 存入 THAT
            vm_writer_write_push(p->vm, "that", 0);   // 將 *(address) 的值 push 到堆疊
        // 函式呼叫: subroutineCall
        } else if (is_sym(p, '(') || is_sym(p, '.')) {
            char func_name[MAX_TOKEN_LENGTH * 2 + 2];
            int n_args = 0;
            // 處理 'className.subroutineName' 或 'varName.methodName'
            if (is_sym(p, '.')) {
                lex_advance(p->lex);
                Token* sub_name = parser_require_token(p, T_ID, NULL);
                Symbol* s = symbol_table_lookup(p->symbols, name);
                if (s) { // 是物件方法呼叫: varName.methodName
                    vm_push_variable(p, name); // push 物件 'this'
                    snprintf(func_name, sizeof(func_name), "%s.%s", s->type, sub_name->value);
                    n_args = 1; // 方法呼叫會隱含傳入 'this'
                } else { // 是靜態函式呼叫: ClassName.subroutineName
                    snprintf(func_name, sizeof(func_name), "%s.%s", name, sub_name->value);
                }
            // 處理 'subroutineName(...)'，這是對目前物件的方法呼叫
            } else {
                vm_writer_write_push(p->vm, "pointer", 0); // push 'this'
                snprintf(func_name, sizeof(func_name), "%s.%s", p->current_class, name);
                n_args = 1;
            }
            parser_require_token(p, T_SYM, "(");
            n_args += compile_expression_list(p); // 編譯引數列表
            parser_require_token(p, T_SYM, ")");
            vm_writer_write_call(p->vm, func_name, n_args);
        // 單純的變數
        } else {
            vm_push_variable(p, name);
        }
    } else { ERROR("Invalid term"); }
}

/**
 * @brief 編譯一個 expression (表達式)。
 * @BNF expression: term (op term)*
 */
void compile_expression(Parser* p) {
    compile_term(p);
    // 迴圈處理 (op term)* 的部分
    while (is_any_sym(p, "+-*/&|<>=.")) {
        Token* op = lex_advance(p->lex);
        compile_term(p);
        // 根據運算子產生對應的 VM 指令
        switch(op->value[0]) {
            case '+': vm_writer_write_arithmetic(p->vm, "add"); break;
            case '-': vm_writer_write_arithmetic(p->vm, "sub"); break;
            case '*': vm_writer_write_call(p->vm, "Math.multiply", 2); break;
            case '/': vm_writer_write_call(p->vm, "Math.divide", 2); break;
            case '&': vm_writer_write_arithmetic(p->vm, "and"); break;
            case '|': vm_writer_write_arithmetic(p->vm, "or"); break;
            case '<': vm_writer_write_arithmetic(p->vm, "lt"); break;
            case '>': vm_writer_write_arithmetic(p->vm, "gt"); break;
            case '=': vm_writer_write_arithmetic(p->vm, "eq"); break;
        }
    }
}

/**
 * @brief 編譯一個 expressionList (表達式列表)。
 * @BNF expressionList: (expression (',' expression)*)?
 * @return 回傳表達式的數量 (即函式引數的數量)
 */
int compile_expression_list(Parser* p) {
    int count = 0;
    if (!is_sym(p, ')')) { // 如果列表不是空的
        compile_expression(p);
        count = 1;
        while (is_sym(p, ',')) {
            lex_advance(p->lex);
            compile_expression(p);
            count++;
        }
    }
    return count;
}

/**
 * @brief 編譯 return 陳述句。
 * @BNF returnStatement: 'return' expression? ';'
 */
void compile_return(Parser* p) {
    lex_advance(p->lex); // 'return'
    if (!is_sym(p, ';')) {
        compile_expression(p); // 有回傳值
    } else {
        vm_writer_write_push(p->vm, "constant", 0); // void 函式, 依慣例回傳 0
    }
    parser_require_token(p, T_SYM, ";");
    vm_writer_write_return(p->vm);
}

/**
 * @brief 編譯 do 陳述句。
 * @BNF doStatement: 'do' subroutineCall ';'
 */
void compile_do(Parser* p) {
    lex_advance(p->lex); // 'do'
    compile_term(p);     // subroutineCall 的語法結構和 term 裡的一部分相同
    vm_writer_write_pop(p->vm, "temp", TEMP_RETURN); // 丟棄回傳值
    parser_require_token(p, T_SYM, ";");
}

/**
 * @brief 編譯 let 陳述句 (賦值)。
 * @BNF letStatement: 'let' varName ('[' expression ']')? '=' expression ';'
 */
void compile_let(Parser* p) {
    lex_advance(p->lex); // 'let'
    Token* var_name = parser_require_token(p, T_ID, NULL);
    int is_array = 0;
    // 處理陣列賦值
    if (is_sym(p, '[')) {
        is_array = 1;
        vm_push_variable(p, var_name->value); // push 陣列基底位址
        lex_advance(p->lex);
        compile_expression(p); // push 索引
        parser_require_token(p, T_SYM, "]");
        vm_writer_write_arithmetic(p->vm, "add"); // 計算目標位址
    }
    parser_require_token(p, T_SYM, "=");
    compile_expression(p); // 計算右側表達式的值
    parser_require_token(p, T_SYM, ";");

    if (is_array) {
        vm_writer_write_pop(p->vm, "temp", TEMP_ARRAY);  // 將值暫存
        vm_writer_write_pop(p->vm, "pointer", 1);      // 將目標位址存入 THAT
        vm_writer_write_push(p->vm, "temp", TEMP_ARRAY);  // 將值放回堆疊
        vm_writer_write_pop(p->vm, "that", 0);          // 將值存入 *(THAT)
    } else {
        vm_pop_variable(p, var_name->value); // 直接存入變數
    }
}

/**
 * @brief 編譯 while 陳述句。
 * @BNF whileStatement: 'while' '(' expression ')' '{' statements '}'
 */
void compile_while(Parser* p) {
    char label_top[32], label_end[32];
    snprintf(label_top, sizeof(label_top), "WHILE_EXP%d", p->label_counter++);
    snprintf(label_end, sizeof(label_end), "WHILE_END%d", p->label_counter++);

    vm_writer_write_label(p->vm, label_top); // 迴圈開始的標籤
    lex_advance(p->lex); // 'while'
    parser_require_token(p, T_SYM, "(");
    compile_expression(p); // 計算條件
    parser_require_token(p, T_SYM, ")");
    vm_writer_write_arithmetic(p->vm, "not"); // 如果條件為 false (not true), 則跳出
    vm_writer_write_if(p->vm, label_end);

    parser_require_token(p, T_SYM, "{");
    compile_statements(p); // 編譯迴圈主體
    parser_require_token(p, T_SYM, "}");
    vm_writer_write_goto(p->vm, label_top); // 跳回迴圈開始處
    vm_writer_write_label(p->vm, label_end); // 迴圈結束的標籤
}

/**
 * @brief 編譯 if 陳述句。
 * @BNF ifStatement: 'if' '(' expression ')' '{' statements '}' ('else' '{' statements '}')?
 */
void compile_if(Parser* p) {
    char label_else[32], label_end[32];
    snprintf(label_else, sizeof(label_else), "IF_FALSE%d", p->label_counter++);
    snprintf(label_end, sizeof(label_end), "IF_END%d", p->label_counter++);

    lex_advance(p->lex); // 'if'
    parser_require_token(p, T_SYM, "(");
    compile_expression(p); // 計算條件
    parser_require_token(p, T_SYM, ")");
    vm_writer_write_arithmetic(p->vm, "not"); // 如果條件為 false, 則跳到 else 區塊
    vm_writer_write_if(p->vm, label_else);

    // if 為 true 時執行的區塊
    parser_require_token(p, T_SYM, "{");
    compile_statements(p);
    parser_require_token(p, T_SYM, "}");
    
    int has_else = is_keyword(p, "else");
    if (has_else) vm_writer_write_goto(p->vm, label_end); // 執行完 true 區塊後跳到結尾

    vm_writer_write_label(p->vm, label_else); // else 區塊或 if 結束的標籤

    if (has_else) {
        lex_advance(p->lex); // 'else'
        parser_require_token(p, T_SYM, "{");
        compile_statements(p);
        parser_require_token(p, T_SYM, "}");
        vm_writer_write_label(p->vm, label_end); // 結尾標籤
    }
}

/**
 * @brief 編譯一系列的 statements。
 * @BNF statements: statement*
 */
void compile_statements(Parser* p) {
    while (1) {
        Token* t = lex_peek(p->lex);
        if (t->type != T_KEYWORD) break;
        if (strcmp(t->value, "let") == 0) compile_let(p);
        else if (strcmp(t->value, "if") == 0) compile_if(p);
        else if (strcmp(t->value, "while") == 0) compile_while(p);
        else if (strcmp(t->value, "do") == 0) compile_do(p);
        else if (strcmp(t->value, "return") == 0) compile_return(p);
        else break; // 如果不是陳述句開頭的關鍵字，則結束
    }
}

/**
 * @brief 編譯 'var' 變數宣告。
 * @BNF varDec: 'var' type varName (',' varName)* ';'
 */
void compile_var_dec(Parser* p) {
    lex_advance(p->lex); // 'var'
    Token* type = lex_advance(p->lex); // 變數類型
    // 使用 do-while 處理 (',' varName)* 的部分
    do {
        Token* name = parser_require_token(p, T_ID, NULL);
        symbol_table_define(p->symbols, name->value, type->value, SK_VAR);
    } while (is_sym(p, ',') && (lex_advance(p->lex), 1)); // 緊湊的寫法
    parser_require_token(p, T_SYM, ";");
}

/**
 * @brief 編譯參數列表。
 * @BNF parameterList: ((type varName) (',' type varName)*)?
 */
void compile_parameter_list(Parser* p) {
    if (is_type(p)) { // 如果列表不是空的
        do {
            Token* type = lex_advance(p->lex);
            Token* name = parser_require_token(p, T_ID, NULL);
            symbol_table_define(p->symbols, name->value, type->value, SK_ARG);
        } while (is_sym(p, ',') && (lex_advance(p->lex), 1));
    }
}

/**
 * @brief 編譯一個完整的子程式 (method, function, constructor)。
 * @BNF subroutineDec: ('constructor'|'function'|'method') ('void'|type) 
 *                    subroutineName '(' parameterList ')' subroutineBody
 */
void compile_subroutine(Parser* p) {
    Token* kind = lex_advance(p->lex); // constructor, function, or method
    lex_advance(p->lex); // 回傳類型 (void 或 type)
    Token* name = parser_require_token(p, T_ID, NULL);
    strncpy(p->current_subroutine, name->value, sizeof(p->current_subroutine) - 1);
    p->current_subroutine[sizeof(p->current_subroutine) - 1] = '\0';

    symbol_table_start_subroutine(p->symbols); // 開始新的子程式作用域
    // method 的第一個引數總是 'this'
    if (strcmp(kind->value, "method") == 0) {
        symbol_table_define(p->symbols, "this", p->current_class, SK_ARG);
    }

    parser_require_token(p, T_SYM, "(");
    compile_parameter_list(p);
    parser_require_token(p, T_SYM, ")");

    // --- Subroutine Body ---
    // BNF: '{' varDec* statements '}'
    parser_require_token(p, T_SYM, "{");
    while (is_keyword(p, "var")) {
        compile_var_dec(p);
    }

    // 產生 function 指令
    char func_name[MAX_TOKEN_LENGTH * 2 + 2];
    snprintf(func_name, sizeof(func_name), "%s.%s", p->current_class, p->current_subroutine);
    int n_locals = symbol_table_var_count(p->symbols, SK_VAR);
    vm_writer_write_function(p->vm, func_name, n_locals);

    // constructor 和 method 需要額外處理 'this' 指標
    if (strcmp(kind->value, "constructor") == 0) {
        int n_fields = symbol_table_var_count(p->symbols, SK_FIELD);
        vm_writer_write_push(p->vm, "constant", n_fields);
        vm_writer_write_call(p->vm, "Memory.alloc", 1); // 配置記憶體
        vm_writer_write_pop(p->vm, "pointer", 0);      // 將 this 指向新配置的物件
    } else if (strcmp(kind->value, "method") == 0) {
        vm_writer_write_push(p->vm, "argument", 0);    // method 的第一個引數是 this
        vm_writer_write_pop(p->vm, "pointer", 0);      // 設定 this 指標
    }
    
    compile_statements(p); // 編譯函式主體
    parser_require_token(p, T_SYM, "}");
}

/**
 * @brief 編譯類別級別的變數宣告 (static, field)。
 * @BNF classVarDec: ('static' | 'field') type varName (',' varName)* ';'
 */
void compile_class_var_dec(Parser* p) {
    Token* kind_tok = lex_advance(p->lex); // static or field
    SymbolKind kind = (strcmp(kind_tok->value, "static") == 0) ? SK_STATIC : SK_FIELD;
    Token* type = lex_advance(p->lex); // 類型
    do {
        Token* name = parser_require_token(p, T_ID, NULL);
        symbol_table_define(p->symbols, name->value, type->value, kind);
    } while (is_sym(p, ',') && (lex_advance(p->lex), 1));
    parser_require_token(p, T_SYM, ";");
}

/**
 * @brief 編譯一個完整的 class。這是編譯的入口點。
 * @BNF class: 'class' className '{' classVarDec* subroutineDec* '}'
 */
void compile_class(Parser* p) {
    parser_require_token(p, T_KEYWORD, "class");
    Token* class_name = parser_require_token(p, T_ID, NULL);
    strncpy(p->current_class, class_name->value, sizeof(p->current_class) - 1);
    p->current_class[sizeof(p->current_class) - 1] = '\0';
    parser_require_token(p, T_SYM, "{");
    // 處理 classVarDec*
    while (is_any_keyword(p, 2, "static", "field")) {
        compile_class_var_dec(p);
    }
    // 處理 subroutineDec*
    while (is_any_keyword(p, 3, "constructor", "function", "method")) {
        compile_subroutine(p);
    }
    parser_require_token(p, T_SYM, "}");
}

// 初始化 Parser，並啟動編譯過程
void parser_init(Parser* parser, const char* filepath) {
    parser->lex = (Lex*)malloc(sizeof(Lex));
    parser->symbols = (SymbolTable*)malloc(sizeof(SymbolTable));
    parser->vm = (VMWriter*)malloc(sizeof(VMWriter));
    if (!parser->lex || !parser->symbols || !parser->vm) ERROR("Memory allocation failed");
    
    lex_init(parser->lex, filepath);
    symbol_table_init(parser->symbols);
    vm_writer_init(parser->vm, filepath);
    parser->label_counter = 0;
    
    // 直接呼叫起始的編譯函式
    compile_class(parser);
}

// 釋放 Parser 所佔用的資源
void parser_destroy(Parser* parser) {
    vm_writer_close(parser->vm);
    free(parser->lex);
    free(parser->symbols);
    free(parser->vm);
}

//----------------------------------------------------------------------
// 9. 主程式 (Compiler) 實作
//----------------------------------------------------------------------
// 分析單一 .jack 檔案
void analyze_file(const char* filepath) {
    printf("Analyzing %s\n", filepath);
    Parser p;
    parser_init(&p, filepath);
    parser_destroy(&p);
}

// 分析一個目錄下的所有 .jack 檔案
void analyze_directory(const char* dirpath) {
    DIR* d = opendir(dirpath);
    if (!d) ERROR("Could not open directory");
    struct dirent* dir;
    while ((dir = readdir(d)) != NULL) {
        if (strstr(dir->d_name, ".jack")) {
            char filepath[MAX_PATH_LENGTH];
            snprintf(filepath, sizeof(filepath), "%s/%s", dirpath, dir->d_name);
            analyze_file(filepath);
        }
    }
    closedir(d);
}

int main(int argc, char* argv[]) {
    if (argc != 2) {
        printf("Usage: %s [file.jack|directory]\n", argv[0]);
        return 1;
    }
    const char* path = argv[1];
    struct stat path_stat;
    stat(path, &path_stat);

    if (S_ISDIR(path_stat.st_mode)) {
        analyze_directory(path);
    } else {
        if (strstr(path, ".jack")) {
            analyze_file(path);
        } else {
            ERROR("Input must be a .jack file or a directory");
        }
    }
    
    printf("Compilation finished.\n");
    return 0;
}