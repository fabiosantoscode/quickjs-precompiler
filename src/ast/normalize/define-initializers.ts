import { getLoc, iterateReassignable } from "../../utils";
import {
  astMakeExpressionStatement,
  astMakeLet,
  astMakeUndefined,
} from "../ast-make";
import {
  astIsBodyArrayHaver,
  astNaiveChildren,
  astPatternAssignedBindings,
  isFunction,
} from "../ast-traversal";
import {
  AnyNode,
  AnyNode2,
  BlockStatement,
  Function,
  Identifier,
  Program,
  VariableDeclaration,
} from "../augmented-ast";

/** find var and let without `init` and define it */
export function defineInitializers(parent: AnyNode2) {
  for (const node of astNaiveChildren(parent)) {
    if (
      node.type === "VariableDeclaration"
      && !(parent.type === "ForStatement" && parent.init === node)
      && !(
        (parent.type === "ForInStatement" || parent.type === "ForOfStatement")
        && parent.left === node
      )
    ) {
      for (const declarator of node.declarations) {
        if (!declarator.init) {
          declarator.init = {
            type: "Identifier",
            name: "undefined",
            uniqueName: "undefined@global",
            loc: declarator.loc,
            start: declarator.start,
            end: declarator.end,
          }
        }
      }
    }
  }
}

