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
        for (const declarator of vardecl.declarations) {
          for (const id of astPatternAssignedBindings(declarator.id)) {
            if (!varDecls.has(id.name)) {
              varDecls.set(id.name, structuredClone(id));
            }
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

        if (child.type === "LabeledStatement") {
          const loop = child.body;
          /*
          for (var x of y) {} --> let x; ... for(x of y) {}
          */
          if (
            (loop.type === "ForInStatement" ||
              loop.type === "ForOfStatement") &&
            loop.left.type === "VariableDeclaration" &&
            (loop.left.kind as string) === "var"
          ) {
            registerBindings(loop.left);

            loop.left = structuredClone(loop.left.declarations[0].id);
          }

          /*
           * for (var i = 0; ...) --> let i; ... for (i = 0)
           */
          if (
            loop.type === "ForStatement" &&
            loop.init?.type === "VariableDeclaration" &&
            (loop.init.kind as string) === "var"
          ) {
            registerBindings(loop.init);

            loop.init = {
              type: "AssignmentExpression",
              operator: "=",
              left: loop.init.declarations[0].id,
              right: loop.init.declarations[0].init,
              ...getLoc(loop),
            };
          }
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
