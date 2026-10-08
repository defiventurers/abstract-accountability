CREATE TABLE `voice_reactions` (
	`key` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `community_voices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `voice_reaction_idx` ON `voice_reactions` (`entry_id`,`kind`);--> statement-breakpoint
ALTER TABLE `evidence_submissions` ADD `category` text DEFAULT 'context' NOT NULL;--> statement-breakpoint
ALTER TABLE `evidence_submissions` ADD `question_id` text;