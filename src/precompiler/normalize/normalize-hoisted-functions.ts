import { FunctionDeclaration } from "acorn";
import { astIsBodyArrayHaver, astNaiveTraversal } from "../ast-traversal";
import {
  AnyNode2,
  BlockStatement,
  FunctionExpression,
  Identifier,
  Program,
  StaticBlock,
  VariableDeclaration,
} from "../augmented-ast";
import { defined } from "../../utils";

export function normalizeHoistedFunctions(
  root: StaticBlock | BlockStatement | Program
) {
  hoist(root);

  for (const maybeBodyHaver of astNaiveTraversal(root)) {
    if (
      astIsBodyArrayHaver(maybeBodyHaver as AnyNode2) &&
      maybeBodyHaver !== root
    ) {
      hoist(maybeBodyHaver as BlockStatement);
    }
  }
}

function hoist(bodyHaver: StaticBlock | BlockStatement | Program) {
  const funcDecls = new Set(
    bodyHaver.body.filter((bod) => bod.type === ("FunctionDeclaration" as any))
  ) as any as Set<FunctionDeclaration>;

  if (funcDecls.size) {
    const asVariables: VariableDeclaration[] = [...funcDecls].map((func) => {
      const { start, end, loc, range } = func;
      const id = defined(func.id) as Identifier;
      return {
        type: "VariableDeclaration",
        kind: "const",
        declarations: [
          {
            type: "VariableDeclarator",
            id: structuredClone(id) as Identifier,
            init: {
              ...func,
              type: "FunctionExpression",
            } as FunctionExpression,
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
      } as VariableDeclaration;
    });

    bodyHaver.body = [
      ...asVariables,
      ...bodyHaver.body.filter((item) => !funcDecls.has(item as any)),
    ];
  }
}
