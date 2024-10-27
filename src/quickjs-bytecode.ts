import { mkdtemp, readFile, writeFile } from "fs/promises";
import { simpleSpawn } from "./simple-spawn";
import { join } from "path";
import { tmpdir } from "os";
import { rimraf } from "rimraf";

export type Bytecode = { cSource: string; bytecodeName: string; bytecodeSize: string; }

export async function jsToBytecode(inputJs: string, bytecodeName = 'GENERATED_BYTECODE'): Promise<Bytecode> {
    const tmpDir = await mkdtemp(join(tmpdir(), 'quickjs-precompiler-to-bytecode'));
    const file = join(tmpDir, 'input.js')
    const file_c = join(tmpDir, 'output.c')

    try {
        await writeFile(file, inputJs, )
        await simpleSpawn(
            './vendor/quickjs/qjsc',
            [ '-c', '-N', bytecodeName, '-o', file_c, file]
        );

        const cSource = await readFile(file_c, 'utf-8');
        return { cSource, bytecodeName, bytecodeSize: bytecodeName + '_size' }
    } finally {
        await rimraf(tmpDir)
    }
}

export function generateRuntimeForBytecode({
    bytecode,
}: {
    bytecode: Bytecode
}): string {
    return String.raw`#include "string.h"
        #include "unistd.h"
        #include "stdio.h"
        #include "quickjs-libc.h"

        // --EMBEDDED BYTECODE--
        ${bytecode.cSource}
        // --EMBEDDED BYTECODE END--

        void* ptr_or_die(void* ptr, char* msg) {
            if (!ptr) {
                printf("null ptr at '%s'", msg);
                exit(1);
            }
            return ptr;
        }

        int main () {
            JSRuntime* rt = ptr_or_die(JS_NewRuntime(), "JS_NewRuntime");
            JSContext* ctx = ptr_or_die(JS_NewContext(rt), "JS_NewContext");

            // Add print() and console.log()
            js_std_add_helpers(ctx, 0, NULL);
            js_std_eval_binary(ctx, ${bytecode.bytecodeName}, ${bytecode.bytecodeSize}, 0);

            return 0;
        }
    `
}