CREATE TABLE `paper_insights` (
	`user_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`payload` text NOT NULL,
	`model` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `paper_id`)
);
--> statement-breakpoint
CREATE INDEX `paper_insights_user_updated_idx` ON `paper_insights` (`user_id`,`updated_at`);