import {
  AnyNode2,
  BlockStatement,
  Program,
  VariableDeclaration,
} from "../augmented-ast";
import {
  astIsBodyArrayHaver,
  astRawTraversal,
  goThroughAll,
} from "../ast-traversal";

const traverseOptions: Parameters<typeof astRawTraversal>[1] = {
  classes: true,
  classProperties: true,
  expressions: true,
  functions: true,
  labels: false,
  patterns: true,
  //super: false,
  switchStatements: true,
  tryCatch: true,
};

export function normalizeVariableDeclarations(ast: Program) {
  function splatDeclarators(node: VariableDeclaration): VariableDeclaration[] {
    return node.declarations.map((declarator) => ({
      ...node,
      type: "VariableDeclaration",
      declarations: [
        {
          ...declarator,
          init: declarator.init ?? {
            type: "Identifier",
            name: "undefined",
            end: declarator.end,
            start: declarator.start,
            loc: declarator.loc,
          },
        },
      ],
    }));
  }

  function intersperseVariableDeclarations<
    T extends Program["body"] | BlockStatement["body"]
  >(body: T) {
    for (let i = 0; i < body.length; i++) {
      const stat = body[i];
      if (stat.type === "VariableDeclaration") {
        const replaced = splatDeclarators(stat);
        body.splice(i, 1, ...replaced);
        i -= 1; // deleted 1
        i += replaced.length; // added {replaced.length} items
      }
    }
  }

  function recurse(node: AnyNode2) {
    if (astIsBodyArrayHaver(node)) {
      intersperseVariableDeclarations(node.body);
    } else if (node.type === "ClassExpression") {
      for (const bod of node.body.body) {
        if (bod.type === "StaticBlock") {
          intersperseVariableDeclarations(bod.body);
        }
      }
    }

    for (const child of astRawTraversal(node, traverseOptions, goThroughAll)) {
      recurse(child);
    }
  }

  recurse(ast);
}
