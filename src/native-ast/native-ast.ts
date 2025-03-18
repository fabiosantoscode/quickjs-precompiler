export interface NASTProgram {
  type: "NASTProgram";
  toplevel: NASTExpression;
}

export type NASTType =
  | { type: "null" }
  | { type: "undefined" }
  | { type: "number" }
  | { type: "numeric" }
  | { type: "bigint" }
  | { type: "string" }
  | { type: "struct"; structFields: Record<string, NASTType> }
  | { type: "array"; contents: NASTType }
  | { type: "tuple"; contents: NASTType[] }
  // TODO function types are more tricky than this in native environments. Figure it out later.
  | { type: "function"; params: NASTType[]; returns: NASTType }
  | { type: "optional"; contents: NASTType };

export type NASTExpression =
  | NASTFunction
  | NASTStructDefinition
  | NASTDo
  | NASTBlock
  | NASTLoop
  | NASTJump
  | NASTUnary
  | NASTBinary
  | NASTComparison
  | NASTUnary
  | NASTCall
  | NASTAssignment
  | NASTIf
  | NASTSwitchCase
  | NASTVariableDeclaration
  | NASTReturn
  | NASTThrow
  | NASTIdentifier
  | NASTLiteral;

export type NASTNode = NASTProgram | NASTExpression;

interface _NASTNodeCommon {
  loc: SourceLocation;
}

export interface NASTFunction extends _NASTNodeCommon {
  type: "NASTFunction";
  uniqueName: string;
  returnType: NASTType;
  parameters: Record<string, NASTType>;
  body: NASTExpression;
}

export interface NASTDeclaration extends _NASTNodeCommon {
  type: "NASTDeclaration";
  declarationType: NASTType;
  uniqueName: string;
}

export interface NASTIdentifier extends _NASTNodeCommon {
  type: "NASTIdentifier";
  uniqueName: string;
}

export interface NASTDo extends _NASTNodeCommon {
  type: "NASTDo";
  body: NASTExpression[];
}

/** A set of statements that can be a target of "break" */
export interface NASTBlock extends _NASTNodeCommon {
  type: "NASTBlock";
  uniqueLabel: string;
  body: NASTExpression;
}

/** Just like NASTBlock but can be a target of "continue" as well as "break" */
export interface NASTLoop extends _NASTNodeCommon {
  type: "NASTLoop";
  uniqueLabel: string;
  body: NASTExpression;
}

export interface NASTJump extends _NASTNodeCommon {
  type: "NASTJump";
  jumpDirection: "break" | "continue";
  uniqueLabel: string;
}

export interface NASTLiteral extends _NASTNodeCommon {
  type: "NASTLiteral";
  value: string | number | boolean;
}

export interface NASTStructDefinition extends _NASTNodeCommon {
  type: "NASTStructDefinition";
  name: string;
  fields: Record<string, NASTType>;
}

export interface NASTBinary extends _NASTNodeCommon {
  type: "NASTBinary";
  operator: "+" | "-" | "*" | "/" | "%";
  left: NASTExpression;
  right: NASTExpression;
}

export interface NASTComparison extends _NASTNodeCommon {
  type: "NASTComparison";
  operator: "<" | "<=" | ">" | ">=";
  left: NASTExpression;
  right: NASTExpression;
}

export interface NASTUnary extends _NASTNodeCommon {
  type: "NASTUnary";
  operator: "+" | "-" | "!" | "~";
  operand: NASTExpression;
}

export interface NASTCall extends _NASTNodeCommon {
  type: "NASTCall";
  callee: NASTIdentifier;
  arguments: NASTExpression[];
}

export interface NASTAssignment extends _NASTNodeCommon {
  type: "NASTAssignment";
  target: NASTIdentifier;
  value: NASTExpression;
}

export interface NASTIf extends _NASTNodeCommon {
  type: "NASTIf";
  condition: NASTExpression;
  trueBranch: NASTExpression;
  falseBranch?: NASTExpression;
}

export interface NASTSwitchCase extends _NASTNodeCommon {
  type: "NASTSwitchCase";
  discriminant: NASTExpression;
  cases: Array<{
    test: NASTExpression;
    body: NASTExpression;
  }>;
  defaultCase: NASTExpression;
}

export interface NASTVariableDeclaration extends _NASTNodeCommon {
  type: "NASTVariableDeclaration";
  declaration: NASTDeclaration;
  initialValue: NASTExpression;
}

export interface NASTReturn extends _NASTNodeCommon {
  type: "NASTReturn";
  value: NASTExpression;
}

export interface NASTThrow extends _NASTNodeCommon {
  type: "NASTThrow";
  value: NASTExpression;
}

export interface SourceLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}
