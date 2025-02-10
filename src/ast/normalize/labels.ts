import { astMakeBlockOfOne } from "../ast-make";
import { astNaiveChildrenReassignable } from "../ast-traversal";
import { AnyNode, AnyNode2, isLoop, Program } from "../augmented-ast";
import { HygienicNames } from "../hygienic-names";

/**
 * Make sure labels always have a body
 */
export function normalizeLabels(root: Program) {
  const hygienicNames = HygienicNames.forProgram(root, "autoLabel_");

  (function recurse(parent: AnyNode) {
    for (const { value: node, replace } of astNaiveChildrenReassignable(
      parent
    )) {
      if (parent.type !== "LabeledStatement" && loopOrSwitch(node)) {
        // loop/switch always has a label parent
        const name = hygienicNames.create();
        const newParent: AnyNode2 = {
          type: "LabeledStatement",
          body: node,
          label: {
            type: "Identifier",
            name,
            uniqueName: name + "@1",
            loc: node.loc,
            start: node.start,
            end: node.start,
          },
          loc: node.loc,
          start: node.start,
          end: node.start,
        };
        recurse(newParent);
        replace(newParent);
      } else if (node.type === "LabeledStatement" && !loopOrSwitch(node.body)) {
        node.body = astMakeBlockOfOne(node.body);
        recurse(node);
      } else {
        recurse(node);
      }
    }
  })(root);
}

const loopOrSwitch = (node: AnyNode) =>
  isLoop(node) || node.type === "SwitchStatement";
