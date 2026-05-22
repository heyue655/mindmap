import type {
  BoundaryInfo,
  BracketInfo,
  LayoutDirection,
  PositionedNode,
} from "./layout";
import type { Relationship } from "@/types";
import type { ThemeDef } from "./theme";

interface Props {
  positioned: PositionedNode[];
  byId: Map<string, PositionedNode>;
  width: number;
  height: number;
  brackets?: BracketInfo[];
  boundaries?: BoundaryInfo[];
  hiddenEdgesToChild?: Set<string>;
  theme: ThemeDef;
  relationships?: Relationship[];
}

export default function MindMapEdges({
  positioned,
  byId,
  width,
  height,
  brackets = [],
  boundaries = [],
  hiddenEdgesToChild,
  theme,
  relationships = [],
}: Props) {
  return (
    <svg
      width={width}
      height={height}
      className="absolute top-0 left-0 pointer-events-none"
      style={{ overflow: "visible" }}
    >
      <defs>
        <marker
          id="arrowhead"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.relationshipColor} />
        </marker>
      </defs>

      {/* 边界框（最先画 → 在节点下方） */}
      {boundaries.map((b) => (
        <g key={b.id}>
          <rect
            x={b.x}
            y={b.y}
            width={b.width}
            height={b.height}
            rx={14}
            ry={14}
            fill={theme.boundaryColor + "10"}
            stroke={theme.boundaryColor}
            strokeWidth={1.4}
            strokeDasharray="6 4"
          />
          {b.boundaryNode.title && (
            <g>
              <rect
                x={b.x + 12}
                y={b.y - 10}
                width={b.boundaryNode.title.length * 8 + 16}
                height={20}
                rx={10}
                ry={10}
                fill={theme.boundaryColor}
              />
              <text
                x={b.x + 20}
                y={b.y + 4}
                fill="white"
                fontSize="11"
                fontWeight={600}
              >
                {b.boundaryNode.title}
              </text>
            </g>
          )}
        </g>
      ))}

      {/* 父子连线（贝塞尔，按方向分） */}
      {positioned.map((p) => {
        if (!p.node.parentId) return null;
        if (hiddenEdgesToChild?.has(p.node.id)) return null;
        const parent = byId.get(p.node.parentId);
        if (!parent) return null;
        const d = edgePath(parent, p, p.direction);
        const bf = p.node.topicFormat;
        const stroke = bf?.branchColor ?? theme.edgeColor;
        const strokeW = bf?.branchWidthPx ?? 1.6;
        const dash = bf?.branchDash?.trim();
        return (
          <path
            key={`edge-${p.node.id}`}
            d={d}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeW}
            strokeDasharray={dash && dash.length > 0 ? dash : undefined}
          />
        );
      })}

      {/* 季度大括号 / 概要大括号 */}
      {brackets.map((b) => {
        const endpoint = byId.get(b.endpointId);
        if (!endpoint) return null;
        return (
          <Bracket
            key={b.id}
            endpoint={endpoint}
            bracketX={b.bracketX}
            top={b.top}
            bot={b.bot}
            color={
              b.variant === "summary" ? theme.summaryColor : theme.edgeColor
            }
            // summary 风格略粗
            strokeW={b.variant === "summary" ? 2 : 1.6}
          />
        );
      })}

      {/* 联系线（带文本和箭头） */}
      {relationships.map((rel) => {
        const a = byId.get(rel.fromId);
        const b = byId.get(rel.toId);
        if (!a || !b) return null;
        const a1 = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
        const a2 = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        const dx = a2.x - a1.x;
        const cy1 = a1.y - Math.abs(dx) * 0.25;
        const cy2 = a2.y - Math.abs(dx) * 0.25;
        const d = `M ${a1.x} ${a1.y} C ${a1.x} ${cy1}, ${a2.x} ${cy2}, ${a2.x} ${a2.y}`;
        const midX = (a1.x + a2.x) / 2;
        const midY = (cy1 + cy2) / 2 + (a1.y + a2.y) / 4 - 8;
        return (
          <g key={rel.id}>
            <path
              d={d}
              fill="none"
              stroke={theme.relationshipColor}
              strokeWidth={1.8}
              strokeDasharray="6 3"
              markerEnd="url(#arrowhead)"
            />
            {rel.label && (
              <g>
                <rect
                  x={midX - rel.label.length * 5 - 6}
                  y={midY - 10}
                  width={rel.label.length * 10 + 12}
                  height={18}
                  rx={9}
                  ry={9}
                  fill="white"
                  stroke={theme.relationshipColor}
                  strokeWidth={1}
                />
                <text
                  x={midX}
                  y={midY + 3}
                  fill={theme.relationshipColor}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight={600}
                >
                  {rel.label}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function edgePath(
  parent: PositionedNode,
  child: PositionedNode,
  direction: LayoutDirection,
): string {
  if (direction === "down") {
    const x1 = parent.x + parent.width / 2;
    const y1 = parent.y + parent.height;
    const x2 = child.x + child.width / 2;
    const y2 = child.y;
    const my = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
  }
  if (direction === "left") {
    const x1 = parent.x;
    const y1 = parent.y + parent.height / 2;
    const x2 = child.x + child.width;
    const y2 = child.y + child.height / 2;
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  }
  // right (default)
  const x1 = parent.x + parent.width;
  const y1 = parent.y + parent.height / 2;
  const x2 = child.x;
  const y2 = child.y + child.height / 2;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

function Bracket({
  endpoint,
  bracketX,
  top,
  bot,
  color,
  strokeW,
}: {
  endpoint: PositionedNode;
  bracketX: number;
  top: number;
  bot: number;
  color: string;
  strokeW: number;
}) {
  const armEndX = endpoint.x;
  const midY = endpoint.y + endpoint.height / 2;

  // 判断括号在端点哪一侧（端点的 x 在括号右边 → 括号开口朝右；反之朝左）
  const openRight = endpoint.x > bracketX;
  const hookLen = 10;
  const r = 8;
  const topY = top - 4;
  const botY = bot + 4;
  const hookX = openRight ? bracketX - hookLen : bracketX + hookLen;
  const cornerControlX = openRight ? bracketX + r : bracketX - r;

  const d = openRight
    ? [
        `M ${hookX} ${topY}`,
        `Q ${bracketX} ${topY} ${bracketX} ${topY + r}`,
        `V ${botY - r}`,
        `Q ${bracketX} ${botY} ${hookX} ${botY}`,
      ].join(" ")
    : [
        `M ${hookX} ${topY}`,
        `Q ${bracketX} ${topY} ${bracketX} ${topY + r}`,
        `V ${botY - r}`,
        `Q ${bracketX} ${botY} ${hookX} ${botY}`,
      ].join(" ");
  // ↑ 括号本体两个方向都通过 quadratic 拐角，对称的，只有 hookX 方向不同
  void cornerControlX;

  const armPath = `M ${bracketX} ${midY} L ${armEndX} ${midY}`;

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeW}
        strokeLinecap="round"
      />
      <path d={armPath} fill="none" stroke={color} strokeWidth={strokeW} />
      <circle cx={bracketX} cy={midY} r={2.5} fill={color} />
    </g>
  );
}
