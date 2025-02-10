import { defined } from "../utils";
import { astNaiveChildren } from "./ast-traversal";
import { AnyNode, Program } from "./augmented-ast";

const instances = new WeakMap<Program, Parents>();
export class Parents {
  #parents = new WeakMap<AnyNode, AnyNode>();

  static forProgram(program: Program) {
    if (!instances.has(program)) {
      instances.set(program, new Parents(program));
    }
    return defined(instances.get(program));
  }

  private constructor(program: Program) {
    const findParents = (parent: AnyNode) => {
      for (const node of astNaiveChildren(parent)) {
        this.#parents.set(node, parent);
        findParents(node);
      }
    };
    findParents(program);
  }

  getParent(node: AnyNode): AnyNode {
    return defined(this.#parents.get(node));
  }

  findParent(
    node: AnyNode,
    test: (node: AnyNode, parent: AnyNode) => boolean | undefined
  ): AnyNode | undefined {
    let parent = this.#parents.get(node);
    while (parent) {
      let pp = test(node, parent);
      if (pp === false) break;
      if (pp === true) return parent;
      node = parent;
      parent = this.#parents.get(node);
    }
    return undefined;
  }
}
