#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <dirent.h>
#include <sys/stat.h>
#include <stdarg.h> // For va_list

#define MAX_LINE_LENGTH 1024
#define MAX_TOKEN_LENGTH 256
#define MAX_TOKENS 32768
#define MAX_SYMBOLS 256
#define MAX_PATH_LENGTH 1024

//----------------------------------------------------------------------
// 1. 常數定義
//----------------------------------------------------------------------

// Token 類型
typedef enum {
    T_KEYWORD, T_SYM, T_NUM, T_STR, T_ID, T_EOF, T_ERROR
} TokenType;

// 關鍵字
typedef enum {
    KW_CLASS, KW_METHOD, KW_FUNCTION, KW_CONSTRUCTOR, KW_INT, KW_BOOLEAN,
    KW_CHAR, KW_VOID, KW_VAR, KW_STATIC, KW_FIELD, KW_LET, KW_DO, KW_IF,
    KW_ELSE, KW_WHILE, KW_RETURN, KW_TRUE, KW_FALSE, KW_NULL, KW_THIS,
    KW_NONE
} Keyword;

const char* keyword_map[] = {
    "class", "method", "function", "constructor", "int", "boolean",
    "char", "void", "var", "static", "field", "let", "do", "if",
    "else", "while", "return", "true", "false", "null", "this"
};

// 符號種類
typedef enum {
    SK_STATIC, SK_FIELD, SK_ARG, SK_VAR, SK_NONE
} SymbolKind;

const char* symbol_kind_map[] = {"static", "this", "argument", "local"};

#define TEMP_RETURN 0
#define TEMP_ARRAY 1

//----------------------------------------------------------------------
// 2. 結構體定義
//----------------------------------------------------------------------

typedef struct {
    TokenType type;
    char value[MAX_TOKEN_LENGTH];
    int int_val;
} Token;

typedef struct {
    Token tokens[MAX_TOKENS];
    int token_count;
    int current_token_index;
} Lex;

typedef struct {
    char name[MAX_TOKEN_LENGTH];
    char type[MAX_TOKEN_LENGTH];
    SymbolKind kind;
    int index;
} Symbol;

typedef struct {
    Symbol class_symbols[MAX_SYMBOLS];
    int class_symbol_count;
    Symbol subroutine_symbols[MAX_SYMBOLS];
    int subroutine_symbol_count;
    int index_static, index_field, index_arg, index_var;
} SymbolTable;

typedef struct {
    FILE* outfile;
} VMWriter;

// --- Parser ---
// 結構中不再包含函數指標
typedef struct {
    Lex* lex;
    SymbolTable* symbols;
    VMWriter* vm;
    char current_class[MAX_TOKEN_LENGTH];
    char current_subroutine[MAX_TOKEN_LENGTH];
    int label_counter;
} Parser;


//----------------------------------------------------------------------
// 3. 函數原型宣告
//----------------------------------------------------------------------

// --- Error Handling ---
void report_error(const char* message, const char* file, int line);
#define ERROR(msg) report_error(msg, __FILE__, __LINE__)

// --- Lexer ---
void lex_init(Lex* lex, const char* filepath);
Token* lex_advance(Lex* lex);
Token* lex_peek(Lex* lex);

// --- Symbol Table ---
void symbol_table_init(SymbolTable* st);
void symbol_table_start_subroutine(SymbolTable* st);
void symbol_table_define(SymbolTable* st, const char* name, const char* type, SymbolKind kind);
int symbol_table_var_count(SymbolTable* st, SymbolKind kind);
Symbol* symbol_table_lookup(SymbolTable* st, const char* name);

// --- VM Writer ---
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

// --- Parser Helper and Compilation Functions (Prototypes) ---
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

// --- Compiler (Main) ---
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

void lex_tokenize(Lex* lex, char* source_no_comments) {
    const char* symbols = "{}()[].,;+-*/&|<>=~";
    char* p = source_no_comments;
    lex->token_count = 0;
    while (*p) {
        if (isspace(*p)) { p++; continue; }
        Token* t = &lex->tokens[lex->token_count];
        if (strchr(symbols, *p)) {
            t->type = T_SYM;
            t->value[0] = *p; t->value[1] = '\0';
            p++;
        } else if (*p == '"') {
            t->type = T_STR;
            p++;
            char* v = t->value;
            while (*p && *p != '"') *v++ = *p++;
            *v = '\0';
            if (*p == '"') p++;
        } else if (isdigit(*p)) {
            t->type = T_NUM;
            char* v = t->value;
            while (isdigit(*p)) *v++ = *p++;
            *v = '\0';
            t->int_val = atoi(t->value);
        } else if (isalpha(*p) || *p == '_') {
            char* v = t->value;
            while (isalnum(*p) || *p == '_') *v++ = *p++;
            *v = '\0';
            t->type = T_ID;
            for (int i = 0; i < KW_NONE; i++) {
                if (strcmp(t->value, keyword_map[i]) == 0) {
                    t->type = T_KEYWORD;
                    break;
                }
            }
        } else { p++; continue; }
        lex->token_count++;
        if (lex->token_count >= MAX_TOKENS) ERROR("Too many tokens");
    }
    lex->tokens[lex->token_count].type = T_EOF;
}

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

Token* lex_advance(Lex* lex) {
    if (lex->current_token_index < lex->token_count) {
        return &lex->tokens[lex->current_token_index++];
    }
    return &lex->tokens[lex->token_count];
}

Token* lex_peek(Lex* lex) {
    if (lex->current_token_index < lex->token_count) {
        return &lex->tokens[lex->current_token_index];
    }
    return &lex->tokens[lex->token_count];
}

//----------------------------------------------------------------------
// 6. 符號表 (Symbol Table) 實作
//----------------------------------------------------------------------
void symbol_table_init(SymbolTable* st) {
    st->class_symbol_count = 0;
    st->subroutine_symbol_count = 0;
    st->index_static = 0;
    st->index_field = 0;
    symbol_table_start_subroutine(st);
}

void symbol_table_start_subroutine(SymbolTable* st) {
    st->subroutine_symbol_count = 0;
    st->index_arg = 0;
    st->index_var = 0;
}

void symbol_table_define(SymbolTable* st, const char* name, const char* type, SymbolKind kind) {
    Symbol* table;
    int* count;
    int* index;
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

int symbol_table_var_count(SymbolTable* st, SymbolKind kind) {
    int count = 0;
    Symbol* table = (kind == SK_STATIC || kind == SK_FIELD) ? st->class_symbols : st->subroutine_symbols;
    int table_size = (kind == SK_STATIC || kind == SK_FIELD) ? st->class_symbol_count : st->subroutine_symbol_count;
    for (int i = 0; i < table_size; i++) {
        if (table[i].kind == kind) count++;
    }
    return count;
}

Symbol* symbol_table_lookup(SymbolTable* st, const char* name) {
    for (int i = 0; i < st->subroutine_symbol_count; i++) {
        if (strcmp(st->subroutine_symbols[i].name, name) == 0) return &st->subroutine_symbols[i];
    }
    for (int i = 0; i < st->class_symbol_count; i++) {
        if (strcmp(st->class_symbols[i].name, name) == 0) return &st->class_symbols[i];
    }
    return NULL;
}

//----------------------------------------------------------------------
// 7. VM 寫入器 (VM Writer) 實作
//----------------------------------------------------------------------
void vm_writer_init(VMWriter* vm, const char* jack_filepath) {
    char vm_filepath[MAX_PATH_LENGTH], out_dir[MAX_PATH_LENGTH];
    const char* last_slash = strrchr(jack_filepath, '/');
    if (last_slash) {
        strncpy(out_dir, jack_filepath, last_slash - jack_filepath);
        out_dir[last_slash - jack_filepath] = '\0';
        strcat(out_dir, "/output");
    } else {
        strcpy(out_dir, "output");
    }
    mkdir(out_dir, 0755);
    const char* filename = last_slash ? last_slash + 1 : jack_filepath;
    const char* dot = strrchr(filename, '.');
    if (!dot) ERROR("Invalid input file name");
    snprintf(vm_filepath, sizeof(vm_filepath), "%s/%.*s.vm", out_dir, (int)(dot - filename), filename);
    vm->outfile = fopen(vm_filepath, "w");
    if (!vm->outfile) ERROR("Could not create output VM file");
}

void vm_writer_close(VMWriter* vm) { if (vm->outfile) fclose(vm->outfile); }
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
Token* parser_require_token(Parser* p, TokenType type, const char* value) {
    Token* t = lex_advance(p->lex);
    if (t->type != type || (value && strcmp(t->value, value) != 0)) {
        char err_msg[256];
        snprintf(err_msg, sizeof(err_msg), "Expected '%s', but got '%s'", value ? value : "token", t->value);
        ERROR(err_msg);
    }
    return t;
}

int is_token(Parser* p, TokenType type, const char* value) {
    Token* t = lex_peek(p->lex);
    return t->type == type && (!value || strcmp(t->value, value) == 0);
}

int is_keyword(Parser* p, const char* kw) { return is_token(p, T_KEYWORD, kw); }
int is_any_keyword(Parser* p, int count, ...) {
    va_list args;
    va_start(args, count);
    for (int i=0; i<count; ++i) {
        if(is_keyword(p, va_arg(args, const char*))) { va_end(args); return 1; }
    }
    va_end(args);
    return 0;
}
int is_sym(Parser* p, char c) { char s[2] = {c, '\0'}; return is_token(p, T_SYM, s); }
int is_any_sym(Parser* p, const char* syms) { Token* t = lex_peek(p->lex); return t->type == T_SYM && strchr(syms, t->value[0]); }
int is_type(Parser* p) { return is_token(p, T_ID, NULL) || is_any_keyword(p, 3, "int", "char", "boolean"); }

void vm_push_variable(Parser* p, const char* name) {
    Symbol* s = symbol_table_lookup(p->symbols, name);
    if (!s) { char err[256]; snprintf(err, sizeof(err), "Undefined variable: %s", name); ERROR(err); }
    vm_writer_write_push(p->vm, symbol_kind_map[s->kind], s->index);
}
void vm_pop_variable(Parser* p, const char* name) {
    Symbol* s = symbol_table_lookup(p->symbols, name);
    if (!s) { char err[256]; snprintf(err, sizeof(err), "Undefined variable: %s", name); ERROR(err); }
    vm_writer_write_pop(p->vm, symbol_kind_map[s->kind], s->index);
}

void compile_term(Parser* p) {
    Token* t = lex_peek(p->lex);
    if (t->type == T_NUM) {
        vm_writer_write_push(p->vm, "constant", t->int_val);
        lex_advance(p->lex);
    } else if (t->type == T_STR) {
        int len = strlen(t->value);
        vm_writer_write_push(p->vm, "constant", len);
        vm_writer_write_call(p->vm, "String.new", 1);
        for(int i = 0; i < len; i++) {
            vm_writer_write_push(p->vm, "constant", (int)t->value[i]);
            vm_writer_write_call(p->vm, "String.appendChar", 2);
        }
        lex_advance(p->lex);
    } else if (t->type == T_KEYWORD) {
        if (strcmp(t->value, "true") == 0) { vm_writer_write_push(p->vm, "constant", 0); vm_writer_write_arithmetic(p->vm, "not"); }
        else if (strcmp(t->value, "false") == 0 || strcmp(t->value, "null") == 0) { vm_writer_write_push(p->vm, "constant", 0); }
        else if (strcmp(t->value, "this") == 0) { vm_writer_write_push(p->vm, "pointer", 0); }
        lex_advance(p->lex);
    } else if (is_sym(p, '(')) {
        lex_advance(p->lex);
        compile_expression(p);
        parser_require_token(p, T_SYM, ")");
    } else if (is_any_sym(p, "-~")) {
        char op = t->value[0];
        lex_advance(p->lex);
        compile_term(p);
        if (op == '-') vm_writer_write_arithmetic(p->vm, "neg");
        else vm_writer_write_arithmetic(p->vm, "not");
    } else if (t->type == T_ID) {
        char name[MAX_TOKEN_LENGTH];
        strncpy(name, t->value, sizeof(name) - 1); name[sizeof(name) - 1] = '\0';
        lex_advance(p->lex);
        if (is_sym(p, '[')) {
            vm_push_variable(p, name);
            lex_advance(p->lex);
            compile_expression(p);
            parser_require_token(p, T_SYM, "]");
            vm_writer_write_arithmetic(p->vm, "add");
            vm_writer_write_pop(p->vm, "pointer", 1);
            vm_writer_write_push(p->vm, "that", 0);
        } else if (is_sym(p, '(') || is_sym(p, '.')) {
            char func_name[MAX_TOKEN_LENGTH * 2 + 2];
            int n_args = 0;
            if (is_sym(p, '.')) {
                lex_advance(p->lex);
                Token* sub_name = parser_require_token(p, T_ID, NULL);
                Symbol* s = symbol_table_lookup(p->symbols, name);
                if (s) {
                    vm_push_variable(p, name);
                    snprintf(func_name, sizeof(func_name), "%s.%s", s->type, sub_name->value);
                    n_args = 1;
                } else {
                    snprintf(func_name, sizeof(func_name), "%s.%s", name, sub_name->value);
                }
            } else {
                vm_writer_write_push(p->vm, "pointer", 0);
                snprintf(func_name, sizeof(func_name), "%s.%s", p->current_class, name);
                n_args = 1;
            }
            parser_require_token(p, T_SYM, "(");
            n_args += compile_expression_list(p);
            parser_require_token(p, T_SYM, ")");
            vm_writer_write_call(p->vm, func_name, n_args);
        } else {
            vm_push_variable(p, name);
        }
    } else { ERROR("Invalid term"); }
}

void compile_expression(Parser* p) {
    compile_term(p);
    while (is_any_sym(p, "+-*/&|<>=.")) {
        Token* op = lex_advance(p->lex);
        compile_term(p);
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

int compile_expression_list(Parser* p) {
    int count = 0;
    if (!is_sym(p, ')')) {
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

void compile_return(Parser* p) {
    lex_advance(p->lex);
    if (!is_sym(p, ';')) {
        compile_expression(p);
    } else {
        vm_writer_write_push(p->vm, "constant", 0);
    }
    parser_require_token(p, T_SYM, ";");
    vm_writer_write_return(p->vm);
}

void compile_do(Parser* p) {
    lex_advance(p->lex);
    compile_term(p);
    vm_writer_write_pop(p->vm, "temp", TEMP_RETURN);
    parser_require_token(p, T_SYM, ";");
}

void compile_let(Parser* p) {
    lex_advance(p->lex);
    Token* var_name = parser_require_token(p, T_ID, NULL);
    int is_array = 0;
    if (is_sym(p, '[')) {
        is_array = 1;
        vm_push_variable(p, var_name->value);
        lex_advance(p->lex);
        compile_expression(p);
        parser_require_token(p, T_SYM, "]");
        vm_writer_write_arithmetic(p->vm, "add");
    }
    parser_require_token(p, T_SYM, "=");
    compile_expression(p);
    parser_require_token(p, T_SYM, ";");
    if (is_array) {
        vm_writer_write_pop(p->vm, "temp", TEMP_ARRAY);
        vm_writer_write_pop(p->vm, "pointer", 1);
        vm_writer_write_push(p->vm, "temp", TEMP_ARRAY);
        vm_writer_write_pop(p->vm, "that", 0);
    } else {
        vm_pop_variable(p, var_name->value);
    }
}

void compile_while(Parser* p) {
    char label_top[32], label_end[32];
    snprintf(label_top, sizeof(label_top), "WHILE_EXP%d", p->label_counter++);
    snprintf(label_end, sizeof(label_end), "WHILE_END%d", p->label_counter++);
    vm_writer_write_label(p->vm, label_top);
    lex_advance(p->lex);
    parser_require_token(p, T_SYM, "(");
    compile_expression(p);
    parser_require_token(p, T_SYM, ")");
    vm_writer_write_arithmetic(p->vm, "not");
    vm_writer_write_if(p->vm, label_end);
    parser_require_token(p, T_SYM, "{");
    compile_statements(p);
    parser_require_token(p, T_SYM, "}");
    vm_writer_write_goto(p->vm, label_top);
    vm_writer_write_label(p->vm, label_end);
}

void compile_if(Parser* p) {
    char label_else[32], label_end[32];
    snprintf(label_else, sizeof(label_else), "IF_FALSE%d", p->label_counter++);
    snprintf(label_end, sizeof(label_end), "IF_END%d", p->label_counter++);
    lex_advance(p->lex);
    parser_require_token(p, T_SYM, "(");
    compile_expression(p);
    parser_require_token(p, T_SYM, ")");
    vm_writer_write_arithmetic(p->vm, "not");
    vm_writer_write_if(p->vm, label_else);
    parser_require_token(p, T_SYM, "{");
    compile_statements(p);
    parser_require_token(p, T_SYM, "}");
    int has_else = is_keyword(p, "else");
    if (has_else) vm_writer_write_goto(p->vm, label_end);
    vm_writer_write_label(p->vm, label_else);
    if (has_else) {
        lex_advance(p->lex);
        parser_require_token(p, T_SYM, "{");
        compile_statements(p);
        parser_require_token(p, T_SYM, "}");
        vm_writer_write_label(p->vm, label_end);
    }
}

void compile_statements(Parser* p) {
    while (1) {
        Token* t = lex_peek(p->lex);
        if (t->type != T_KEYWORD) break;
        if (strcmp(t->value, "let") == 0) compile_let(p);
        else if (strcmp(t->value, "if") == 0) compile_if(p);
        else if (strcmp(t->value, "while") == 0) compile_while(p);
        else if (strcmp(t->value, "do") == 0) compile_do(p);
        else if (strcmp(t->value, "return") == 0) compile_return(p);
        else break;
    }
}

void compile_var_dec(Parser* p) {
    lex_advance(p->lex);
    Token* type = lex_advance(p->lex);
    do {
        Token* name = parser_require_token(p, T_ID, NULL);
        symbol_table_define(p->symbols, name->value, type->value, SK_VAR);
    } while (is_sym(p, ',') && (lex_advance(p->lex), 1));
    parser_require_token(p, T_SYM, ";");
}

void compile_parameter_list(Parser* p) {
    if (is_type(p)) {
        do {
            Token* type = lex_advance(p->lex);
            Token* name = parser_require_token(p, T_ID, NULL);
            symbol_table_define(p->symbols, name->value, type->value, SK_ARG);
        } while (is_sym(p, ',') && (lex_advance(p->lex), 1));
    }
}

void compile_subroutine(Parser* p) {
    Token* kind = lex_advance(p->lex);
    lex_advance(p->lex); // type or void
    Token* name = parser_require_token(p, T_ID, NULL);
    strncpy(p->current_subroutine, name->value, sizeof(p->current_subroutine) - 1);
    p->current_subroutine[sizeof(p->current_subroutine) - 1] = '\0';
    symbol_table_start_subroutine(p->symbols);
    if (strcmp(kind->value, "method") == 0) {
        symbol_table_define(p->symbols, "this", p->current_class, SK_ARG);
    }
    parser_require_token(p, T_SYM, "(");
    compile_parameter_list(p);
    parser_require_token(p, T_SYM, ")");
    parser_require_token(p, T_SYM, "{");
    while (is_keyword(p, "var")) {
        compile_var_dec(p);
    }
    char func_name[MAX_TOKEN_LENGTH * 2 + 2];
    snprintf(func_name, sizeof(func_name), "%s.%s", p->current_class, p->current_subroutine);
    int n_locals = symbol_table_var_count(p->symbols, SK_VAR);
    vm_writer_write_function(p->vm, func_name, n_locals);
    if (strcmp(kind->value, "constructor") == 0) {
        int n_fields = symbol_table_var_count(p->symbols, SK_FIELD);
        vm_writer_write_push(p->vm, "constant", n_fields);
        vm_writer_write_call(p->vm, "Memory.alloc", 1);
        vm_writer_write_pop(p->vm, "pointer", 0);
    } else if (strcmp(kind->value, "method") == 0) {
        vm_writer_write_push(p->vm, "argument", 0);
        vm_writer_write_pop(p->vm, "pointer", 0);
    }
    compile_statements(p);
    parser_require_token(p, T_SYM, "}");
}

void compile_class_var_dec(Parser* p) {
    Token* kind_tok = lex_advance(p->lex);
    SymbolKind kind = (strcmp(kind_tok->value, "static") == 0) ? SK_STATIC : SK_FIELD;
    Token* type = lex_advance(p->lex);
    do {
        Token* name = parser_require_token(p, T_ID, NULL);
        symbol_table_define(p->symbols, name->value, type->value, kind);
    } while (is_sym(p, ',') && (lex_advance(p->lex), 1));
    parser_require_token(p, T_SYM, ";");
}

void compile_class(Parser* p) {
    parser_require_token(p, T_KEYWORD, "class");
    Token* class_name = parser_require_token(p, T_ID, NULL);
    strncpy(p->current_class, class_name->value, sizeof(p->current_class) - 1);
    p->current_class[sizeof(p->current_class) - 1] = '\0';
    parser_require_token(p, T_SYM, "{");
    while (is_any_keyword(p, 2, "static", "field")) {
        compile_class_var_dec(p);
    }
    while (is_any_keyword(p, 3, "constructor", "function", "method")) {
        compile_subroutine(p);
    }
    parser_require_token(p, T_SYM, "}");
}

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

void parser_destroy(Parser* parser) {
    vm_writer_close(parser->vm);
    free(parser->lex);
    free(parser->symbols);
    free(parser->vm);
}

//----------------------------------------------------------------------
// 9. 主程式 (Compiler) 實作
//----------------------------------------------------------------------
void analyze_file(const char* filepath) {
    printf("Analyzing %s\n", filepath);
    Parser p;
    parser_init(&p, filepath);
    parser_destroy(&p);
}

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