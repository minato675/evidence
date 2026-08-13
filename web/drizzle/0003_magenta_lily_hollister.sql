CREATE TABLE `allowed_users` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `collection_papers` (
	`collection_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`payload` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`collection_id`, `paper_id`)
);
--> statement-breakpoint
CREATE INDEX `collection_papers_collection_added_idx` ON `collection_papers` (`collection_id`,`added_at`);--> statement-breakpoint
CREATE TABLE `research_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `research_collections_user_updated_idx` ON `research_collections` (`user_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `search_runs` ADD `collection_id` text;