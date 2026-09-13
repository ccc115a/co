/* book.js — highlight.js 自訂語言 + 初始化 */
(function(){
  // highlight.js 載入後註冊自訂語言
  if(typeof hljs==='undefined') return;
  // HDL
  hljs.registerLanguage('hdl',function(hljs){
    return{keywords:{keyword:'CHIP IN OUT PARTS BUILTIN CLOCKED'},
      contains:[hljs.C_LINE_COMMENT_MODE,
        {scope:'title',begin:/[A-Z][A-Za-z0-9_]+/,relevance:10},
        {scope:'attr',begin:/\w+(?=\s*[=(])/}]};
  });
  // ASM
  hljs.registerLanguage('asm',function(hljs){
    return{contains:[
      hljs.C_LINE_COMMENT_MODE,
      {scope:'symbol',begin:/^\s*[\(][A-Za-z0-9_]+[\)]/},
      {scope:'built_in',match:/\b[A-Z][A-Z0-9_]*\b/},
      {scope:'number',match:/@\w+/},
      {scope:'keyword',match:/;[A-Z]+/}]};
  });
  // VM
  hljs.registerLanguage('vm',function(hljs){
    return{keywords:{keyword:'push pop add sub neg eq gt lt and or not label goto if-goto function call return local argument static this that pointer temp constant'},
      contains:[hljs.C_LINE_COMMENT_MODE,
        {scope:'number',match:/\d+/}]};
  });
  // Jack
  hljs.registerLanguage('jack',function(hljs){
    return{keywords:{keyword:'class constructor method function var let do if else while return static field int boolean char void true false null this new'},
      contains:[hljs.C_LINE_COMMENT_MODE,
        hljs.QUOTE_STRING_MODE,
        {scope:'number',match:/\d+/}]};
  });
  // 標準語言自動高亮
  hljs.highlightAll();
})();
