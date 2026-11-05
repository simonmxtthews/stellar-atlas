import type { Position } from '../types/catalogue';
import { distanceLy } from './routes';

export interface GraphNode {
  readonly id: string;
  readonly pos: Position;
}

// Every pair of nodes within maxJumpLy is linked. Node i's neighbours are
// links[offsets[i]] up to links[offsets[i + 1]].
export interface JumpGraph {
  readonly nodes: readonly GraphNode[];
  readonly indexById: ReadonlyMap<string, number>;
  readonly offsets: Uint32Array;
  readonly links: Uint32Array;
}

// A uniform grid with cells one jump wide, so a node's links all lie in the 27 cells around it.
export function buildJumpGraph(nodes: readonly GraphNode[], maxJumpLy: number): JumpGraph {
  const cellOf = (value: number) => Math.floor(value / maxJumpLy);
  const cells = new Map<string, number[]>();
  nodes.forEach(({ pos }, i) => {
    const key = `${cellOf(pos[0])},${cellOf(pos[1])},${cellOf(pos[2])}`;
    const cell = cells.get(key);
    if (cell) cell.push(i);
    else cells.set(key, [i]);
  });

  const offsets = new Uint32Array(nodes.length + 1);
  const found: number[] = [];
  nodes.forEach(({ pos }, i) => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${cellOf(pos[0]) + dx},${cellOf(pos[1]) + dy},${cellOf(pos[2]) + dz}`;
          for (const j of cells.get(key) ?? []) {
            const other = nodes[j];
            if (j !== i && other && distanceLy(pos, other.pos) <= maxJumpLy) found.push(j);
          }
        }
      }
    }
    offsets[i + 1] = found.length;
  });

  return {
    nodes,
    indexById: new Map(nodes.map(({ id }, i) => [id, i])),
    offsets,
    links: Uint32Array.from(found),
  };
}

function neighbours(graph: JumpGraph, node: number): Uint32Array {
  return graph.links.subarray(graph.offsets[node], graph.offsets[node + 1]);
}

const graphCache = new WeakMap<
  readonly GraphNode[],
  { readonly maxJumpLy: number; readonly graph: JumpGraph }
>();

// Dragging the jump slider or filters asks again and again, and only the latest answer matters.
export function cachedJumpGraph(nodes: readonly GraphNode[], maxJumpLy: number): JumpGraph {
  const cached = graphCache.get(nodes);
  if (cached?.maxJumpLy === maxJumpLy) return cached.graph;
  const graph = buildJumpGraph(nodes, maxJumpLy);
  graphCache.set(nodes, { maxJumpLy, graph });
  return graph;
}

// One line segment per link, as index pairs with the lower index first.
export function linkPairs(graph: JumpGraph): readonly (readonly [number, number])[] {
  const pairs: (readonly [number, number])[] = [];
  graph.nodes.forEach((_, i) => {
    for (const j of neighbours(graph, i)) if (i < j) pairs.push([i, j]);
  });
  return pairs;
}

export interface Components {
  readonly componentOf: Int32Array; // by node; component 0 is the largest
  readonly sizes: readonly number[]; // largest first
}

export function connectedComponents(graph: JumpGraph): Components {
  const raw = new Int32Array(graph.nodes.length).fill(-1);
  const rawSizes: number[] = [];
  graph.nodes.forEach((_, start) => {
    if (raw[start] !== -1) return;
    const component = rawSizes.length;
    const stack = [start];
    raw[start] = component;
    let size = 0;
    for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
      size++;
      for (const next of neighbours(graph, node)) {
        if (raw[next] === -1) {
          raw[next] = component;
          stack.push(next);
        }
      }
    }
    rawSizes.push(size);
  });

  const order = rawSizes.map((_, i) => i).sort((a, b) => (rawSizes[b] ?? 0) - (rawSizes[a] ?? 0));
  const rank = new Int32Array(order.length);
  order.forEach((component, i) => {
    rank[component] = i;
  });
  return {
    componentOf: raw.map((component) => rank[component] ?? 0),
    sizes: order.map((component) => rawSizes[component] ?? 0),
  };
}

// Golden-angle hues keep neighbouring ranks apart however many components there are.
export function componentColor(rank: number): string {
  return `hsl(${Math.round((200 + rank * 137.508) % 360)}, 75%, 62%)`;
}

interface QueueEntry {
  readonly node: number;
  readonly jumps: number;
  readonly ly: number;
}

function isBefore(a: QueueEntry, b: QueueEntry): boolean {
  return a.jumps < b.jumps || (a.jumps === b.jumps && a.ly < b.ly);
}

class MinQueue {
  private readonly heap: QueueEntry[] = [];

  push(entry: QueueEntry): void {
    const { heap } = this;
    let i = heap.length;
    heap.push(entry);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const above = heap[parent];
      if (!above || !isBefore(entry, above)) break;
      heap[i] = above;
      i = parent;
    }
    heap[i] = entry;
  }

  pop(): QueueEntry | undefined {
    const { heap } = this;
    const top = heap[0];
    const last = heap.pop();
    if (!last || heap.length === 0) return top;
    let i = 0;
    for (;;) {
      const left = heap[2 * i + 1];
      const right = heap[2 * i + 2];
      const child = right && left && isBefore(right, left) ? 2 * i + 2 : 2 * i + 1;
      const next = heap[child];
      if (!next || !isBefore(next, last)) break;
      heap[i] = next;
      i = child;
    }
    heap[i] = last;
    return top;
  }
}

// Dijkstra. A jump costs the same however long it is, so the shortest path is the one with the
// fewest jumps, and of those the fewest light-years. Going by light-years alone would break a
// single jump into many small hops through whatever lies along the line, and take far longer.
export function shortestPath(
  graph: JumpGraph,
  fromId: string,
  toId: string,
): readonly string[] | null {
  const from = graph.indexById.get(fromId);
  const to = graph.indexById.get(toId);
  if (from === undefined || to === undefined) return null;

  const count = graph.nodes.length;
  const jumps = new Float64Array(count).fill(Infinity);
  const ly = new Float64Array(count).fill(Infinity);
  const previous = new Int32Array(count).fill(-1);
  const queue = new MinQueue();
  jumps[from] = 0;
  ly[from] = 0;
  queue.push({ node: from, jumps: 0, ly: 0 });

  for (let entry = queue.pop(); entry; entry = queue.pop()) {
    const { node } = entry;
    if (entry.jumps !== jumps[node] || entry.ly !== ly[node]) continue; // superseded
    if (node === to) break;
    const pos = graph.nodes[node]?.pos;
    if (!pos) continue;
    for (const next of neighbours(graph, node)) {
      const nextPos = graph.nodes[next]?.pos;
      if (!nextPos) continue;
      const candidate = {
        node: next,
        jumps: entry.jumps + 1,
        ly: entry.ly + distanceLy(pos, nextPos),
      };
      const best = { node: next, jumps: jumps[next] ?? Infinity, ly: ly[next] ?? Infinity };
      if (isBefore(candidate, best)) {
        jumps[next] = candidate.jumps;
        ly[next] = candidate.ly;
        previous[next] = node;
        queue.push(candidate);
      }
    }
  }

  if (jumps[to] === Infinity) return null;
  const path: string[] = [];
  for (let node = to; node !== -1; node = previous[node] ?? -1) {
    path.push(graph.nodes[node]?.id ?? '');
  }
  return path.reverse();
}

const HOP_CACHE_LIMIT = 64;
const hopCache = new WeakMap<JumpGraph, Map<number, Int32Array>>();

// Jumps from one node to every other, -1 where unreachable.
function hopsFrom(graph: JumpGraph, source: number): Int32Array {
  let cache = hopCache.get(graph);
  if (!cache) {
    cache = new Map();
    hopCache.set(graph, cache);
  }
  const cached = cache.get(source);
  if (cached) return cached;

  const hops = new Int32Array(graph.nodes.length).fill(-1);
  hops[source] = 0;
  const queue = [source];
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head] ?? 0;
    for (const next of neighbours(graph, node)) {
      if (hops[next] === -1) {
        hops[next] = (hops[node] ?? 0) + 1;
        queue.push(next);
      }
    }
  }
  if (cache.size >= HOP_CACHE_LIMIT) cache.clear();
  cache.set(source, hops);
  return hops;
}

// Null when either is missing from the graph or no chain of jumps connects them.
export function jumpsBetween(graph: JumpGraph, fromId: string, toId: string): number | null {
  const from = graph.indexById.get(fromId);
  const to = graph.indexById.get(toId);
  if (from === undefined || to === undefined) return null;
  const hops = hopsFrom(graph, from)[to] ?? -1;
  return hops === -1 ? null : hops;
}

// Brandes, on hop counts to match shortestPath: each node's share of all the shortest paths between
// other pairs, from 0 to 1.
export function betweenness(graph: JumpGraph): Float64Array {
  const count = graph.nodes.length;
  const scores = new Float64Array(count);
  const distance = new Int32Array(count);
  const paths = new Float64Array(count);
  const dependency = new Float64Array(count);

  for (let source = 0; source < count; source++) {
    distance.fill(-1);
    paths.fill(0);
    dependency.fill(0);
    distance[source] = 0;
    paths[source] = 1;
    const visited = [source];
    for (let head = 0; head < visited.length; head++) {
      const node = visited[head] ?? 0;
      for (const next of neighbours(graph, node)) {
        if (distance[next] === -1) {
          distance[next] = (distance[node] ?? 0) + 1;
          visited.push(next);
        }
        if (distance[next] === (distance[node] ?? 0) + 1) {
          paths[next] = (paths[next] ?? 0) + (paths[node] ?? 0);
        }
      }
    }
    for (let i = visited.length - 1; i > 0; i--) {
      const node = visited[i] ?? 0;
      const share = (1 + (dependency[node] ?? 0)) / (paths[node] ?? 1);
      for (const prior of neighbours(graph, node)) {
        if (distance[prior] === (distance[node] ?? 0) - 1) {
          dependency[prior] = (dependency[prior] ?? 0) + (paths[prior] ?? 0) * share;
        }
      }
      scores[node] = (scores[node] ?? 0) + (dependency[node] ?? 0);
    }
  }

  // Each unordered pair was counted from both ends.
  const pairs = count > 2 ? (count - 1) * (count - 2) : 1;
  return scores.map((score) => score / pairs);
}

export interface Hub {
  readonly id: string;
  readonly score: number;
}

// Highest score first. A node no shortest path passes through isn't a hub at all.
export function rankHubs(graph: JumpGraph, limit: number): readonly Hub[] {
  const scores = betweenness(graph);
  return graph.nodes
    .map(({ id }, i) => ({ id, score: scores[i] ?? 0 }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}
