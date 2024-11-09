import * as acorn from "acorn";
import * as astring from "astring";
import type { Program } from "./ast/augmented-ast";
import { normalizeAll } from './ast/normalize/all'

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

  normalizeAll(program)

  return program;
}

export function stringifyJsFile(source: Program) {
  return astring.generate(source).trimEnd();
}
