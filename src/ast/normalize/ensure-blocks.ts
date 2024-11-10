import { getLoc } from "../../utils";
import { astNaiveTraversal } from "../ast-traversal";
import { BlockStatement, Program, Statement } from "../augmented-ast";

/** Ensures blocks in if(), else, for, etc */
export function ensureBlocks(root: Program) {
  for (const node of astNaiveTraversal(root)) {
    switch (node.type) {
      case "IfStatement": {
        node.consequent = toBlock(node.consequent);
        node.alternate = toBlock(node.alternate);
        break;
      }
      case "WhileStatement": {
        node.body = toBlock(node.body);
        break;
      }
      case "ForInStatement":
      case "ForOfStatement": {
        node.body = toBlock(node.body);
        break;
      }

      case "ForStatement": {
        node.body = toBlock(node.body);
        break;
      }
    }
  }

  function toBlock(stat: Statement | null | undefined): BlockStatement {
    if (stat == null) return stat as any; // simplify ret type

    if (stat.type === "BlockStatement") return stat;

    return {
      type: "BlockStatement",
      body: [stat],
      ...getLoc(stat),
    };
  }
}
