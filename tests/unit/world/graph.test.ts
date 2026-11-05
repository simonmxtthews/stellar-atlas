import { describe, expect, it } from 'vitest';
import {
  betweenness,
  buildJumpGraph,
  cachedJumpGraph,
  connectedComponents,
  jumpsBetween,
  linkPairs,
  rankHubs,
  shortestPath,
  type GraphNode,
} from '../../../src/lib/graph';

// Mostly along a line, with d above it. e is within reach only of f.
//
//         d
//   a  b  c  f    e
const SIX: readonly GraphNode[] = [
  { id: 'a', pos: [0, 0, 0] },
  { id: 'b', pos: [3, 0, 0] },
  { id: 'c', pos: [6, 0, 0] },
  { id: 'f', pos: [9, 0, 0] },
  { id: 'e', pos: [13, 0, 0] },
  { id: 'd', pos: [4.5, 3.9, 0] },
];

describe('jump limits', () => {
  it('links exactly the pairs within the max jump, including at the limit', () => {
    const graph = buildJumpGraph(SIX, 4);
    const named = linkPairs(graph).map(([a, b]) => `${SIX[a]?.id}${SIX[b]?.id}`);
    expect(named).toEqual(['ab', 'bc', 'cf', 'fe']);
  });

  it('finds the same links as comparing every pair, across grid cells', () => {
    const nodes: GraphNode[] = Array.from({ length: 300 }, (_, i) => ({
      id: String(i),
      pos: [
        ((i * 7919) % 200) - 100,
        ((i * 104729) % 200) - 100,
        ((i * 1299709) % 200) - 100,
      ] as const,
    }));
    const maxJumpLy = 30;
    let expected = 0;
    nodes.forEach(({ pos: a }, i) => {
      nodes.slice(i + 1).forEach(({ pos: b }) => {
        if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= maxJumpLy) expected++;
      });
    });
    expect(linkPairs(buildJumpGraph(nodes, maxJumpLy))).toHaveLength(expected);
  });

  it('reuses a graph until the max jump changes', () => {
    const first = cachedJumpGraph(SIX, 4);
    expect(cachedJumpGraph(SIX, 4)).toBe(first);
    expect(cachedJumpGraph(SIX, 5)).not.toBe(first);
  });
});

describe('Dijkstra', () => {
  it('takes the fewest jumps even when more jumps would be fewer light-years', () => {
    const graph = buildJumpGraph(SIX, 6);
    // a-b-c-f is no fewer light-years, in three jumps.
    expect(shortestPath(graph, 'a', 'f')).toHaveLength(3);
    expect(jumpsBetween(graph, 'a', 'f')).toBe(2);
  });

  it('breaks a tie in jumps by light-years', () => {
    const nodes: GraphNode[] = [
      { id: 'from', pos: [0, 0, 0] },
      { id: 'long', pos: [4, 4.5, 0] },
      { id: 'short', pos: [4, 1, 0] },
      { id: 'to', pos: [8, 0, 0] },
    ];
    expect(shortestPath(buildJumpGraph(nodes, 6.1), 'from', 'to')).toEqual(['from', 'short', 'to']);
  });

  it('never takes a jump over the limit', () => {
    const graph = buildJumpGraph(SIX, 4);
    const path = shortestPath(graph, 'a', 'e') ?? [];
    expect(path).toEqual(['a', 'b', 'c', 'f', 'e']);
    const byId = new Map(SIX.map((node) => [node.id, node.pos]));
    path.slice(1).forEach((id, i) => {
      const a = byId.get(path[i] ?? '') ?? [0, 0, 0];
      const b = byId.get(id) ?? [0, 0, 0];
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThanOrEqual(4);
    });
    expect(shortestPath(buildJumpGraph(SIX, 3.5), 'a', 'e')).toBeNull();
    expect(jumpsBetween(buildJumpGraph(SIX, 3.5), 'a', 'e')).toBeNull();
  });

  it('handles a trip to itself and unknown systems', () => {
    const graph = buildJumpGraph(SIX, 4);
    expect(shortestPath(graph, 'a', 'a')).toEqual(['a']);
    expect(jumpsBetween(graph, 'a', 'a')).toBe(0);
    expect(shortestPath(graph, 'a', 'nowhere')).toBeNull();
    expect(jumpsBetween(graph, 'nowhere', 'a')).toBeNull();
  });
});

describe('connected components', () => {
  it('numbers them largest first', () => {
    const nodes: GraphNode[] = [
      { id: 'lone', pos: [100, 0, 0] },
      { id: 'pair1', pos: [50, 0, 0] },
      { id: 'pair2', pos: [52, 0, 0] },
      { id: 'tri1', pos: [0, 0, 0] },
      { id: 'tri2', pos: [2, 0, 0] },
      { id: 'tri3', pos: [4, 0, 0] },
    ];
    const { componentOf, sizes } = connectedComponents(buildJumpGraph(nodes, 3));
    expect(sizes).toEqual([3, 2, 1]);
    expect([...componentOf]).toEqual([2, 1, 1, 0, 0, 0]);
  });
});

describe('centrality', () => {
  const star: GraphNode[] = [
    { id: 'n', pos: [0, 4, 0] },
    { id: 's', pos: [0, -4, 0] },
    { id: 'hub', pos: [0, 0, 0] },
    { id: 'e', pos: [4, 0, 0] },
    { id: 'w', pos: [-4, 0, 0] },
  ];

  it('puts the hub of a star first, on every path between its spokes', () => {
    const graph = buildJumpGraph(star, 4);
    expect(rankHubs(graph, 10)).toEqual([{ id: 'hub', score: 1 }]);
  });

  it('matches hand counts on a path graph', () => {
    const line: GraphNode[] = [
      { id: 'a', pos: [0, 0, 0] },
      { id: 'b', pos: [1, 0, 0] },
      { id: 'c', pos: [2, 0, 0] },
      { id: 'd', pos: [3, 0, 0] },
    ];
    // b lies between a-c and a-d, of the three pairs that exclude it.
    const scores = betweenness(buildJumpGraph(line, 1));
    expect(scores[0]).toBeCloseTo(0);
    expect(scores[1]).toBeCloseTo(2 / 3);
    expect(scores[2]).toBeCloseTo(2 / 3);
    expect(scores[3]).toBeCloseTo(0);
  });

  it('splits credit between equal shortest paths', () => {
    const square: GraphNode[] = [
      { id: 'a', pos: [0, 0, 0] },
      { id: 'b', pos: [1, 0, 0] },
      { id: 'c', pos: [1, 1, 0] },
      { id: 'd', pos: [0, 1, 0] },
    ];
    // Each corner lies on one of the two ways round between the opposite pair.
    for (const score of betweenness(buildJumpGraph(square, 1))) {
      expect(score).toBeCloseTo(0.5 / 3);
    }
  });

  it('leaves out nodes no path passes through, and honours the limit', () => {
    expect(rankHubs(buildJumpGraph(star, 1), 10)).toEqual([]);
    const line: GraphNode[] = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      pos: [i, 0, 0] as const,
    }));
    expect(rankHubs(buildJumpGraph(line, 1), 3)).toHaveLength(3);
  });
});
