import { time } from "console";
import { getLoc, iterateReassignable } from "../../utils";
import { astIsBodyArrayHaver, astNaiveTraversal } from "../ast-traversal";
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
      const loc = getLoc(item);

      item.body = {
        type: "BlockStatement",
        body: [item.body],
        ...loc,
      };
    }
  }
}
