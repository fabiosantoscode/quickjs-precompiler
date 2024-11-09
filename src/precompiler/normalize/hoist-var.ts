import { getLoc } from "../../utils";
import {
  astIsBodyArrayHaver,
  astNaiveChildren,
  astPatternAssignedBindings,
  isFunction,
} from "../ast-traversal";
import {
  AnyNode,
  ArrowFunctionExpression,
  BlockStatement,
  FunctionExpression,
  Identifier,
  Program,
  VariableDeclaration,
} from "../augmented-ast";

/** Make all variable declarations be `let` or `const` */
export function hoistLegacyVar(
  varScopeRoot: Program | BlockStatement,
  paramNames: string[] = []
) {
  const varsSeenBeforeDecl = new Set<string>();
  const varDecls = new Map<string, Identifier | null>(
    paramNames.map((name) => [name, null])
  );

  // Find `var` and either turn them into `let` or turn into assignment and add to `varDecls`
  (function recurse(node: AnyNode) {
    if (isFunction(node)) {
      hoistFunc(node);
      return; // don't go into functions
    }

    if (node.type === "Identifier" && node.isReference === "reference") {
      varsSeenBeforeDecl.add(node.name);
    } else if (astIsBodyArrayHaver(node)) {
      for (let i = 0; i < node.body.length; i++) {
        const child = node.body[i];
        if (
          child.type === "VariableDeclaration" &&
          (child.kind as string) === "var"
        ) {
          const loc = getLoc(child);

          const bindings = astPatternAssignedBindings(child.declarations[0].id);

          // sometimes there's no need to convert
          let everReferredTo = bindings.some((id) =>
            varsSeenBeforeDecl.has(id.name)
          );
          let everDeclared = bindings.some((id) => varDecls.has(id.name));

          if (!everReferredTo && !everDeclared && node === varScopeRoot) {
            child.kind = "let";
            bindings.forEach((id) => varDecls.set(id.name, null));
          } else {
            for (const id of bindings) {
              if (!varDecls.has(id.name)) {
                varDecls.set(id.name, structuredClone(id));
              }
            }
            node.body[i] = {
              type: "ExpressionStatement",
              expression: {
                type: "AssignmentExpression",
                operator: "=",
                left: child.declarations[0].id,
                right: child.declarations[0].init,
                ...loc,
              },
              ...loc,
            };
          }
        }

        recurse(node.body[i]);
      }
    } else {
      for (const child of astNaiveChildren(node)) {
        recurse(child);
      }
    }
  })(varScopeRoot);

  if (varDecls.size) {
    const asLet: VariableDeclaration[] = [...varDecls.values()].flatMap(
      (ident) => {
        if (!ident) return [];

        const loc = getLoc(ident);
        return astPatternAssignedBindings(ident).map((id) => {
          return {
            type: "VariableDeclaration",
            kind: "let",
            declarations: [
              {
                type: "VariableDeclarator",
                id: structuredClone(id),
                init: {
                  type: "Identifier",
                  name: "undefined",
                  uniqueName: "undefined@global",
                  isReference: "reference",
                  ...loc,
                },
                ...loc,
              },
            ],
            ...loc,
          } as VariableDeclaration;
        });
      }
    );

    varScopeRoot.body.unshift(...asLet);
  }
}

function hoistFunc(func: FunctionExpression | ArrowFunctionExpression) {
  hoistLegacyVar(
    func.body,
    astPatternAssignedBindings(func.params).map((id) => id.name)
  );
}
