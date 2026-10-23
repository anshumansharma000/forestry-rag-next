// Animate the final rendered document, never partially parsed Markdown.
type RevealNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: RevealNode[];
};

const blockTags = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre", "table", "a", "hr", "img"]);

export function answerRevealDelay(index: number, words: number) {
  const groups = Math.ceil(words / 3);
  return Math.floor(index / 3) * Math.min(70, 6000 / Math.max(1, groups));
}

export function rehypeAnswerReveal() {
  return (tree: RevealNode) => {
    let words = 0;
    const count = (node: RevealNode) => {
      if (node.type === "text") words += node.value?.match(/\S+/g)?.length ?? 0;
      node.children?.forEach(count);
    };
    count(tree);
    let index = 0;
    let lastWord: RevealNode | undefined;
    const visit = (node: RevealNode) => {
      const start = index;
      if (node.children) {
        node.children = node.children.flatMap((child): RevealNode[] => {
          if (child.type !== "text" || !child.value) {
            visit(child);
            return [child];
          }
          return (child.value.match(/\s+|\S+/g) ?? []).map((part): RevealNode => {
            if (!part.trim()) return { type: "text", value: part };
            const word: RevealNode = {
              type: "element",
              tagName: "span",
              properties: {
                className: ["answer-reveal-word"],
                style: `animation-delay:${answerRevealDelay(index++, words)}ms`,
              },
              children: [{ type: "text", value: part }],
            };
            lastWord = word;
            return word;
          });
        });
      }
      if (node.tagName && blockTags.has(node.tagName)) {
        node.properties = {
          ...node.properties,
          className: [...((node.properties?.className as string[]) ?? []), "answer-reveal-block"],
          style: `animation-delay:${answerRevealDelay(start, words)}ms`,
        };
      }
    };
    visit(tree);
    if (lastWord?.properties) lastWord.properties["data-answer-reveal-last"] = "true";
  };
}
