CREATE TABLE `collection_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`meta` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `collection_chat_user_collection_created_idx` ON `collection_chat_messages` (`user_id`,`collection_id`,`created_at`);