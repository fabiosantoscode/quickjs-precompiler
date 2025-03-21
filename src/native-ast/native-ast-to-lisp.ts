import { statementTypes } from "../ast/augmented-ast";
import { invariant } from "../utils";
import { NASTExpression, NASTFunction, NASTNode, NASTProgram, NASTType } from "./native-ast";

export function nastToLisp(root: NASTExpression | NASTProgram): string {
  if (root.type === "NASTProgram") {
    return expandDo(root.toplevel, 0, false);
  } else {
    return expandDo(root, 0, false);
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

function statementToLisp(node: NASTNode | string, indent: number, breakSingleStatDo = false): string {
  if (typeof node === 'string') return node

  const splatDo = (maybeDo: NASTNode) => maybeDo.type === 'NASTDo' ? maybeDo.body : [maybeDo]
  const indentStr = () => "  ".repeat(indent)
  const form = (head: string, ...contents: Array<NASTNode | string | null | undefined>) => {
    head = '(' + head
    for (const it of contents) if (it) {
      head += ' ' + statementToLisp(it, indent)
    }
    return head + ')'
  }
  const formMultiline = (head: string, ...contents: Array<NASTNode | string | null | undefined>) => {
    head = '(' + head
    for (const it of contents) if (it) {
      head += '\n' + '  '.repeat(indent + 1) + statementToLisp(it, indent + 1)
    }
    return head + ')'
  }
  const formMultilineHeaded = (head: string, sameLineArg: string | NASTNode, ...contents: Array<NASTNode | string | null | undefined>) => {
    head = '(' + head + ' ' + statementToLisp(sameLineArg, indent + 1)
    for (const it of contents) if (it) {
      head += '\n' + '  '.repeat(indent + 1) + statementToLisp(it, indent + 1)
    }
    return head + ')'
  }
  switch (node.type) {
    case "NASTProgram":
      invariant(indent === 0);
      return statementToLisp(node.toplevel, 0);
    case "NASTDo":
      if (breakSingleStatDo && node.body.length === 1) {
        return statementToLisp(node.body[0], indent, true)
      }
      return formMultiline('do', ...node.body)
    case "NASTVariableDeclaration":
      return form('declare', typeToLisp(node.declaration.declarationType), node.declaration.uniqueName, node.initialValue)
    case "NASTAssignment":
      return form('assign', node.target, node.value)
    case "NASTIf":
      return formMultilineHeaded(
        'if',
        node.condition,
        statementToLisp(node.trueBranch, indent + 1, true),
        isEmptyNAST(node.falseBranch) ? null : statementToLisp(node.falseBranch!, indent + 1, true)
      )
    case "NASTIfExpression":
      return formMultilineHeaded(
        'if',
        node.condition,
        statementToLisp(node.trueBranch, indent + 1, true),
        isEmptyNAST(node.falseBranch) ? null : statementToLisp(node.falseBranch!, indent + 1, true)
      )
    case "NASTSwitchCase":
      return formMultilineHeaded(
        'switch',
        node.discriminant,
        ...node.cases.map(node => `${statementToLisp(node.test, indent + 1)} ${statementToLisp(node.body, indent + 1)}`),
        `default ${statementToLisp(node.defaultCase, indent + 1)}`
      )
    case "NASTLoop":
      return formMultiline(
        `loop (${node.uniqueLabel})`,
        ...splatDo(node.body)
      )
    case "NASTJump":
      return form(node.jumpDirection, node.uniqueLabel)
    case "NASTLiteralString":
      return JSON.stringify(node.value)
    case "NASTLiteralNumber":
    case "NASTLiteralBoolean":
    case "NASTLiteralNullish":
      return `${node.value}`
    case "NASTLiteralUninitialized":
      return `(uninitialized)`
    case "NASTArray":
      if (node.initialItems.length || node.initialLength?.type === 'NASTLiteralNumber' && node.initialLength.value === 0) {
        return `[${node.initialItems.map(item => statementToLisp(item, indent + 1)).join(' ')}]`
      } else {
        return form('new Array', node.initialLength)
      }
    case "NASTNumericMemberWrite":
      return form('assign-in', node.object, node.property, node.newValue)
    case "NASTIdentifier":
      return node.uniqueName;
    case "NASTIdentifierToReference":
      return '&' + node.uniqueName;
    case "NASTArrayAccessToReference":
      return form('array-ref', node.object, node.property)
    case "NASTPropertyAccessToReference":
      return form('property-ref', node.object, node.property)
    case "NASTPtrGet":
      return form('ptr-get', node.target)
    case "NASTPtrSet":
      return form('ptr-set', node.target, node.value)
    case "NASTStringConcatenation":
      return form("string-concatenation", node.left, node.right)
    case "NASTBinary":
    case "NASTFloatComparison":
      return form(node.operator, node.left, node.right)
    case "NASTUnary":
      return form(node.operator, node.operand)
    case "NASTIncrementPtrTarget":
      return form(
        node.isDecrement ? (node.isPostfix ? 'get-and-decr' : 'decr') : (node.isPostfix ? 'get-and-incr' : 'incr'),
        node.operand,
      )
    case "NASTConversion":
      return form(node.convType, node.input)
    case "NASTFunction":
      return functionToLisp(node, indent);
    case "NASTCall":
      return form('call', node.callee.uniqueName, ...node.arguments)
    case "NASTReturn":
      return form('return', node.value)
    case "NASTThrow":
      return form('throw', node.value)
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
    case "function":
      return `(function ${typeToLisp(type.returns)} (${type.params.map(p => typeToLisp(p)).join(' ')}))`
    default:
      throw new Error(`Unsupported type: ${(type as any).type}`);
  }
}

function isEmptyNAST(node: NASTNode | null | undefined) {
  return !node || node.type === 'NASTDo' && node.body.length === 0
}
