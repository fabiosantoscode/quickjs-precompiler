import { invariant } from "../utils";
import {
  NASTExpression,
  NASTFunction,
  NASTNode,
  NASTProgram,
  NASTStructDefinition,
  NASTType,
} from "./native-ast";

export function nastToLisp(program: NASTExpression | NASTProgram): string {
  if (program.type === "NASTProgram") {
    return expandDo(program.toplevel, 0, false);
  } else {
    return expandDo(program, 0, false);
  }
}

// In some nodes we eliminate any wrapping (do ...), for readability
function expandDo(node: NASTNode, indent: number, leadingNewline = true) {
  const indentStr = "  ".repeat(indent);
  const head = leadingNewline ? "\n" + indentStr : "";
  if (node.type === "NASTDo") {
    return (
      head +
      node.body
        .map((bod) => statementToLisp(bod, indent))
        .join("\n" + indentStr)
    );
  } else {
    return head + statementToLisp(node, indent);
  }
}

function functionToLisp(func: NASTFunction, indent = 0): string {
  return `(function ${typeToLisp(func.returnType)} ${
    func.uniqueName
  } (${Object.entries(func.parameters)
    .map(([name, type]) => `${typeToLisp(type)} ${name}`)
    .join(" ")})${expandDo(func.body, 1)})`;
}

function structDefinitionToLisp(
  struct: NASTStructDefinition,
  indent = 0
): string {
  const fields = Object.entries(struct.fields)
    .map(([name, type]) => `${typeToLisp(type)} ${name}`)
    .join("\n  " + "  ".repeat(indent));
  return `(struct ${struct.name} (${fields}))`;
}

function statementToLisp(node: NASTNode, indent: number): string {
  switch (node.type) {
    case "NASTProgram":
      invariant(indent === 0);
      return nastToLisp(node.toplevel);
    case "NASTStructDefinition":
      return structDefinitionToLisp(node, indent);
    case "NASTDo":
      return `(do\n  ${node.body
        .map((n) => statementToLisp(n, indent + 1))
        .join("\n  ")})`;
    case "NASTVariableDeclaration":
      return `(declare ${typeToLisp(node.declaration.declarationType)} ${
        node.declaration.uniqueName
      } ${
        node.initialValue ? statementToLisp(node.initialValue, indent) : ""
      })`;
    case "NASTAssignment":
      return `(assign ${statementToLisp(node.target, indent)} ${statementToLisp(
        node.value,
        indent
      )})`;
    case "NASTIf":
      return `(if ${statementToLisp(
        node.condition,
        indent
      )}\n  ${statementToLisp(node.trueBranch, indent + 1)}${
        node.falseBranch
          ? `\n  (else\n    ${statementToLisp(node.falseBranch, indent + 1)})`
          : ""
      })`;
    case "NASTSwitchCase":
      return `(switch ${statementToLisp(
        node.discriminant,
        indent
      )}\n  ${"  ".repeat(indent)}${[
        ...node.cases.map(
          (node) =>
            `${statementToLisp(node.test, indent + 1)}${statementToLisp(
              node.body,
              indent + 1
            )}`
        ),
        `default ${statementToLisp(node.defaultCase, indent + 1)}`,
      ].join("\n" + "  ".repeat(indent))})`;
    case "NASTLiteral":
      if (typeof node === "string") {
        return JSON.stringify(node);
      }
      if (typeof node === "bigint") {
        return node + "n";
      }
      return `${node.value}`;
    case "NASTIdentifier":
      return node.uniqueName;
    case "NASTBinary":
    case "NASTComparison":
      return `(${node.operator} ${statementToLisp(
        node.left,
        indent
      )} ${statementToLisp(node.right, indent)})`;
    case "NASTUnary":
      return `(${node.operator} ${statementToLisp(node.operand, indent)})`;
    case "NASTFunction":
      return functionToLisp(node, indent);
    case "NASTCall":
      return `(call ${node.callee.uniqueName} ${node.arguments
        .map((n) => statementToLisp(n, indent))
        .join(" ")})`;
    case "NASTReturn":
      return `(return ${
        node.value ? statementToLisp(node.value, indent) : ""
      })`;
    case "NASTThrow":
      return `(throw ${node.value ? statementToLisp(node.value, indent) : ""})`;
    default:
      console.log(node);
      throw new Error(`Unsupported node type: ${(node as any).type}`);
  }
}

function typeToLisp(type: NASTType): string {
  switch (type.type) {
    case "number":
    case "numeric":
    case "string":
    case "bigint":
      return type.type;
    case "struct":
      return `(struct ${Object.entries(type.structFields)
        .map(([name, fieldType]) => `${typeToLisp(fieldType)} ${name}`)
        .join(" ")})`;
    case "array":
      return `(array ${typeToLisp(type.contents)})`;
    case "tuple":
      return `(tuple ${type.contents.map(typeToLisp).join(" ")})`;
    default:
      throw new Error(`Unsupported type: ${(type as any).type}`);
  }
}
