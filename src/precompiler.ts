import { parseJsFile, stringifyJsFile } from "parse";
import { generateRuntimeForBytecode, jsToBytecode } from "quickjs-bytecode.js";
import { compileAndRunC } from "./run";

export async function precompileToC(code: string, sourceFile = 'unknown') {
    const program = parseJsFile(code, { sourceFile });

    // TODO: some meaningful optimisations go here

    const jsOutput = stringifyJsFile(program)
    
    const bytecode = await jsToBytecode(jsOutput)

    const runtime = generateRuntimeForBytecode({ bytecode })

    return runtime
}

export async function precompile(code: string, sourceFile = 'unknown') {
    const program = parseJsFile(code, { sourceFile });

    // TODO: some meaningful optimisations go here

    const jsOutput = stringifyJsFile(program)
    
    const bytecode = await jsToBytecode(jsOutput)

    const runtime = generateRuntimeForBytecode({ bytecode })

    return runtime
}

export async function precompileAndRun(code: string, sourceFile = 'unknown', options: Parameters<typeof compileAndRunC>[1]) {
    const cCode = await precompile(code, sourceFile)

    return await compileAndRunC(cCode, options)
}
