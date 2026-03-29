import neo4j, { Driver, Session as Neo4jSession } from "neo4j-driver";
import { config } from "../config.js";

let driver: Driver;

export function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      config.NEO4J_URL,
      neo4j.auth.basic(config.NEO4J_USER, config.NEO4J_PASSWORD),
    );
  }
  return driver;
}

export function getSession(): Neo4jSession {
  return getDriver().session();
}

export async function closeDriver(): Promise<void> {
  if (driver) await driver.close();
}

// --- Schema bootstrap (run once at startup) ---
export async function initGraphSchema(): Promise<void> {
  const session = getSession();
  try {
    await session.run(
      "CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE",
    );
    await session.run(
      "CREATE CONSTRAINT community_id IF NOT EXISTS FOR (c:Community) REQUIRE c.id IS UNIQUE",
    );
    await session.run(
      "CREATE INDEX entity_name IF NOT EXISTS FOR (e:Entity) ON (e.name)",
    );
    await session.run(
      "CREATE INDEX entity_type IF NOT EXISTS FOR (e:Entity) ON (e.type)",
    );
  } finally {
    await session.close();
  }
}

// ===== Entity CRUD =====

export interface GraphEntity {
  id: string;
  name: string;
  type: string;
  properties: Record<string, unknown>;
  createdAt: string;
}

export async function createEntity(
  entity: Omit<GraphEntity, "createdAt">,
): Promise<GraphEntity> {
  const session = getSession();
  try {
    const result = await session.run(
      `CREATE (e:Entity {
        id: $id, name: $name, type: $type,
        properties: $properties,
        createdAt: datetime()
      }) RETURN e`,
      {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        properties: JSON.stringify(entity.properties),
      },
    );
    const node = result.records[0].get("e").properties;
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      properties: JSON.parse(node.properties),
      createdAt: node.createdAt.toString(),
    };
  } finally {
    await session.close();
  }
}

export async function findEntityByName(name: string): Promise<GraphEntity | null> {
  const session = getSession();
  try {
    const result = await session.run(
      "MATCH (e:Entity) WHERE toLower(e.name) = toLower($name) RETURN e LIMIT 1",
      { name },
    );
    if (result.records.length === 0) return null;
    const node = result.records[0].get("e").properties;
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      properties: JSON.parse(node.properties ?? "{}"),
      createdAt: node.createdAt?.toString() ?? "",
    };
  } finally {
    await session.close();
  }
}

export async function listEntities(opts: {
  type?: string;
  search?: string;
  limit: number;
}): Promise<{ entities: GraphEntity[]; total: number }> {
  const session = getSession();
  try {
    let where = "";
    const params: Record<string, unknown> = { limit: neo4j.int(opts.limit) };

    if (opts.type) {
      where += " AND e.type = $type";
      params.type = opts.type;
    }
    if (opts.search) {
      // Search across name, type, and properties for broader matching
      where += " AND (toLower(e.name) CONTAINS toLower($search) OR toLower(e.type) CONTAINS toLower($search) OR toLower(e.properties) CONTAINS toLower($search))";
      params.search = opts.search;
    }

    const countResult = await session.run(
      `MATCH (e:Entity) WHERE true ${where} RETURN count(e) AS total`,
      params,
    );
    const total = countResult.records[0].get("total").toNumber();

    const result = await session.run(
      `MATCH (e:Entity) WHERE true ${where} RETURN e ORDER BY e.createdAt DESC LIMIT $limit`,
      params,
    );

    const entities = result.records.map((r) => {
      const node = r.get("e").properties;
      return {
        id: node.id,
        name: node.name,
        type: node.type,
        properties: JSON.parse(node.properties ?? "{}"),
        createdAt: node.createdAt?.toString() ?? "",
      };
    });

    return { entities, total };
  } finally {
    await session.close();
  }
}

export async function deleteEntity(id: string): Promise<void> {
  const session = getSession();
  try {
    await session.run("MATCH (e:Entity {id: $id}) DETACH DELETE e", { id });
  } finally {
    await session.close();
  }
}

// ===== Relationships =====

export interface GraphRelationship {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
  createdAt: string;
}

export async function createRelationship(rel: Omit<GraphRelationship, "createdAt">): Promise<GraphRelationship> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (a:Entity {id: $source}), (b:Entity {id: $target})
       CREATE (a)-[r:RELATES_TO {
         id: $id, type: $type, properties: $properties, createdAt: datetime()
       }]->(b)
       RETURN r`,
      {
        id: rel.id,
        source: rel.source,
        target: rel.target,
        type: rel.type,
        properties: JSON.stringify(rel.properties),
      },
    );
    const edge = result.records[0].get("r").properties;
    return {
      id: edge.id,
      source: rel.source,
      target: rel.target,
      type: edge.type,
      properties: JSON.parse(edge.properties ?? "{}"),
      createdAt: edge.createdAt.toString(),
    };
  } finally {
    await session.close();
  }
}

// ===== Community operations =====

export interface GraphCommunity {
  id: string;
  name: string;
  summary: string;
  level: number;
  entityIds: string[];
}

export async function upsertCommunity(community: GraphCommunity): Promise<void> {
  const session = getSession();
  try {
    await session.run(
      `MERGE (c:Community {id: $id})
       SET c.name = $name, c.summary = $summary, c.level = $level,
           c.entityIds = $entityIds, c.updatedAt = datetime()`,
      {
        id: community.id,
        name: community.name,
        summary: community.summary,
        level: neo4j.int(community.level),
        entityIds: community.entityIds,
      },
    );

    // Link entities to community
    for (const entityId of community.entityIds) {
      await session.run(
        `MATCH (e:Entity {id: $entityId}), (c:Community {id: $communityId})
         MERGE (e)-[:BELONGS_TO]->(c)`,
        { entityId, communityId: community.id },
      );
    }
  } finally {
    await session.close();
  }
}

export async function listCommunities(level?: number): Promise<GraphCommunity[]> {
  const session = getSession();
  try {
    const where = level !== undefined ? "WHERE c.level = $level" : "";
    const params = level !== undefined ? { level: neo4j.int(level) } : {};

    const result = await session.run(
      `MATCH (c:Community) ${where} RETURN c ORDER BY c.name`,
      params,
    );

    return result.records.map((r) => {
      const node = r.get("c").properties;
      return {
        id: node.id,
        name: node.name,
        summary: node.summary ?? "",
        level: typeof node.level === "object" ? node.level.toNumber() : node.level,
        entityIds: node.entityIds ?? [],
      };
    });
  } finally {
    await session.close();
  }
}

// ===== Graph traversal for queries =====

export async function getEntityNeighborhood(
  entityId: string,
  depth: number = 2,
): Promise<{ nodes: GraphEntity[]; edges: GraphRelationship[] }> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH path = (start:Entity {id: $entityId})-[*1..${depth}]-(neighbor:Entity)
       UNWIND nodes(path) AS n
       UNWIND relationships(path) AS r
       WITH collect(DISTINCT n) AS allNodes, collect(DISTINCT r) AS allRels
       RETURN allNodes, allRels`,
      { entityId },
    );

    if (result.records.length === 0) {
      return { nodes: [], edges: [] };
    }

    const record = result.records[0];
    const rawNodes = record.get("allNodes") ?? [];
    const rawRels = record.get("allRels") ?? [];

    const nodes: GraphEntity[] = rawNodes.map((n: any) => ({
      id: n.properties.id,
      name: n.properties.name,
      type: n.properties.type,
      properties: JSON.parse(n.properties.properties ?? "{}"),
      createdAt: n.properties.createdAt?.toString() ?? "",
    }));

    const edges: GraphRelationship[] = rawRels.map((r: any) => ({
      id: r.properties.id ?? "",
      source: r.start?.toString() ?? "",
      target: r.end?.toString() ?? "",
      type: r.properties.type ?? r.type,
      properties: JSON.parse(r.properties.properties ?? "{}"),
      createdAt: r.properties.createdAt?.toString() ?? "",
    }));

    return { nodes, edges };
  } finally {
    await session.close();
  }
}

export async function getEntityCommunitySummaries(entityId: string): Promise<string[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (e:Entity {id: $entityId})-[:BELONGS_TO]->(c:Community)
       RETURN c.summary AS summary ORDER BY c.level`,
      { entityId },
    );
    return result.records
      .map((r) => r.get("summary") as string)
      .filter(Boolean);
  } finally {
    await session.close();
  }
}

export async function getAllCommunitySummaries(): Promise<string[]> {
  const session = getSession();
  try {
    const result = await session.run(
      "MATCH (c:Community) WHERE c.summary IS NOT NULL RETURN c.summary AS summary ORDER BY c.level, c.name",
    );
    return result.records.map((r) => r.get("summary") as string);
  } finally {
    await session.close();
  }
}
