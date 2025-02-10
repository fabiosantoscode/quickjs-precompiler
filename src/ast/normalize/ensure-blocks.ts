import { astMakeBlockOfOne } from "../ast-make";
import { astNaiveTraversal } from "../ast-traversal";
import { Program } from "../augmented-ast";

/** Ensures blocks in if(), else, for, etc */
export function ensureBlocks(root: Program) {
  for (const node of astNaiveTraversal(root)) {
    switch (node.type) {
      case "IfStatement": {
        node.consequent = astMakeBlockOfOne(node.consequent);
        node.alternate &&= astMakeBlockOfOne(node.alternate);
        break;
      }
      case "DoWhileStatement":
      case "WhileStatement": {
        node.body = astMakeBlockOfOne(node.body);
        break;
      }
      case "ForInStatement":
      case "ForOfStatement":
      case "ForStatement": {
        node.body = astMakeBlockOfOne(node.body);
        break;
      }
    }
  }
}
