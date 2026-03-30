import { z } from "zod";

export const memoryPredicateEnum = z.enum([
  "prefers",
  "avoids",
  "has_name",
  "works_on",
  "has_goal",
  "has_constraint",
  "has_code",
  "states",
]);

export const memoryKindEnum = z.enum([
  "fact",
  "preference",
  "goal",
  "project_state",
  "identity",
  "constraint",
  "temporary",
]);

export const memoryTripleSchema = z.object({
  subject: z.string().min(1),
  predicate: memoryPredicateEnum,
  object: z.string().min(1),
});

export const extractedMemoryTripleSchema = z.object({
  triple: memoryTripleSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1).optional(),
});

export type MemoryPredicate = z.infer<typeof memoryPredicateEnum>;
export type MemoryKind = z.infer<typeof memoryKindEnum>;
export type MemoryTriple = z.infer<typeof memoryTripleSchema>;
export type ExtractedMemoryTriple = z.infer<typeof extractedMemoryTripleSchema>;

export const DEFAULT_PREDICATE_BY_KIND: Record<MemoryKind, MemoryPredicate> = {
  fact: "states",
  preference: "prefers",
  goal: "has_goal",
  project_state: "works_on",
  identity: "has_name",
  constraint: "has_constraint",
  temporary: "states",
};

export const EXCLUSIVE_PREDICATES = new Set<MemoryPredicate>([
  "has_name",
  "has_code",
  "works_on",
  "has_goal",
  "has_constraint",
]);

export const OPPOSING_PREDICATES: Record<MemoryPredicate, MemoryPredicate[]> = {
  prefers: ["avoids"],
  avoids: ["prefers"],
  has_name: [],
  works_on: [],
  has_goal: [],
  has_constraint: [],
  has_code: [],
  states: [],
};
