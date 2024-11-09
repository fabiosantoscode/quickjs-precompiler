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

export function normalizeAll(program: Program) {
  normalizeLabels(program);
  normalizeBareReturns(program);
  normalizeArrowFunctions(program);
  normalizeVariableDeclarations(program);
  normalizeHoistedFunctions(program);
  normalizeMarkReferences(program);
  hoistLegacyVar(program);

  uniqueifyNames(program);

  new BindingTracker(program).visit(program);
}