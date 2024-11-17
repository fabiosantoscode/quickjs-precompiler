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
  BlockStatement,
  Function,
  Identifier,
  Program,
  VariableDeclaration,
} from "../augmented-ast";

/** Make all variable declarations be `let` or `const` */
export function hoistLegacyVar(
  varScopeRoot: Program | BlockStatement,
  paramNames: string[] = []
) {
  const varDecls = new Map<string, Identifier>();

  // Find `var` and either turn them into `let` or turn into assignment and add to `varDecls`
  (function recurse(node: AnyNode) {
    if (isFunction(node)) {
      hoistFunc(node);
      return; // don't go into functions
    }

    if (astIsBodyArrayHaver(node)) {
      const registerBindings = (vardecl: VariableDeclaration) => {
        for (const id of astPatternAssignedBindings(
          vardecl.declarations[0].id
        )) {
          if (!varDecls.has(id.name)) {
            varDecls.set(id.name, structuredClone(id));
          }
        }
      };

      for (let { value: child, replace } of iterateReassignable(node.body)) {
        /*
        (always)
        var x = 3 --> let x; ... x = 3
       
        var x = 3 --> let x = 3; (when possible)
        */
        if (
          child.type === "VariableDeclaration" &&
          (child.kind as string) === "var"
        ) {
          registerBindings(child);

          replace(
            astMakeExpressionStatement({
              type: "AssignmentExpression",
              operator: "=",
              left: child.declarations[0].id,
              right: child.declarations[0].init,
              ...getLoc(child),
            })
          );
        }

        /*
        for (var x of y) {} --> let x; ... for(x of y) {}
        */
        if (
          (child.type === "ForInStatement" ||
            child.type === "ForOfStatement") &&
          child.left.type === "VariableDeclaration" &&
          (child.left.kind as string) === "var"
        ) {
          registerBindings(child.left);

          child.left = structuredClone(child.left.declarations[0].id);
        }

        /*
         * for (var i = 0; ...) --> let i; ... for (i = 0)
         */
        if (
          child.type === "ForStatement" &&
          child.init?.type === "VariableDeclaration" &&
          (child.init.kind as string) === "var"
        ) {
          registerBindings(child.init);

          child.init = {
            type: "AssignmentExpression",
            operator: "=",
            left: child.init.declarations[0].id,
            right: child.init.declarations[0].init,
            ...getLoc(child),
          };
        }

        recurse(child);
      }
    } else {
      for (const child of astNaiveChildren(node)) {
        recurse(child);
      }
    }
  })(varScopeRoot);

  if (varDecls.size) {
    const asLet = [...varDecls.values()].flatMap((id) => {
      if (paramNames.includes(id.name)) return [];

      return astMakeLet(id, structuredClone(id), astMakeUndefined(id));
    });

    varScopeRoot.body.unshift(...asLet);
  }
}

function hoistFunc(func: Function) {
  hoistLegacyVar(
    func.body,
    astPatternAssignedBindings(func.params).map((id) => id.name)
  );
}
