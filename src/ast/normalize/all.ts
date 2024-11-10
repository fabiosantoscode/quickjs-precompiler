import { uniqueifyNames } from "./uniqueify-names";
import { normalizeBareReturns } from "./bare-returns";
import { normalizeArrowFunctions } from "./arrows";
import { normalizeMarkReferences } from "./mark-references";
import { normalizeVariableDeclarations } from "./variable-declarations";
import { normalizeHoistedFunctions } from "./normalize-hoisted-functions";
import { BindingTracker } from "./binding-tracker";
import { hoistLegacyVar } from "./hoist-var";
import { normalizeLabels } from "./labels";

import { Program } from "../augmented-ast";
import { removeFunctionsFromExpressions } from "./remove-functions-from-expressions";
import { ensureBlocks } from "./ensure-blocks";

export function normalizeAll(program: Program) {
  // Most basic AST shape, optional values
  ensureBlocks(program);
  normalizeLabels(program);
  normalizeBareReturns(program);
  normalizeArrowFunctions(program);

  // Move variables around
  normalizeVariableDeclarations(program);
  normalizeHoistedFunctions(program);
  removeFunctionsFromExpressions(program);
  normalizeMarkReferences(program);
  hoistLegacyVar(program);

  // Mark all identifiers with .uniqueName
  uniqueifyNames(program);

  new BindingTracker(program).visit(program);
}
