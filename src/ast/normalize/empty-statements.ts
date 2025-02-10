import { astNaiveTraversal } from "../ast-traversal";
import { BlockStatement, Program } from "../augmented-ast";

/** Removes "EmptyStatement" */
export function emptyStatements(root: Program) {
  for (const node of astNaiveTraversal(root)) {
    if ((node.type as string) === "EmptyStatement") {
      (node as BlockStatement).type = "BlockStatement";
      (node as BlockStatement).body = [];
    }
  }
}
