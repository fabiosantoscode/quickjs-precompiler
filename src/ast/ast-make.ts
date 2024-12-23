import { getLoc } from "../utils";
import {
  AnyNode,
  BlockStatement,
  Expression,
  ExpressionStatement,
  Identifier,
  isExpression,
  Pattern,
  Statement,
  VariableDeclaration,
} from "./augmented-ast";

export function astMakeUndefined(originNode: AnyNode): Identifier {
  return {
    type: "Identifier",
    name: "undefined",
    uniqueName: "undefined@global",
    isReference: "reference",
    ...getLoc(originNode),
  };
}

export function astMakeExpressionStatement(
  expression: Expression
): ExpressionStatement {
  return {
    type: "ExpressionStatement",
    expression,
    ...getLoc(expression),
  };
}

export function astMakeBlockOfOne(
  statement: Statement | Expression
): BlockStatement {
  if (statement.type === "BlockStatement") {
    return statement;
  }
  return {
    type: "BlockStatement",
    body: [
      isExpression(statement)
        ? astMakeExpressionStatement(statement)
        : statement,
    ],
    ...getLoc(statement),
  };
}

export function astMakeLet(
  originNode: AnyNode,
  left: Pattern,
  right: Expression
): VariableDeclaration {
  return {
    type: "VariableDeclaration",
    kind: "let",
    declarations: [
      {
        type: "VariableDeclarator",
        id: left,
        init: right,
        ...getLoc(originNode),
      },
    ],
    ...getLoc(originNode),
  };
}

export function astMakeConst(
  originNode: AnyNode,
  left: Pattern,
  right: Expression
): VariableDeclaration {
  return {
    type: "VariableDeclaration",
    kind: "const",
    declarations: [
      {
        type: "VariableDeclarator",
        id: left,
        init: right,
        ...getLoc(originNode),
      },
    ],
    ...getLoc(originNode),
  };
}
