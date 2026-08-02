import type {
  BlockId,
  BuildingId,
  CommunityId,
  FloorId,
  OrganizationId,
  PropertyId,
  UnitId,
} from './identifiers.js';

export type TenancyHierarchyNodeKind =
  'organization' | 'property' | 'community' | 'building' | 'block' | 'floor' | 'unit';

export interface OrganizationNode {
  readonly kind: 'organization';
  readonly id: OrganizationId;
}

export interface PropertyNode {
  readonly kind: 'property';
  readonly id: PropertyId;
  readonly organizationId: OrganizationId;
}

export interface CommunityNode {
  readonly kind: 'community';
  readonly id: CommunityId;
  readonly propertyId: PropertyId;
}

export interface BuildingNode {
  readonly kind: 'building';
  readonly id: BuildingId;
  readonly communityId: CommunityId;
}

export interface BlockNode {
  readonly kind: 'block';
  readonly id: BlockId;
  readonly buildingId: BuildingId;
}

export interface FloorNode {
  readonly kind: 'floor';
  readonly id: FloorId;
  readonly blockId: BlockId;
}

export interface UnitNode {
  readonly kind: 'unit';
  readonly id: UnitId;
  readonly floorId: FloorId;
}

export type TenancyHierarchyNode =
  OrganizationNode | PropertyNode | CommunityNode | BuildingNode | BlockNode | FloorNode | UnitNode;

export interface UnitHierarchyPath {
  readonly organizationId: OrganizationId;
  readonly propertyId: PropertyId;
  readonly communityId: CommunityId;
  readonly buildingId: BuildingId;
  readonly blockId: BlockId;
  readonly floorId: FloorId;
  readonly unitId: UnitId;
}

export const TENANCY_HIERARCHY_ORDER = [
  'organization',
  'property',
  'community',
  'building',
  'block',
  'floor',
  'unit',
] as const satisfies readonly TenancyHierarchyNodeKind[];
