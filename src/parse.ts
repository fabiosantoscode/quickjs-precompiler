import * as acorn from "acorn"
import * as astring from "astring"
import type { Program } from "./precompiler/augmented-ast";
import { uniqueifyNames } from "precompiler/identify-scope";

export interface Options {
    sourceFile?: string
}

export function parseJsFile(source: string, { sourceFile }: Options = {}): Program {
    const program = acorn.parse(source, {
        sourceFile: sourceFile || 'unknown',
        sourceType: 'module',
        allowHashBang: true,
        ecmaVersion: 2020,
        locations: true,
    }) as Program;

    uniqueifyNames(program)

    return program;
}

export function stringifyJsFile(source: Program) {
    return astring.generate(source).trimEnd();
}