// PromptMentionNode.ts 承载 Lexical 节点行为 + 全部分类图标 DOM 数据，
// 新增 plugin 图标后超出 max-lines(400) 门禁。图标数据/DOM 构建是纯展示常量，
// 与节点行为解耦到本文件；PromptMentionNode 继续 re-export 保持既有导入面兼容。
//
// PromptMentionNode 是 Lexical 自定义 DOM 节点，不能直接渲染 lucide-react 组件。
// 这里保留 lucide 的 IconNode 数据形状，再用原生 SVG DOM 生成图标。
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export type MentionLucideIconNode = ReadonlyArray<
  readonly ["path" | "circle" | "rect", Readonly<Record<string, string>>]
>;
// 以下图标由 @zcode/lunar-icons 的 DSL 生成（packages/lunar-icons: node tools/mention.mjs），保持与全局图标同一套月字手绘风格。
export const SKILL_MENTION_ICON_NODE = [
  [
    "path",
    {
      "fill": "currentColor",
      "fill-opacity": "0.16",
      "stroke": "none",
      "d": "M14.8 4.6l4.6 4.6-9.8 9.8a1.6 1.6 0 0 1-2.3 0l-2.3-2.3a1.6 1.6 0 0 1 0-2.3z"
    }
  ],
  [
    "path",
    {
      "fill": "currentColor",
      "fill-opacity": "0.16",
      "stroke": "none",
      "d": "M5.5 3l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8L3 5.5l1.8-.7z"
    }
  ],
  [
    "path",
    {
      "fill": "currentColor",
      "fill-opacity": "0.16",
      "stroke": "none",
      "d": "M19.5 14l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"
    }
  ],
  [
    "path",
    {
      "d": "M14.8 4.6l4.6 4.6-9.8 9.8a1.6 1.6 0 0 1-2.3 0l-2.3-2.3a1.6 1.6 0 0 1 0-2.3z"
    }
  ],
  [
    "path",
    {
      "d": "M13 6.4l4.6 4.6"
    }
  ],
  [
    "path",
    {
      "d": "M5.5 3l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8L3 5.5l1.8-.7z"
    }
  ],
  [
    "path",
    {
      "d": "M19.5 14l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"
    }
  ]
] as const satisfies MentionLucideIconNode;
export const SUBAGENT_MENTION_ICON_NODE = [
  [
    "rect",
    {
      "fill": "currentColor",
      "fill-opacity": "0.16",
      "stroke": "none",
      "x": "4",
      "y": "8",
      "width": "16",
      "height": "12",
      "rx": "5"
    }
  ],
  [
    "rect",
    {
      "x": "4",
      "y": "8",
      "width": "16",
      "height": "12",
      "rx": "5"
    }
  ],
  [
    "path",
    {
      "d": "M12 8V4.7"
    }
  ],
  [
    "circle",
    {
      "cx": "12",
      "cy": "3.6",
      "r": "1.2",
      "fill": "currentColor",
      "stroke": "none"
    }
  ],
  [
    "circle",
    {
      "cx": "9",
      "cy": "13.4",
      "r": "1.2",
      "fill": "currentColor",
      "stroke": "none"
    }
  ],
  [
    "circle",
    {
      "cx": "15",
      "cy": "13.4",
      "r": "1.2",
      "fill": "currentColor",
      "stroke": "none"
    }
  ],
  [
    "path",
    {
      "d": "M10.2 16.6h3.6"
    }
  ],
  [
    "path",
    {
      "d": "M2.5 12.5v3.5"
    }
  ],
  [
    "path",
    {
      "d": "M21.5 12.5v3.5"
    }
  ]
] as const satisfies MentionLucideIconNode;
export const WHITEBOARD_MENTION_ICON_NODE = [
  [
    "path",
    {
      "fill": "currentColor",
      "fill-opacity": "0.16",
      "stroke": "none",
      "d": "M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 2-1 1.6-2-.5-1.3.2-2.5 1.6-2.5h1.8A3.5 3.5 0 0 0 20.5 9.5 8.5 8.5 0 0 0 12 3.5z"
    }
  ],
  [
    "path",
    {
      "d": "M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 2-1 1.6-2-.5-1.3.2-2.5 1.6-2.5h1.8A3.5 3.5 0 0 0 20.5 9.5 8.5 8.5 0 0 0 12 3.5z"
    }
  ],
  [
    "circle",
    {
      "cx": "7.8",
      "cy": "11.2",
      "r": "1.1",
      "fill": "currentColor",
      "stroke": "none"
    }
  ],
  [
    "circle",
    {
      "cx": "10.2",
      "cy": "7.6",
      "r": "1.1",
      "fill": "currentColor",
      "stroke": "none"
    }
  ],
  [
    "circle",
    {
      "cx": "14.6",
      "cy": "7.4",
      "r": "1.1",
      "fill": "currentColor",
      "stroke": "none"
    }
  ],
  [
    "circle",
    {
      "cx": "17.2",
      "cy": "10.4",
      "r": "1.1",
      "fill": "currentColor",
      "stroke": "none"
    }
  ]
] as const satisfies MentionLucideIconNode;
export const GOAL_COMMAND_MENTION_ICON_NODE = [
  [
    "path",
    {
      "fill": "currentColor",
      "fill-opacity": "0.16",
      "stroke": "none",
      "d": "M12 3.5h7l-2 2.7 2 2.7h-7"
    }
  ],
  [
    "path",
    {
      "d": "M12 14.2V3.5"
    }
  ],
  [
    "path",
    {
      "d": "M12 3.5h7l-2 2.7 2 2.7h-7"
    }
  ],
  [
    "circle",
    {
      "cx": "12",
      "cy": "18.5",
      "r": "3.4"
    }
  ],
  [
    "circle",
    {
      "cx": "12",
      "cy": "18.5",
      "r": "1",
      "fill": "currentColor",
      "stroke": "none"
    }
  ]
] as const satisfies MentionLucideIconNode;
export const WORKFLOW_COMMAND_MENTION_ICON_NODE = [
  [
    "rect",
    {
      "fill": "currentColor",
      "fill-opacity": "0.16",
      "stroke": "none",
      "x": "3.5",
      "y": "3.5",
      "width": "7",
      "height": "7",
      "rx": "2"
    }
  ],
  [
    "rect",
    {
      "fill": "currentColor",
      "fill-opacity": "0.16",
      "stroke": "none",
      "x": "13.5",
      "y": "13.5",
      "width": "7",
      "height": "7",
      "rx": "2"
    }
  ],
  [
    "rect",
    {
      "x": "3.5",
      "y": "3.5",
      "width": "7",
      "height": "7",
      "rx": "2"
    }
  ],
  [
    "rect",
    {
      "x": "13.5",
      "y": "13.5",
      "width": "7",
      "height": "7",
      "rx": "2"
    }
  ],
  [
    "path",
    {
      "d": "M7 10.5v3a3 3 0 0 0 3 3h3.5"
    }
  ]
] as const satisfies MentionLucideIconNode;
export const COMPACT_COMMAND_MENTION_ICON_NODE = [
  [
    "path",
    {
      "fill": "currentColor",
      "fill-opacity": "0.16",
      "stroke": "none",
      "d": "M6 18.5v.5A2 2 0 0 0 8 21h8.5a2.5 2.5 0 0 0 2.5-2.5V17H8.5A2.5 2.5 0 0 0 6 18.5z"
    }
  ],
  [
    "path",
    {
      "d": "M19 17V5.5a2 2 0 0 0-2-2H8.5A2.5 2.5 0 0 0 6 6v12.5"
    }
  ],
  [
    "path",
    {
      "d": "M6 18.5v.5A2 2 0 0 0 8 21h8.5a2.5 2.5 0 0 0 2.5-2.5V17H8.5A2.5 2.5 0 0 0 6 18.5z"
    }
  ],
  [
    "path",
    {
      "d": "M10 8h5"
    }
  ],
  [
    "path",
    {
      "d": "M10 11.5h5"
    }
  ]
] as const satisfies MentionLucideIconNode;
export const COMMAND_MENTION_ICON_NODE = [
  [
    "rect",
    {
      "fill": "currentColor",
      "fill-opacity": "0.16",
      "stroke": "none",
      "x": "3.5",
      "y": "3.5",
      "width": "17",
      "height": "17",
      "rx": "4"
    }
  ],
  [
    "rect",
    {
      "x": "3.5",
      "y": "3.5",
      "width": "17",
      "height": "17",
      "rx": "4"
    }
  ],
  [
    "path",
    {
      "d": "M8 16 16 8"
    }
  ]
] as const satisfies MentionLucideIconNode;
export const SESSION_MENTION_ICON_NODE = [
  [
    "path",
    {
      "fill": "currentColor",
      "fill-opacity": "0.16",
      "stroke": "none",
      "d": "M9 11.5A2.5 2.5 0 0 1 11.5 9h7a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5h-2l-3 2.5V19h-2A2.5 2.5 0 0 1 9 16.5z"
    }
  ],
  [
    "path",
    {
      "d": "M14.5 8.5V6A2.5 2.5 0 0 0 12 3.5H5.5A2.5 2.5 0 0 0 3 6v6.5A2.5 2.5 0 0 0 5.5 15H6v3l3-3"
    }
  ],
  [
    "path",
    {
      "d": "M9 11.5A2.5 2.5 0 0 1 11.5 9h7a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5h-2l-3 2.5V19h-2A2.5 2.5 0 0 1 9 16.5z"
    }
  ]
] as const satisfies MentionLucideIconNode;
export const PLUGIN_MENTION_ICON_NODE = [
  [
    "path",
    {
      "fill": "currentColor",
      "fill-opacity": "0.16",
      "stroke": "none",
      "d": "M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0z"
    }
  ],
  [
    "path",
    {
      "d": "M9 3v5"
    }
  ],
  [
    "path",
    {
      "d": "M15 3v5"
    }
  ],
  [
    "path",
    {
      "d": "M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0z"
    }
  ],
  [
    "path",
    {
      "d": "M12 17v4"
    }
  ]
] as const satisfies MentionLucideIconNode;

export function createMentionSvgIcon(iconNode: MentionLucideIconNode): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("inline-block", "align-middle", "shrink-0");

  for (const [tagName, attributes] of iconNode) {
    const node = document.createElementNS(SVG_NAMESPACE, tagName);
    for (const [name, value] of Object.entries(attributes)) {
      node.setAttribute(name, value);
    }
    svg.append(node);
  }

  return svg;
}
