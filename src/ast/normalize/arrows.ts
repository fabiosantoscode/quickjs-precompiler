import { astNaiveTraversal } from "../ast-traversal";
import { AnyNode } from "../augmented-ast";

/** Normalize arrow functions into always having at least { return X } (IE they will never be expressions) */
export function normalizeArrowFunctions(root: AnyNode) {
  for (const thing of astNaiveTraversal(root)) {
    if (
      thing.type === "ArrowFunctionExpression" &&
      thing.body.type !== "BlockStatement"
    ) {
      const { start, end, loc, range } = thing.body;

      thing.body = {
        type: "BlockStatement",
        body: [
          {
            type: "ReturnStatement",
            argument: thing.body as any,
            start,
            end,
            loc,
            range,
          },
        ],
        start,
        end,
        loc,
        range,
      };
    }
  }
}
