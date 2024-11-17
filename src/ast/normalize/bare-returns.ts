import { astMakeUndefined } from "../ast-make";
import { astNaiveTraversal } from "../ast-traversal";
import { Program } from "../augmented-ast";

export function normalizeBareReturns(root: Program) {
  for (const node of astNaiveTraversal(root)) {
    if (node.type === "ReturnStatement" && !node.argument) {
      node.argument = astMakeUndefined(node);
    }
  }
}
