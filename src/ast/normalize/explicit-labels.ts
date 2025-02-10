import { getLoc, invariant } from "../../utils";
import { astNaiveChildren } from "../ast-traversal";
import { AnyNode, isLoop, Program } from "../augmented-ast";

/** Make implicit labels (`break;` and `continue;` without a label) become explicit */
export function explicitLabels(root: Program) {
  let obviousBreak = "";
  let obviousContinue = "";

  function onNode(node: AnyNode, parent: AnyNode) {
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
        if (node.body.type === "BlockStatement") {
          for (const child of node.body.body) {
            onNode(child, node);
          }
        } else {
          invariant(isLoop(node.body));

          onNode(node.body, node);
        }
        return;
      }
      default: {
        for (const child of astNaiveChildren(node)) {
          onNode(child, node);
        }
        return;
      }
    }

    function descend(child?: AnyNode | null) {
      if (child != null) {
        onNode(child, node);
      }
    }

    function explicitifyBreakLabel(parentNode: AnyNode) {
      invariant(isLoop(node));
      invariant(parentNode.type === "LabeledStatement");
      return parentNode.label.name;
    }
  }

  for (const item of root.body) {
    onNode(item, root);
  }
}
