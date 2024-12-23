import { BlockStatement } from "../ast/augmented-ast";
import { Type } from "../typing/type";

export type CDeclaration =
  | CFunctionDeclaration
  | CVariableDeclaration
  | CStructDeclaration;

export interface CFunctionDeclaration {
  type: "CFunctionDeclaration";
  cName: string;
  params: Record<string, Type>;
  retType: Type;
  cBody: BlockStatement;
}

export interface CVariableDeclaration {
  type: "CVariableDeclaration";
  cName: string;
  varType: Type;
}

export interface CStructDeclaration {
  type: "CStructDeclaration";
  cName: string;
  members: Record<string, Type>;
}
