#include "string.h"
#include "unistd.h"
#include "stdio.h"
#include "quickjs-libc.h"

/*
 * How to run this:
cd vendor/quickjs
make
make quickjs.o
*/

void* ptr_or_die(void* ptr, char* msg) {
    if (!ptr) {
        printf("ptr_or_die: null ptr at '%s'", msg);
    }
    return ptr;
}

int main () {
    JSRuntime* rt = ptr_or_die(JS_NewRuntime(), "JS_NewRuntime");
    JSContext* ctx = ptr_or_die(JS_NewContext(rt), "JS_NewContext");

    char* expr = "(1/3).toFixed(3);";
    JSValue a_third = JS_Eval(ctx, expr, strlen(expr), "", 0);

    if (JS_IsException(a_third)) {
        printf("OH NO not a string \n");
        return 1;
    }

    if (!JS_IsString(a_third)) {
        printf("OH NO not a string \n");
        return 1;
    }

    const char* s = JS_ToCString(ctx, a_third);

    JSValue i = JS_NewInt32(ctx, 1);
    printf("lol: %s\n\n", s);
    printf("%ld\n\n", i.tag);

    return 0;
}
