import { uniqueifyNames } from "./uniqueify-names";
import { normalizeBareReturns } from "./bare-returns";
import { normalizeArrowFunctions } from "./arrows";
import { normalizeMarkReferences } from "./mark-references";
import { normalizeVariableDeclarations } from "./variable-declarations";
import { normalizeHoistedFunctions } from "./normalize-hoisted-functions";
import { BindingTracker } from "./binding-tracker";
import { defineInitializers } from "./define-initializers";
import { hoistLegacyVar } from "./hoist-var";
import { normalizeLabels } from "./labels";

import { Program } from "../augmented-ast";
import { removeFunctionsFromExpressions } from "./remove-functions-from-expressions";
import { ensureBlocks } from "./ensure-blocks";
import { explicitLabels } from "./explicit-labels";
import { emptyStatements } from "./empty-statements";

export function normalizeAll(program: Program) {
  // Most basic AST shape, optional values
  emptyStatements(program);
  ensureBlocks(program);
  normalizeLabels(program);
  explicitLabels(program);
  normalizeBareReturns(program);
  normalizeArrowFunctions(program);

  // Move variables around
  defineInitializers(program);
  hoistLegacyVar(program);
  normalizeVariableDeclarations(program);
  normalizeHoistedFunctions(program);
  removeFunctionsFromExpressions(program);
  normalizeMarkReferences(program);

  // Mark all identifiers with .uniqueName
  uniqueifyNames(program);

  new BindingTracker(program).visit(program);
}
