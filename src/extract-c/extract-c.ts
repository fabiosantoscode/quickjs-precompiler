import {
  astFindFunctions,
  astRawTraversal,
  goIntoStatements,
  goThroughAll,
  isFunction,
} from "../ast/ast-traversal";
import {
  Function,
  isExpression,
  Program,
  StatementOrDeclaration,
} from "../ast/augmented-ast";
import { HygienicNames } from "../ast/hygienic-names";
import { TypeEnvironment } from "../typing/type-environment";
import { deepFreezeIfTesting, defined, invariant } from "../utils";
import { nodeToC } from "../to-c/node-type-to-c";

export function extractCFromProgram(
  mutProgram: Program
): [Program, StatementOrDeclaration[]] {
  const decls = new _CExtractor(mutProgram).extractDeclarationsInProgram();
  deepFreezeIfTesting(mutProgram);
  return [mutProgram, decls];
}

export class _CExtractor {
  env: TypeEnvironment;
  hygienicNames: HygienicNames;

  constructor(public mutProgram: Program) {
    this.env = TypeEnvironment.forProgram(mutProgram);
    this.hygienicNames = HygienicNames.forProgram(
      this.mutProgram,
      "c_binding_"
    );
  }

  findCAbleInProgram() {
    const bodies: (Program | Function)[] = [];

    const findCAbleBranches = (node: Program | Function): boolean => {
      const functionsWithin = astFindFunctions(node, false).map(
        (node) => [node, findCAbleBranches(node)] as const
      );

      const thisBody = node.type === "Program" ? node.body : node.body.body;
      const fullyC = functionsWithin.every(([_, isCAble]) => isCAble);
      const selfC = this.findCAbleInBody(thisBody);

      // If we're fully C-able, then the parent function will handle partially C-able stuff.
      if (fullyC && selfC) {
        return true;
      } else {
        for (const [node, isCAble] of functionsWithin) {
          if (isCAble) bodies.push(node);
        }
        // Partially C-able
        return false;
      }
    };

    const wholeProgramIsCAble = findCAbleBranches(this.mutProgram);
    if (wholeProgramIsCAble) {
      invariant(bodies.length === 0);
      bodies.push(this.mutProgram);
    }

    return bodies;
  }

  findCAbleInBody(body: StatementOrDeclaration[]) {
    let fullyTransformable = true;

    for (const outerStat of body) {
      for (const node of [
        outerStat,
        ...astRawTraversal(
          outerStat,
          { ...goIntoStatements, expressions: true, functions: false },
          { ...goThroughAll, expressions: true }
        ),
      ]) {
        if (
          isFunction(node) ||
          (node.type === "VariableDeclaration" &&
            isFunction(node.declarations[0].init))
        ) {
          continue;
        }

        const toC = nodeToC[node.type];
        // an absent canTransform is merely the node.type check
        const canTransform =
          toC &&
          (!toC.canTransform ||
            toC.canTransform(node, this.env, this.hygienicNames));

        if (!canTransform) {
          fullyTransformable = false;
        }

        if (isExpression(node) && !this.env.getNodeType(node)) {
          fullyTransformable = false;
        }
      }
    }

    return fullyTransformable;
  }

  extractDeclarationsInProgram() {
    const cAble = this.findCAbleInProgram();

    if (cAble.length === 1 && cAble[0].type === "Program") {
      // EVERYTHING IS C
      invariant(
        false,
        "TODO create a main() function, followed by everything else"
      );
    } else {
      const declarations = [];

      for (const func of cAble) {
        invariant(
          func.type !== "Program",
          "When the whole program is C-able, it will be the only thing in the array"
        );

        const extractor = defined(nodeToC[func.type]);
        declarations.push(
          extractor.intoCDeclarations!(func, this.env, this.hygienicNames)
        );
      }

      return declarations.flat(1);
    }
  }
}
