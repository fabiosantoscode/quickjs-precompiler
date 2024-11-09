// Copied from acorn's type defs
// Search for "AUGMENTED" to find changes

// AUGMENTED: closure info
export interface TrackedBinding {
  name: string;
  kind: "var" | "let" | "const";
  uniqueName: string;
  assignments: number;
  references: number;
  /** How many times we were referred to, purely as callees */
  callReferences?: number;
  possibleMutations: number;
  closure: TrackedClosure;
}

// AUGMENTED: closure info
export interface TrackedClosure {
  id: number;
  name?: string;
  kind: "var" | "let";
  node: Program | Function;
  children: TrackedClosure[];
  parent?: TrackedClosure;
  variables: Map<string, TrackedBinding>;
}

export interface Node {
  start: number;
  end: number;
  type: string;
  range?: [number, number];
  loc: SourceLocation; // AUGMENTED: it's always present
}

export interface SourceLocation {
  source: string; // AUGMENTED: it's always present, but might be "unknown"
  start: Position;
  end: Position;
}

export interface Position {
  /** 1-based */
  line: number;
  /** 0-based */
  column: number;
}

export interface Identifier extends Node {
  type: "Identifier";
  name: string;
  isReference?: "reference" | "declaration"; // AUGMENTED: is this identifier referring or defining a variable?
  uniqueName: string; // AUGMENTED
}

export interface Literal extends Node {
  type: "Literal";
  value?: string | boolean | null | number | RegExp | bigint;
  raw?: string;
  regex?: {
    pattern: string;
    flags: string;
  };
  bigint?: string;
}

export interface Program extends Node {
  type: "Program";
  body: Array<Statement | ModuleDeclaration>;
  sourceType: "script" | "module";
  closureInfo: TrackedClosure; // AUGMENTED
  allClosures: TrackedClosure[]; // AUGMENTED
  allBindings: Map<string, TrackedBinding>; // AUGMENTED
}

export interface Function extends Node {
  id?: Identifier | null;
  params: Array<Pattern>;
  body: BlockStatement; // AUGMENTED: we turn ()=>x into ()=>{return x}
  generator: boolean;
  expression: boolean;
  async: boolean;
  closureInfo: TrackedClosure; // AUGMENTED
}

export interface ExpressionStatement extends Node {
  type: "ExpressionStatement";
  expression: Expression | Literal;
  directive?: string;
}

export interface BlockStatement extends Node {
  type: "BlockStatement";
  body: Array<Statement>;
}

export interface EmptyStatement extends Node {
  type: "EmptyStatement";
}

export interface DebuggerStatement extends Node {
  type: "DebuggerStatement";
}

export interface WithStatement extends Node {
  type: "WithStatement";
  object: Expression;
  body: Statement;
}

export interface ReturnStatement extends Node {
  type: "ReturnStatement";
  argument?: Expression | null;
}

export interface LabeledStatement extends Node {
  type: "LabeledStatement";
  label: Identifier;
  body: Statement;
}

export interface BreakStatement extends Node {
  type: "BreakStatement";
  label?: Identifier | null;
}

export interface ContinueStatement extends Node {
  type: "ContinueStatement";
  label?: Identifier | null;
}

export interface IfStatement extends Node {
  type: "IfStatement";
  test: Expression;
  consequent: Statement;
  alternate?: Statement | null;
}

export interface SwitchStatement extends Node {
  type: "SwitchStatement";
  discriminant: Expression;
  cases: Array<SwitchCase>;
}

export interface SwitchCase extends Node {
  type: "SwitchCase";
  test?: Expression | null;
  consequent: Array<Statement>;
}

export interface ThrowStatement extends Node {
  type: "ThrowStatement";
  argument: Expression;
}

export interface TryStatement extends Node {
  type: "TryStatement";
  block: BlockStatement;
  handler?: CatchClause | null;
  finalizer?: BlockStatement | null;
}

export interface CatchClause extends Node {
  type: "CatchClause";
  param?: Pattern | null;
  body: BlockStatement;
}

export interface WhileStatement extends Node {
  type: "WhileStatement";
  test: Expression;
  body: Statement;
}

export interface DoWhileStatement extends Node {
  type: "DoWhileStatement";
  body: Statement;
  test: Expression;
}

export interface ForStatement extends Node {
  type: "ForStatement";
  init?: VariableDeclaration | Expression | null;
  test?: Expression | null;
  update?: Expression | null;
  body: Statement;
}

export interface ForInStatement extends Node {
  type: "ForInStatement";
  left: VariableDeclaration | Pattern;
  right: Expression;
  body: Statement;
}

export interface FunctionDeclaration extends Function {
  type: "FunctionDeclaration";
  id: Identifier;
  body: BlockStatement;
}

export interface VariableDeclaration extends Node {
  type: "VariableDeclaration";
  declarations: readonly [VariableDeclarator]; // AUGMENTED: just one decl
  kind: "var" | "let" | "const";
}

export interface VariableDeclarator extends Node {
  type: "VariableDeclarator";
  id: Pattern;
  init: Expression; // AUGMENTED: always present
}

export interface ThisExpression extends Node {
  type: "ThisExpression";
}

export interface ArrayExpression extends Node {
  type: "ArrayExpression";
  elements: Array<Expression | SpreadElement | null>;
}

export interface ObjectExpression extends Node {
  type: "ObjectExpression";
  properties: Array<Property | SpreadElement>;
}

export interface Property extends Node {
  type: "Property";
  key: Expression;
  value: Expression;
  kind: "init" | "get" | "set";
  method: boolean;
  shorthand: boolean;
  computed: boolean;
}

export interface FunctionExpression extends Function {
  type: "FunctionExpression";
  body: BlockStatement;
}

export interface UnaryExpression extends Node {
  type: "UnaryExpression";
  operator: UnaryOperator;
  prefix: boolean;
  argument: Expression;
}

export type UnaryOperator =
  | "-"
  | "+"
  | "!"
  | "~"
  | "typeof"
  | "void"
  | "delete";

export interface UpdateExpression extends Node {
  type: "UpdateExpression";
  operator: UpdateOperator;
  argument: Expression;
  prefix: boolean;
}

export type UpdateOperator = "++" | "--";

export interface BinaryExpression extends Node {
  type: "BinaryExpression";
  operator: BinaryOperator;
  left: Expression | PrivateIdentifier;
  right: Expression;
}

export type BinaryOperator =
  | "=="
  | "!="
  | "==="
  | "!=="
  | "<"
  | "<="
  | ">"
  | ">="
  | "<<"
  | ">>"
  | ">>>"
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "|"
  | "^"
  | "&"
  | "in"
  | "instanceof"
  | "**";

export interface AssignmentExpression extends Node {
  type: "AssignmentExpression";
  operator: AssignmentOperator;
  left: Pattern;
  right: Expression;
}

export type AssignmentOperator =
  | "="
  | "+="
  | "-="
  | "*="
  | "/="
  | "%="
  | "<<="
  | ">>="
  | ">>>="
  | "|="
  | "^="
  | "&="
  | "**="
  | "||="
  | "&&="
  | "??=";

export interface LogicalExpression extends Node {
  type: "LogicalExpression";
  operator: LogicalOperator;
  left: Expression;
  right: Expression;
}

export type LogicalOperator = "||" | "&&" | "??";

export interface MemberExpression extends Node {
  type: "MemberExpression";
  object: Expression | Super;
  property: Expression | PrivateIdentifier;
  computed: boolean;
  optional: boolean;
}

export interface ConditionalExpression extends Node {
  type: "ConditionalExpression";
  test: Expression;
  alternate: Expression;
  consequent: Expression;
}

export interface CallExpression extends Node {
  type: "CallExpression";
  callee: Expression | Super;
  arguments: Array<Expression | SpreadElement>;
  optional: boolean;
}

export interface NewExpression extends Node {
  type: "NewExpression";
  callee: Expression;
  arguments: Array<Expression | SpreadElement>;
}

export interface SequenceExpression extends Node {
  type: "SequenceExpression";
  expressions: Array<Expression>;
}

export interface ForOfStatement extends Node {
  type: "ForOfStatement";
  left: VariableDeclaration | Pattern;
  right: Expression;
  body: Statement;
  await: boolean;
}

export interface Super extends Node {
  type: "Super";
}

export interface SpreadElement extends Node {
  type: "SpreadElement";
  argument: Expression;
}

export interface ArrowFunctionExpression extends Function {
  type: "ArrowFunctionExpression";
}

export interface YieldExpression extends Node {
  type: "YieldExpression";
  argument?: Expression | null;
  delegate: boolean;
}

export interface TemplateLiteral extends Node {
  type: "TemplateLiteral";
  quasis: Array<TemplateElement>;
  expressions: Array<Expression>;
}

export interface TaggedTemplateExpression extends Node {
  type: "TaggedTemplateExpression";
  tag: Expression;
  quasi: TemplateLiteral;
}

export interface TemplateElement extends Node {
  type: "TemplateElement";
  tail: boolean;
  value: {
    cooked?: string | null;
    raw: string;
  };
}

export interface AssignmentProperty extends Node {
  type: "Property";
  key: Expression;
  value: Pattern;
  kind: "init";
  method: false;
  shorthand: boolean;
  computed: boolean;
}

export interface ObjectPattern extends Node {
  type: "ObjectPattern";
  properties: Array<AssignmentProperty | RestElement>;
}

export interface ArrayPattern extends Node {
  type: "ArrayPattern";
  elements: Array<Pattern | null>;
}

export interface RestElement extends Node {
  type: "RestElement";
  argument: Pattern;
}

export interface AssignmentPattern extends Node {
  type: "AssignmentPattern";
  left: Pattern;
  right: Expression;
}

export interface Class extends Node {
  id?: Identifier | null;
  superClass?: Expression | null;
  body: ClassBody;
}

export interface ClassBody extends Node {
  type: "ClassBody";
  body: Array<MethodDefinition | PropertyDefinition | StaticBlock>;
}

export interface MethodDefinition extends Node {
  type: "MethodDefinition";
  key: Expression | PrivateIdentifier;
  value: FunctionExpression;
  kind: "constructor" | "method" | "get" | "set";
  computed: boolean;
  static: boolean;
}

export interface ClassDeclaration extends Class {
  type: "ClassDeclaration";
  id: Identifier;
}

export interface ClassExpression extends Class {
  type: "ClassExpression";
}

export interface MetaProperty extends Node {
  type: "MetaProperty";
  meta: Identifier;
  property: Identifier;
}

export interface ImportDeclaration extends Node {
  type: "ImportDeclaration";
  specifiers: Array<
    ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier
  >;
  source: Literal;
}

export interface ImportSpecifier extends Node {
  type: "ImportSpecifier";
  imported: Identifier | Literal;
  local: Identifier;
}

export interface ImportDefaultSpecifier extends Node {
  type: "ImportDefaultSpecifier";
  local: Identifier;
}

export interface ImportNamespaceSpecifier extends Node {
  type: "ImportNamespaceSpecifier";
  local: Identifier;
}

export interface ExportNamedDeclaration extends Node {
  type: "ExportNamedDeclaration";
  declaration?: Declaration | null;
  specifiers: Array<ExportSpecifier>;
  source?: Literal | null;
}

export interface ExportSpecifier extends Node {
  type: "ExportSpecifier";
  exported: Identifier | Literal;
  local: Identifier | Literal;
}

export interface AnonymousFunctionDeclaration extends Function {
  type: "FunctionDeclaration";
  id: null;
  body: BlockStatement;
}

export interface AnonymousClassDeclaration extends Class {
  type: "ClassDeclaration";
  id: null;
}

export interface ExportDefaultDeclaration extends Node {
  type: "ExportDefaultDeclaration";
  declaration:
    | AnonymousFunctionDeclaration
    | FunctionDeclaration
    | AnonymousClassDeclaration
    | ClassDeclaration
    | Expression;
}

export interface ExportAllDeclaration extends Node {
  type: "ExportAllDeclaration";
  source: Literal;
  exported?: Identifier | Literal | null;
}

export interface AwaitExpression extends Node {
  type: "AwaitExpression";
  argument: Expression;
}

export interface ChainExpression extends Node {
  type: "ChainExpression";
  expression: MemberExpression | CallExpression;
}

export interface ImportExpression extends Node {
  type: "ImportExpression";
  source: Expression;
}

/* AUGMENTED: this is never present
export interface ParenthesizedExpression extends Node {
  type: "ParenthesizedExpression";
  expression: Expression;
} */

export interface PropertyDefinition extends Node {
  type: "PropertyDefinition";
  key: Expression | PrivateIdentifier;
  value?: Expression | null;
  computed: boolean;
  static: boolean;
}

export interface PrivateIdentifier extends Node {
  type: "PrivateIdentifier";
  name: string;
}

export interface StaticBlock extends Node {
  type: "StaticBlock";
  body: Array<Statement>;
}

export type Statement =
  | ExpressionStatement
  | BlockStatement
  | EmptyStatement
  | DebuggerStatement
  | WithStatement
  | ReturnStatement
  | LabeledStatement
  | BreakStatement
  | ContinueStatement
  | IfStatement
  | SwitchStatement
  | ThrowStatement
  | TryStatement
  | WhileStatement
  | DoWhileStatement
  | ForStatement
  | ForInStatement
  | ForOfStatement
  | Declaration;

export type Declaration =
  | FunctionDeclaration
  | VariableDeclaration
  | ClassDeclaration;

export type Expression =
  | Identifier
  | Literal
  | ThisExpression
  | ArrayExpression
  | ObjectExpression
  | FunctionExpression
  | UnaryExpression
  | UpdateExpression
  | BinaryExpression
  | AssignmentExpression
  | LogicalExpression
  | MemberExpression
  | ConditionalExpression
  | CallExpression
  | NewExpression
  | SequenceExpression
  | ArrowFunctionExpression
  | YieldExpression
  | TemplateLiteral
  | TaggedTemplateExpression
  | ClassExpression
  | MetaProperty
  | AwaitExpression
  | ChainExpression
  | ImportExpression;
// AUGMENTED: this is never present: | ParenthesizedExpression

export type Pattern =
  | Identifier
  | MemberExpression
  | ObjectPattern
  | ArrayPattern
  | RestElement
  | AssignmentPattern;

export type ModuleDeclaration =
  | ImportDeclaration
  | ExportNamedDeclaration
  | ExportDefaultDeclaration
  | ExportAllDeclaration;

// AUGMENTED
export type ExpressionOrStatement =
  | Declaration
  | ModuleDeclaration
  | Expression
  | Statement;

export type AnyNode =
  | Statement
  | Expression
  | Declaration
  | ModuleDeclaration
  | Literal
  | Program
  | SwitchCase
  | CatchClause
  | Property
  | Super
  | SpreadElement
  | TemplateElement
  | AssignmentProperty
  | ObjectPattern
  | ArrayPattern
  | RestElement
  | AssignmentPattern
  | ClassBody
  | MethodDefinition
  | MetaProperty
  | ImportSpecifier
  | ImportDefaultSpecifier
  | ImportNamespaceSpecifier
  | ExportSpecifier
  | AnonymousFunctionDeclaration
  | AnonymousClassDeclaration
  | PropertyDefinition
  | PrivateIdentifier
  | StaticBlock
  | VariableDeclarator;

// AUGMENTED: nodes we care about here
export type AnyNode2 =
  | Program
  | FunctionDeclaration
  | AnonymousFunctionDeclaration
  | FunctionExpression
  | ArrowFunctionExpression
  | Statement
  | Expression
  | ModuleDeclaration
  | Super
  | Pattern;

// AUGMENTED: we should be able to know what is an expression
const expressionTypes = [
  "Identifier",
  "Literal",
  "ThisExpression",
  "ArrayExpression",
  "ObjectExpression",
  "FunctionExpression",
  "UnaryExpression",
  "UpdateExpression",
  "BinaryExpression",
  "AssignmentExpression",
  "LogicalExpression",
  "MemberExpression",
  "ConditionalExpression",
  "CallExpression",
  "NewExpression",
  "SequenceExpression",
  "ArrowFunctionExpression",
  "YieldExpression",
  "TemplateLiteral",
  "TaggedTemplateExpression",
  "ClassExpression",
  "MetaProperty",
  "AwaitExpression",
  "ChainExpression",
  "ImportExpression",
];
export const isExpression = (node: AnyNode): node is Expression =>
  expressionTypes.includes(node.type);
