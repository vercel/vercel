/*
 * Code generated by Speakeasy (https://speakeasy.com). DO NOT EDIT.
 */

import * as z from "zod";
import { ClosedEnum } from "../../types/enums.js";

export type ReadAccessGroupRequest = {
  idOrName: string;
  /**
   * The Team identifier to perform the request on behalf of.
   */
  teamId?: string | undefined;
  /**
   * The Team slug to perform the request on behalf of.
   */
  slug?: string | undefined;
};

export const Entitlements = {
  V0: "v0",
} as const;
export type Entitlements = ClosedEnum<typeof Entitlements>;

export type ReadAccessGroupResponseBody = {
  entitlements?: Array<Entitlements> | undefined;
  isDsyncManaged: boolean;
  /**
   * The name of this access group.
   */
  name: string;
  /**
   * Timestamp in milliseconds when the access group was created.
   */
  createdAt: string;
  /**
   * ID of the team that this access group belongs to.
   */
  teamId: string;
  /**
   * Timestamp in milliseconds when the access group was last updated.
   */
  updatedAt: string;
  /**
   * ID of the access group.
   */
  accessGroupId: string;
  /**
   * Number of members in the access group.
   */
  membersCount: number;
  /**
   * Number of projects in the access group.
   */
  projectsCount: number;
};

/** @internal */
export const ReadAccessGroupRequest$inboundSchema: z.ZodType<
  ReadAccessGroupRequest,
  z.ZodTypeDef,
  unknown
> = z.object({
  idOrName: z.string(),
  teamId: z.string().optional(),
  slug: z.string().optional(),
});

/** @internal */
export type ReadAccessGroupRequest$Outbound = {
  idOrName: string;
  teamId?: string | undefined;
  slug?: string | undefined;
};

/** @internal */
export const ReadAccessGroupRequest$outboundSchema: z.ZodType<
  ReadAccessGroupRequest$Outbound,
  z.ZodTypeDef,
  ReadAccessGroupRequest
> = z.object({
  idOrName: z.string(),
  teamId: z.string().optional(),
  slug: z.string().optional(),
});

/**
 * @internal
 * @deprecated This namespace will be removed in future versions. Use schemas and types that are exported directly from this module.
 */
export namespace ReadAccessGroupRequest$ {
  /** @deprecated use `ReadAccessGroupRequest$inboundSchema` instead. */
  export const inboundSchema = ReadAccessGroupRequest$inboundSchema;
  /** @deprecated use `ReadAccessGroupRequest$outboundSchema` instead. */
  export const outboundSchema = ReadAccessGroupRequest$outboundSchema;
  /** @deprecated use `ReadAccessGroupRequest$Outbound` instead. */
  export type Outbound = ReadAccessGroupRequest$Outbound;
}

/** @internal */
export const Entitlements$inboundSchema: z.ZodNativeEnum<typeof Entitlements> =
  z.nativeEnum(Entitlements);

/** @internal */
export const Entitlements$outboundSchema: z.ZodNativeEnum<typeof Entitlements> =
  Entitlements$inboundSchema;

/**
 * @internal
 * @deprecated This namespace will be removed in future versions. Use schemas and types that are exported directly from this module.
 */
export namespace Entitlements$ {
  /** @deprecated use `Entitlements$inboundSchema` instead. */
  export const inboundSchema = Entitlements$inboundSchema;
  /** @deprecated use `Entitlements$outboundSchema` instead. */
  export const outboundSchema = Entitlements$outboundSchema;
}

/** @internal */
export const ReadAccessGroupResponseBody$inboundSchema: z.ZodType<
  ReadAccessGroupResponseBody,
  z.ZodTypeDef,
  unknown
> = z.object({
  entitlements: z.array(Entitlements$inboundSchema).optional(),
  isDsyncManaged: z.boolean(),
  name: z.string(),
  createdAt: z.string(),
  teamId: z.string(),
  updatedAt: z.string(),
  accessGroupId: z.string(),
  membersCount: z.number(),
  projectsCount: z.number(),
});

/** @internal */
export type ReadAccessGroupResponseBody$Outbound = {
  entitlements?: Array<string> | undefined;
  isDsyncManaged: boolean;
  name: string;
  createdAt: string;
  teamId: string;
  updatedAt: string;
  accessGroupId: string;
  membersCount: number;
  projectsCount: number;
};

/** @internal */
export const ReadAccessGroupResponseBody$outboundSchema: z.ZodType<
  ReadAccessGroupResponseBody$Outbound,
  z.ZodTypeDef,
  ReadAccessGroupResponseBody
> = z.object({
  entitlements: z.array(Entitlements$outboundSchema).optional(),
  isDsyncManaged: z.boolean(),
  name: z.string(),
  createdAt: z.string(),
  teamId: z.string(),
  updatedAt: z.string(),
  accessGroupId: z.string(),
  membersCount: z.number(),
  projectsCount: z.number(),
});

/**
 * @internal
 * @deprecated This namespace will be removed in future versions. Use schemas and types that are exported directly from this module.
 */
export namespace ReadAccessGroupResponseBody$ {
  /** @deprecated use `ReadAccessGroupResponseBody$inboundSchema` instead. */
  export const inboundSchema = ReadAccessGroupResponseBody$inboundSchema;
  /** @deprecated use `ReadAccessGroupResponseBody$outboundSchema` instead. */
  export const outboundSchema = ReadAccessGroupResponseBody$outboundSchema;
  /** @deprecated use `ReadAccessGroupResponseBody$Outbound` instead. */
  export type Outbound = ReadAccessGroupResponseBody$Outbound;
}
