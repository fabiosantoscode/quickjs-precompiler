import { getLoc, iterateReassignable } from "../../utils";
import {
  astIsBodyArrayHaver,
  astNaiveChildrenReassignable,
  isFunction,
} from "../ast-traversal";
import {
  AnyNode,
  Program,
  StatementOrDeclaration,
  VariableDeclaration,
} from "../augmented-ast";
import { HygienicNames } from "../hygienic-names";

export function removeFunctionsFromExpressions(root: Program) {
  const names = HygienicNames.forProgram(root, "inlineFunc_");
  doBody(names, root.body);
}

function doBody(names: HygienicNames, body: StatementOrDeclaration[]) {
  for (const { value: statement, prepend } of iterateReassignable(body)) {
    if (
      statement.type === "VariableDeclaration" &&
      isFunction(statement.declarations[0].init)
    ) {
      const toPrepend = doNotBody(names, statement.declarations[0].id);
      prepend(...toPrepend);
      doBody(names, statement.declarations[0].init.body.body);
    } else {
      const toPrepend = doNotBody(names, statement);
      prepend(...toPrepend);
    }
  }
}

function doNotBody(
  names: HygienicNames,
  node: AnyNode,
  foundFunctions: VariableDeclaration[] = []
) {
  if (astIsBodyArrayHaver(node)) {
    doBody(names, node.body);
    return [];
  }

  for (const { value: child, replace } of astNaiveChildrenReassignable(node)) {
    if (isFunction(child)) {
      const hygienicName = names.create(child.id?.name);
      const loc = getLoc(child);
      foundFunctions.push({
        type: "VariableDeclaration",
        kind: "const",
        declarations: [
          {
            type: "VariableDeclarator",
            id: {
              type: "Identifier",
              name: hygienicName,
              uniqueName: "",
              isReference: "declaration",
              ...loc,
            },
            init: child,
            ...loc,
          },
        ],
        ...loc,
      });

      replace({
        type: "Identifier",
        name: hygienicName,
        uniqueName: "",
        isReference: "reference",
        ...loc,
      });
    }

    doNotBody(names, child, foundFunctions);
  }

  return foundFunctions;
}