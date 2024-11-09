import * as acorn from "acorn";
import * as astring from "astring";
import type { Program } from "./precompiler/augmented-ast";
import { uniqueifyNames } from "./precompiler/normalize/uniqueify-names";
import { normalizeBareReturns } from "./precompiler/normalize/bare-returns";
import { normalizeArrowFunctions } from "./precompiler/normalize/arrows";
import { normalizeMarkReferences } from "./precompiler/normalize/mark-references";
import { normalizeVariableDeclarations } from "./precompiler/normalize/variable-declarations";
import { normalizeHoistedFunctions } from "./precompiler/normalize/normalize-hoisted-functions";
import { BindingTracker } from "./precompiler/normalize/binding-tracker";
import { hoistLegacyVar } from "./precompiler/normalize/hoist-var";
import { normalizeLabels } from "./precompiler/normalize/labels";

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

  normalizeLabels(program);
  normalizeBareReturns(program);
  normalizeArrowFunctions(program);
  normalizeVariableDeclarations(program);
  normalizeHoistedFunctions(program);
  normalizeMarkReferences(program);
  hoistLegacyVar(program);

  uniqueifyNames(program);

  new BindingTracker(program).visit(program);

  return program;
}

export function stringifyJsFile(source: Program) {
  return astring.generate(source).trimEnd();
}
