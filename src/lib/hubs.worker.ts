import { buildJumpGraph, rankHubs, type GraphNode } from './graph';

export interface HubRequest {
  readonly nodes: readonly GraphNode[];
  readonly maxJumpLy: number;
  readonly limit: number;
}

// Brandes takes O(V·E), which on the whole catalogue is too long to hold up the map.
self.onmessage = ({ data }: MessageEvent<HubRequest>) => {
  self.postMessage(rankHubs(buildJumpGraph(data.nodes, data.maxJumpLy), data.limit));
};
