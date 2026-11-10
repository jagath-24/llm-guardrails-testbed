CREATE TABLE `testbed_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` varchar(64) NOT NULL,
	`attackId` varchar(80) NOT NULL,
	`category` varchar(80) NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL,
	`input` text NOT NULL,
	`response` text NOT NULL,
	`inputBlocked` int NOT NULL DEFAULT 0,
	`outputBlocked` int NOT NULL DEFAULT 0,
	`passed` int NOT NULL DEFAULT 0,
	`reason` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `testbed_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `testbed_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` varchar(64) NOT NULL,
	`label` varchar(120) NOT NULL,
	`guardrailsEnabled` int NOT NULL DEFAULT 1,
	`targetMode` enum('mock','groq') NOT NULL DEFAULT 'mock',
	`promptVersion` varchar(80) NOT NULL DEFAULT 'v1.0.0',
	`totalAttacks` int NOT NULL DEFAULT 0,
	`passedCount` int NOT NULL DEFAULT 0,
	`blockedCount` int NOT NULL DEFAULT 0,
	`failedCount` int NOT NULL DEFAULT 0,
	`effectiveness` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `testbed_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `testbed_runs_runId_unique` UNIQUE(`runId`)
);
