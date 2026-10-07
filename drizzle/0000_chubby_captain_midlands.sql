CREATE TABLE `community_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`first_at` integer NOT NULL,
	`tx_hash` text NOT NULL,
	`network` text NOT NULL,
	`partial` integer NOT NULL,
	`message` text NOT NULL,
	`topic` text NOT NULL,
	`edit_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_contributions_address_unique` ON `community_contributions` (`address`);--> statement-breakpoint
CREATE INDEX `community_created_idx` ON `community_contributions` (`created_at`);--> statement-breakpoint
CREATE TABLE `community_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`attempts` integer NOT NULL
);
