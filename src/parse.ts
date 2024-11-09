import * as acorn from "acorn";
import * as astring from "astring";
import type { Program } from "./precompiler/augmented-ast";
import { uniqueifyNames } from "./precompiler/uniqueify-names";
import { normalizeArrowFunctions } from "./precompiler/normalize/arrows";
import { normalizeMarkReferences } from "./precompiler/normalize/mark-references";
import { normalizeVariableDeclarations } from "./precompiler/normalize/variable-declarations";
import { normalizeHoistedFunctions } from "./precompiler/normalize/normalize-hoisted-functions";
import { BindingTracker } from "./precompiler/normalize/binding-tracker";

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

  normalizeArrowFunctions(program);
  normalizeVariableDeclarations(program);
  normalizeHoistedFunctions(program);
  normalizeMarkReferences(program);

  uniqueifyNames(program);

  new BindingTracker(program).visit(program);

  return program;
}

export function stringifyJsFile(source: Program) {
  return astring.generate(source).trimEnd();
}
