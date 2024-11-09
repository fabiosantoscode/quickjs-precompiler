import { astNaiveTraversal } from "../ast-traversal";
import { Program } from "../augmented-ast";

export function normalizeBareReturns(root: Program) {
  for (const node of astNaiveTraversal(root)) {
    if (node.type === "ReturnStatement" && !node.argument) {
      const { start, end, loc, range } = node;
      node.argument = {
        type: "Identifier",
        name: "undefined",
        uniqueName: "undefined@global",
        isReference: "reference",
        start,
        end,
        loc,
        range,
      };
    }
  }
}
