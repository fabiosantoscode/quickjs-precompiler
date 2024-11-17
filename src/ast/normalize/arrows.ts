import { getLoc } from "../../utils";
import { astMakeBlockOfOne } from "../ast-make";
import { astNaiveTraversal } from "../ast-traversal";
import { AnyNode } from "../augmented-ast";

/** Normalize arrow functions into always having at least { return X } (IE they will never be expressions) */
export function normalizeArrowFunctions(root: AnyNode) {
  for (const thing of astNaiveTraversal(root)) {
    if (
      thing.type === "ArrowFunctionExpression" &&
      thing.body.type !== "BlockStatement"
    ) {
      thing.body = astMakeBlockOfOne({
        type: "ReturnStatement",
        argument: thing.body as any,
        ...getLoc(thing.body),
      });
    }
  }
}
