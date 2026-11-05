// User-authored, persisted and exported. References catalogue IDs only.
import type { Position } from './catalogue';

export interface StarMeta {
  readonly tagIds: readonly string[];
  readonly customName?: string;
  readonly notes?: string;
}

export interface World {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly drive: DriveModel;
  readonly tags: readonly Tag[];
  readonly starMeta: Readonly<Record<string, StarMeta>>;
  readonly routes: readonly Route[];
  readonly regions: readonly Region[];
  readonly view?: { readonly camera: Position; readonly target: Position };
}

export interface Tag {
  readonly id: string;
  readonly label: string;
  readonly color: string;
}

export const ROUTE_KINDS = ['trade', 'military', 'exploration', 'custom'] as const;
export type RouteKind = (typeof ROUTE_KINDS)[number];

export interface Route {
  readonly id: string;
  readonly name?: string;
  readonly waypoints: readonly string[]; // system IDs, length >= 2
  readonly kind: RouteKind;
  readonly color: string;
  readonly dashed: boolean;
  readonly width: number;
  readonly notes?: string;
}

export interface Region {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly systemIds: readonly string[];
}

export type DriveModel =
  | { readonly type: 'sublight'; readonly fractionC: number; readonly accelG?: number }
  | { readonly type: 'ftl-speed'; readonly multipleOfC: number }
  | { readonly type: 'jump'; readonly maxJumpLy: number; readonly daysPerJump: number };
