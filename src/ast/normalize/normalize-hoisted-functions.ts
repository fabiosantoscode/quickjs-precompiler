import { FunctionDeclaration } from "acorn";
import { astIsBodyArrayHaver, astNaiveTraversal } from "../ast-traversal";
import {
  AnyNode,
  AnyNode2,
  BlockStatement,
  FunctionExpression,
  Identifier,
  Program,
  StaticBlock,
  VariableDeclaration,
} from "../augmented-ast";
import { defined, invariant } from "../../utils";
import { astMakeConst } from "../ast-make";

export function normalizeHoistedFunctions(
  root: StaticBlock | BlockStatement | Program
) {
  hoist(root);

  for (const maybeBodyHaver of astNaiveTraversal(root)) {
    if (
      (maybeBodyHaver.type === "ExportDefaultDeclaration" &&
        (maybeBodyHaver.declaration.type as string) ===
          "FunctionDeclaration") ||
      (maybeBodyHaver.type === "ExportNamedDeclaration" &&
        (maybeBodyHaver.declaration?.type as string) === "FunctionDeclaration")
    ) {
      invariant(false, "TODO");
    }
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
      const id = structuredClone(defined(func.id) as Identifier);
      const newFunc = {
        ...func,
        type: "FunctionExpression",
      } as FunctionExpression;

      return astMakeConst(func as any as AnyNode, id, newFunc);
    });

    bodyHaver.body = [
      ...asVariables,
      ...bodyHaver.body.filter((item) => !funcDecls.has(item as any)),
    ];
  }
}
