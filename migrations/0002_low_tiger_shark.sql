CREATE TABLE `repositories` (
	`fullName` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`lastSyncAt` integer DEFAULT 0 NOT NULL,
	`errorMessage` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
