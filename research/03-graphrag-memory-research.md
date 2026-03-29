# GraphRAG Memory Systems — Deep Research Document

> **Source**: [Microsoft GraphRAG](https://microsoft.github.io/graphrag/) | [GitHub](https://github.com/microsoft/graphrag) (MIT License)
> **Version**: v3.0.7 (March 2026) | 31.8k GitHub stars
> **Research Date**: 2026-03-27

---

## 1. Executive Summary

GraphRAG is Microsoft Research's structured, hierarchical approach to Retrieval-Augmented Generation (RAG). Instead of naive semantic search over plain text chunks, GraphRAG **extracts a knowledge graph** from raw text, builds **community hierarchies**, generates **community summaries**, and leverages these structures at query time. It demonstrates substantial improvements over baseline RAG, especially for questions requiring connection of disparate information or holistic understanding of large corpora.

**Why this matters for agent memory**: Traditional agent memory systems (flat text, vector search) struggle to "connect the dots" — they can't traverse relationships between entities, can't provide holistic summaries of a user's entire context, and can't reason about emergent themes. GraphRAG directly addresses these gaps.

---

## 2. The Problem with Baseline RAG

### 2.1 Where Baseline RAG Fails

| Failure Mode | Description | Example |
|-------------|-------------|---------|
| **Can't connect the dots** | Requires traversing disparate pieces of information through shared attributes | "What are the common themes across all my project discussions this month?" |
| **Can't holistically summarize** | Performs poorly when asked to understand semantic concepts over large collections | "Give me an overview of what this agent has learned about my workflow preferences" |
| **No relational reasoning** | Vector similarity only finds topically similar chunks, not causally or structurally related ones | "How does my meeting with Alice relate to the bug report from last week?" |

### 2.2 Why This Matters for Agent Memory

A personal agent that only has vector-based memory:
- Can find "what did we discuss about database migrations?" (topical similarity)
- **Cannot** answer "what patterns do you see in how I approach technical decisions?" (requires connecting themes across conversations)
- **Cannot** answer "how does my work on project X relate to the issues I'm having on project Y?" (requires relational traversal)

GraphRAG memory enables the agent to reason about the *structure* of what it knows, not just the *content*.

---

## 3. The GraphRAG Process

### 3.1 Indexing Pipeline

The indexing pipeline transforms unstructured text into a rich, queryable knowledge structure:

```
Raw Text
    ↓
[1. Text Chunking]
    → TextUnits (analyzable units + fine-grained references)
    ↓
[2. Entity & Relationship Extraction]
    → Entities (people, places, organizations, concepts)
    → Relationships (connections between entities)
    → Key Claims (assertions and facts)
    ↓
[3. Hierarchical Clustering]
    → Community detection using Leiden algorithm
    → Multi-level hierarchy of entity communities
    ↓
[4. Community Summarization]
    → Bottom-up summaries of each community
    → Holistic understanding of themes and patterns
    ↓
Knowledge Graph + Community Hierarchy + Summaries
```

### 3.2 Entity Extraction

LLMs extract structured entities from raw text:
- **Entity types**: People, places, organizations, concepts, events, technical terms
- **Relationships**: Directed connections between entities with descriptions
- **Key claims**: Assertions, facts, and notable statements
- Each extraction is anchored to its source **TextUnit** for provenance

### 3.3 Graph Construction

The extracted entities and relationships form a knowledge graph:
- **Nodes** = entities (sized by degree/importance)
- **Edges** = relationships (with descriptions and weights)
- **Properties** = metadata, source references, extraction confidence
- This graph is the structural backbone of the memory system

### 3.4 Community Detection (Leiden Algorithm)

The [Leiden algorithm](https://arxiv.org/pdf/1810.08473.pdf) performs hierarchical clustering:
- Groups densely connected entities into **communities**
- Creates a **multi-level hierarchy** (micro-communities nest into macro-communities)
- Each level provides different granularity of understanding
- Enables both detailed and holistic reasoning

### 3.5 Community Summaries

LLMs generate summaries for each community:
- **Bottom-up**: Leaf communities summarized first, then parent communities
- Each summary captures: key entities, relationships, themes, and insights
- These summaries are the key to answering holistic questions
- They represent **emergent understanding** — themes that are not explicit in any single document

---

## 4. Query Modes

### 4.1 Global Search

**Purpose**: Reasoning about holistic questions about the entire corpus.

**How it works**:
1. Map community summaries to the query
2. Each community generates a partial answer
3. Reduce/combine partial answers into a final response

**Best for**: "What are the main themes?", "Give me an overview of...", "What are common patterns across..."

**Analogy for agent memory**: "What have you learned about my preferences over all our conversations?"

### 4.2 Local Search

**Purpose**: Reasoning about specific entities and their neighborhoods.

**How it works**:
1. Identify relevant entities from the query
2. Fan out to neighboring entities and associated concepts in the graph
3. Gather relevant text chunks associated with those entities
4. Generate response using entity context + text chunks

**Best for**: "Tell me about entity X", "How does X relate to Y?", specific factual questions

**Analogy for agent memory**: "What do you know about my project 'Kraken'?"

### 4.3 DRIFT Search

**Purpose**: Enhanced local search with community context.

**How it works**:
1. Start with local search (entity-based)
2. Add community context from the hierarchy
3. Combine entity-level and community-level understanding

**Best for**: Questions that need both specific facts and broader context

**Analogy for agent memory**: "What's the status of my Kraken project and how does it fit into my broader goals?"

### 4.4 Basic Search

**Purpose**: Standard top-k vector search (baseline RAG fallback).

**Best for**: Simple factual lookups where graph traversal isn't needed.

---

## 5. Architecture & Data Model

### 5.1 Core Data Structures

| Structure | Description | Use |
|-----------|-------------|-----|
| **TextUnits** | Chunks of source text | Fine-grained references and provenance |
| **Entities** | Extracted nodes (people, concepts, etc.) | Graph nodes |
| **Relationships** | Connections between entities | Graph edges |
| **Claims** | Key assertions from text | Fact verification |
| **Communities** | Hierarchical clusters of entities | Thematic grouping |
| **Community Summaries** | LLM-generated summaries per community | Holistic reasoning |
| **Covariates** | Additional structured data | Extended analytics |

### 5.2 Storage

GraphRAG v3 uses a **modular storage** approach:
- Graph data stored in configurable backends
- Vector embeddings for semantic search component
- Supports both local and cloud storage

### 5.3 Configuration

Key configuration areas:
- **Language model selection** — which LLM for extraction and summarization
- **Prompt tuning** — critical for quality results on custom data
- **Chunking strategy** — TextUnit size and overlap
- **Entity extraction prompts** — domain-specific entity types
- **Community detection parameters** — Leiden algorithm settings

---

## 6. Adaptation for Agent Memory

### 6.1 How GraphRAG Maps to Agent Memory

| GraphRAG Concept | Agent Memory Equivalent |
|-----------------|------------------------|
| **Raw text corpus** | Conversation transcripts, memory files, user interactions |
| **TextUnits** | Individual messages, memory entries, skill execution logs |
| **Entities** | People, projects, tools, concepts, preferences the agent knows about |
| **Relationships** | How entities relate: "user works on project X", "project X uses technology Y" |
| **Communities** | Thematic clusters: "user's work projects", "user's coding preferences", "family matters" |
| **Community Summaries** | "User is a senior developer who prefers TypeScript, works on 3 active projects..." |
| **Global Search** | "What patterns do you see in how I work?" |
| **Local Search** | "What do you know about my database migration project?" |
| **DRIFT Search** | "How does my current task relate to what we discussed last week?" |

### 6.2 Incremental Indexing for Real-Time Memory

The standard GraphRAG pipeline is batch-oriented. For real-time agent memory, we need **incremental indexing**:

1. **Per-conversation updates**: After each conversation, extract entities/relationships from new messages
2. **Merge into existing graph**: Add new nodes/edges, update weights, detect new communities
3. **Re-summarize affected communities**: Only re-generate summaries for communities that changed
4. **Background optimization**: Periodically re-cluster and re-summarize the full graph

### 6.3 Memory Tiers with GraphRAG

| Tier | Content | GraphRAG Role | Update Frequency |
|------|---------|---------------|-----------------|
| **Working Memory** | Current conversation context | Not indexed | Real-time |
| **Short-term Memory** | Recent conversations, daily logs | Entities extracted, light indexing | End of session |
| **Long-term Memory** | Curated facts, preferences, learned patterns | Full graph with communities | Periodic background |
| **Episodic Memory** | Conversation transcripts, event logs | TextUnits for provenance | Append-only |

### 6.4 Query Patterns for Agent Use

| User Question | Query Type | Graph Traversal |
|--------------|------------|-----------------|
| "What do you know about my project X?" | Local Search | Find entity "project X" → fan out to related entities |
| "What patterns do you see in my work?" | Global Search | Community summaries across all work-related communities |
| "How does topic A relate to topic B?" | DRIFT Search | Find both entities → traverse paths → add community context |
| "Remember when we discussed..." | Basic + Local | Vector search for text match + entity context |
| "What should I focus on today?" | Global + Local | User's active projects (local) + overall priorities (global) |

---

## 7. Challenges & Considerations

### 7.1 Cost

- **Indexing is expensive**: Every piece of text goes through LLM extraction (entities, relationships, claims)
- For agent memory: need to be selective about what gets indexed vs. what stays as raw text
- **Mitigation**: Use cheaper/faster models for extraction (e.g., GPT-4o-mini), only index "important" conversations

### 7.2 Latency

- Graph construction and community detection are not instant
- Community summarization requires sequential LLM calls
- **Mitigation**: Background indexing, incremental updates, caching community summaries

### 7.3 Graph Quality

- Entity extraction quality depends heavily on prompt tuning
- Duplicate entities (same concept, different names) need deduplication
- Relationship extraction can be noisy
- **Mitigation**: Entity resolution/deduplication pass, prompt tuning for domain

### 7.4 Scale

- Knowledge graphs grow with every conversation
- Community detection algorithms have complexity considerations
- Storage and retrieval performance at scale
- **Mitigation**: Temporal decay, pruning old/irrelevant nodes, hierarchical storage

---

## 8. Key Takeaways for Architecture Design

### What GraphRAG Brings to the Table

1. **Relational reasoning** — traverse connections between memories and concepts
2. **Holistic understanding** — community summaries enable "big picture" answers
3. **Hierarchical structure** — zoom in/out from specific facts to broad themes
4. **Provenance** — every insight traces back to source conversations/documents
5. **Emergent insights** — community summaries reveal patterns not explicit in individual memories
6. **Multi-mode querying** — different search strategies for different question types

### What Needs Adaptation for Agent Use

1. **Incremental indexing** — batch pipeline needs to become real-time
2. **Cost management** — selective indexing, cheaper models for extraction
3. **Personal entity types** — need domain-specific types (preferences, goals, habits, not just people/places)
4. **Temporal awareness** — memories have timestamps, recency matters
5. **Privacy boundaries** — some entities/relationships should never be shared or persisted
6. **User steering** — user should be able to correct graph (wrong relationships, merged entities)
