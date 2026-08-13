CREATE TABLE `token_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`total_tokens` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `token_usage_email_created_idx` ON `token_usage_events` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `token_usage_created_idx` ON `token_usage_events` (`created_at`);