import { astMakeBlockOfOne } from "../ast-make";
import { astNaiveTraversal } from "../ast-traversal";
import { Program } from "../augmented-ast";

/**
 * Make sure labels always have an array body
 */
export function normalizeLabels(root: Program) {
  for (const item of astNaiveTraversal(root)) {
    if (
      item.type === "LabeledStatement" &&
      item.body.type !== "BlockStatement"
    ) {
      item.body = astMakeBlockOfOne(item.body);
    }
  }
}
