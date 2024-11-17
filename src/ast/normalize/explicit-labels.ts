import { getLoc, invariant, iterateReassignable } from "../../utils";
import { astMakeBlockOfOne } from "../ast-make";
import { astNaiveChildrenReassignable } from "../ast-traversal";
import { AnyNode, isStatement, Program, Statement } from "../augmented-ast";
import { HygienicNames } from "../hygienic-names";

/** Make implicit labels (`break;` and `continue;` without a label) become explicit */
export function explicitLabels(root: Program) {
  const names = HygienicNames.forProgram(root, "autoLabel_");

  let obviousBreak = "";
  let obviousContinue = "";

  function onNode(
    node: AnyNode,
    parent: AnyNode,
    replace: (newNode: any) => void
  ) {
    switch (node.type) {
      case "BreakStatement": {
        if (!node.label) {
          invariant(obviousBreak);
          node.label = {
            type: "Identifier",
            name: obviousBreak,
            uniqueName: "",
            isReference: undefined,
            ...getLoc(node),
          };
        }
        return;
      }
      case "ContinueStatement": {
        if (!node.label) {
          invariant(obviousContinue);
          node.label = {
            type: "Identifier",
            name: obviousContinue,
            uniqueName: "",
            isReference: undefined,
            ...getLoc(node),
          };
        }
        return;
      }
      case "SwitchStatement": {
        descend(node.discriminant);
        const prevObviousBreak = obviousBreak;
        obviousBreak = explicitifyBreakLabel(parent);
        node.cases.forEach((case_) => descend(case_));
        obviousBreak = prevObviousBreak;
        return;
      }
      case "WhileStatement":
      case "DoWhileStatement": {
        descend(node.test);
        const prevObviousBreak = obviousBreak;
        const prevObviousContinue = obviousContinue;
        obviousBreak = obviousContinue = explicitifyBreakLabel(parent);
        descend(node.body);
        obviousBreak = prevObviousBreak;
        obviousContinue = prevObviousContinue;
        return;
      }
      case "ForInStatement":
      case "ForOfStatement": {
        descend(node.left);
        descend(node.right);
        const prevObviousBreak = obviousBreak;
        const prevObviousContinue = obviousContinue;
        obviousBreak = obviousContinue = explicitifyBreakLabel(parent);
        descend(node.body);
        obviousBreak = prevObviousBreak;
        obviousContinue = prevObviousContinue;
        return;
      }
      case "ForStatement": {
        descend(node.init);
        descend(node.test);
        descend(node.update);
        const prevObviousBreak = obviousBreak;
        const prevObviousContinue = obviousContinue;
        obviousBreak = obviousContinue = explicitifyBreakLabel(parent);
        descend(node.body);
        obviousBreak = prevObviousBreak;
        obviousContinue = prevObviousContinue;
        return;
      }
      case "LabeledStatement": {
        // labels are indirect parents. let's pass through the parent
        invariant(node.body.type === "BlockStatement");

        for (const { value: child, replace } of iterateReassignable(
          node.body.body
        )) {
          onNode(child, node, replace);
        }
        return;
      }
      default: {
        for (const { value: child, replace } of astNaiveChildrenReassignable(
          node
        )) {
          onNode(child, node, replace);
        }
        return;
      }
    }

    function descend(child?: AnyNode | null) {
      if (child != null) {
        onNode(child, node, () => {
          invariant(false, "we should never have statements here");
        });
      }
    }

    function explicitifyBreakLabel(parentNode: AnyNode) {
      if (parentNode.type === "LabeledStatement") {
        return parentNode.label.name;
      } else {
        invariant(isStatement(node));
        const name = names.create();
        replace({
          type: "LabeledStatement",
          label: {
            type: "Identifier",
            name,
            uniqueName: "",
            isReference: undefined,
            ...getLoc(node),
          },
          body: astMakeBlockOfOne(node as Statement),
          ...getLoc(node),
        });
        return name;
      }
    }
  }

  for (const { value: item, replace } of iterateReassignable(root.body)) {
    onNode(item, root, replace);
  }
}
