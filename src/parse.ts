import * as acorn from "acorn";
import * as astring from "astring";
import type { BlockStatement, Function, Program } from "./ast/augmented-ast";
import { normalizeAll } from "./ast/normalize/all";
import { validateAst } from "./ast/ast-validate";

export interface Options {
  sourceFile?: string;
}

export function parseJsFile(
  source: string,
  { sourceFile }: Options = {}
): Program {
  const program = acorn.parse(source, {
    sourceFile: sourceFile || "unknown",
    sourceType: "module",
    allowHashBang: true,
    ecmaVersion: 2020,
    locations: true,
  }) as Program;

  normalizeAll(program);

  validateAst(program);

  return program;
}

export function stringifyJsFile(source: Program | Function) {
  return astring.generate(source).trimEnd();
}

export function stringifyJsBlock(source: BlockStatement) {
  return astring.generate(source).trimEnd();
}
