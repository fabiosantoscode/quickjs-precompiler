import { invariant } from "../utils";
import { astNaiveTraversal } from "./ast-traversal";
import { Program } from "./augmented-ast";

/**
 * Generates hygienic names in a program. All new names are unique.
 */
export class HygienicNames {
  counter = 1;
  prefix = "";
  takenNames = new Set();

  static forProgram(program: Program, prefix: string) {
    const ret = new HygienicNames();
    ret.prefix = prefix;

    invariant(prefix.endsWith("_"));

    for (const node of astNaiveTraversal(program)) {
      if (node.type === "Identifier" && node.name.startsWith(prefix)) {
        ret.takenNames.add(node.name);
      }
    }

    return ret;
  }

  create(suggestName: string | undefined) {
    let pfx = this.prefix;
    let suffix = suggestName ? "_" + suggestName : "";

    do {
      var unique = pfx + this.counter++ + suffix;
    } while (this.takenNames.has(unique));

    this.takenNames.add(unique);
    return unique;
  }
}
