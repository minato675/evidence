import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
});

export const searchRuns = sqliteTable(
  "search_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    query: text("query").notNull(),
    resultCount: integer("result_count").notNull(),
    maxPapers: integer("max_papers"),
    fromYear: integer("from_year"),
    toYear: integer("to_year"),
    collectionId: text("collection_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("search_runs_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const searchCache = sqliteTable("search_cache", {
  key: text("key").primaryKey(),
  provider: text("provider").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export const researchCollections = sqliteTable(
  "research_collections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("research_collections_user_updated_idx").on(
      table.userId,
      table.updatedAt,
    ),
  ],
);

export const collectionPapers = sqliteTable(
  "collection_papers",
  {
    collectionId: text("collection_id").notNull(),
    paperId: text("paper_id").notNull(),
    payload: text("payload").notNull(),
    addedAt: integer("added_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.paperId] }),
    index("collection_papers_collection_added_idx").on(
      table.collectionId,
      table.addedAt,
    ),
  ],
);

export const collectionChatMessages = sqliteTable(
  "collection_chat_messages",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    meta: text("meta"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("collection_chat_user_collection_created_idx").on(
      table.userId,
      table.collectionId,
      table.createdAt,
    ),
  ],
);

export const allowedUsers = sqliteTable("allowed_users", {
  email: text("email").primaryKey(),
  role: text("role").notNull().default("member"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const tokenUsageEvents = sqliteTable(
  "token_usage_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    totalTokens: integer("total_tokens").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("token_usage_email_created_idx").on(table.email, table.createdAt),
    index("token_usage_created_idx").on(table.createdAt),
  ],
);

export const paperInsights = sqliteTable(
  "paper_insights",
  {
    userId: text("user_id").notNull(),
    paperId: text("paper_id").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    payload: text("payload").notNull(),
    model: text("model").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.paperId] }),
    index("paper_insights_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const notices = sqliteTable(
  "notices",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull().default("notice"),
    title: text("title").notNull(),
    version: text("version"),
    content: text("content").notNull(),
    authorEmail: text("author_email").notNull(),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("notices_published_idx").on(table.publishedAt)],
);
