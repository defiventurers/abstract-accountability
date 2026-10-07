CREATE TABLE `evidence_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`source_url` text NOT NULL,
	`event_date` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`topic` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`submitted_at` integer NOT NULL,
	`published_at` integer,
	`review_note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `evidence_status_idx` ON `evidence_submissions` (`status`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `question_signals` (
	`key` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `question_signal_idx` ON `question_signals` (`question_id`);--> statement-breakpoint
CREATE TABLE `community_reports` (
	`key` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `report_entry_idx` ON `community_reports` (`entry_id`);--> statement-breakpoint
CREATE TABLE `community_voices` (
	`id` text PRIMARY KEY NOT NULL,
	`message` text NOT NULL,
	`topic` text NOT NULL,
	`edit_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`visible` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_voices_edit_hash_unique` ON `community_voices` (`edit_hash`);--> statement-breakpoint
CREATE INDEX `voice_created_idx` ON `community_voices` (`created_at`);--> statement-breakpoint
ALTER TABLE `community_contributions` ADD `visible` integer DEFAULT 1 NOT NULL;