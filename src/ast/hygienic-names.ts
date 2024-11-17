import { invariant } from "../utils";
import { astNaiveTraversal } from "./ast-traversal";
import { Program } from "./augmented-ast";

/**
 * Generates hygienic names in a program. All new names are unique.
 */
export class HygienicNames {
  counter = 1;
  prefix = "";
  takenNames: Set<string> | Set<string>[] = new Set();

  private constructor() {}

  static forProgram(program: Program, prefix: string) {
    const ret = new HygienicNames();
    ret.prefix = prefix;

    invariant(prefix.endsWith("_"));

    for (const node of astNaiveTraversal(program)) {
      if (node.type === "Identifier" && node.name.startsWith(prefix)) {
        ret.addTaken(node.name);
      }
    }

    return ret;
  }

  create(suggestName?: string) {
    let pfx = this.prefix;
    let suffix = suggestName ? "_" + suggestName : "";

    do {
      var unique = pfx + this.counter++ + suffix;
    } while (this.isUniqueNameTaken(unique));

    this.addTaken(unique);
    return unique;
  }

  private addTaken(unique: string) {
    if (this.takenNames instanceof Set) {
      this.takenNames.add(unique);
    } else {
      this.takenNames[this.takenNames.length - 1].add(unique);
    }
  }

  private isUniqueNameTaken(unique: string) {
    if (this.takenNames instanceof Set) {
      return this.takenNames.has(unique);
    } else {
      return this.takenNames.some((names) => names.has(unique));
    }
  }
}
