#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import { config } from "dotenv";
import { PRAgent } from "./src/core/PRAgent.js";
import { validateEnvironment } from "./src/utils/validation.js";
import { parsePRUrl } from "./src/utils/github.js";

// Load environment variables
config();

program
  .name("pr-agent")
  .description(
    "PR-Aware Exploration Agent - AI-assisted developer productivity & quality tool"
  )
  .version("1.0.0");

program
  .command("run")
  .description("Run PR exploration on a specific PR")
  .option("-p, --pr <number>", "PR number to analyze")
  .option("-r, --repo <repo>", "Repository (owner/repo format)")
  .option(
    "--pr-url <url>",
    "Full GitHub PR URL (e.g., https://github.com/owner/repo/pull/123)"
  )
  .option("-u, --url <url>", "Application URL to test against")
  .option("-d, --dry-run", "Dry run mode - generate plan without execution")
  .option("-h, --headed", "Run in headed mode (show browser)")
  .option("-v, --verbose", "Verbose logging")
  .action(async (options) => {
    try {
      console.log(
        chalk.blue.bold("🤖 PR-Aware Exploration Agent Starting...\n")
      );

      // Validate environment
      await validateEnvironment();

      // Parse PR information from URL if provided
      let prNumber = options.pr;
      let repository = options.repo;

      if (options.prUrl) {
        const prInfo = parsePRUrl(options.prUrl);
        prNumber = prInfo.prNumber;
        repository = prInfo.repository;
        console.log(chalk.cyan(`📋 Parsed PR: #${prNumber} in ${repository}`));
      }

      // Use environment defaults if not specified
      prNumber = prNumber || process.env.DEFAULT_PR_NUMBER;
      repository = repository || process.env.DEFAULT_REPO;

      if (!prNumber) {
        console.error(
          chalk.red(
            "❌ Error: PR number is required. Use --pr, --pr-url, or set DEFAULT_PR_NUMBER in .env"
          )
        );
        process.exit(1);
      }

      if (!repository) {
        console.error(
          chalk.red(
            "❌ Error: Repository is required. Use --repo, --pr-url, or set DEFAULT_REPO in .env"
          )
        );
        process.exit(1);
      }

      // Display constructed URL for clarity
      if (prNumber && repository && !options.prUrl) {
        const constructedUrl = `https://github.com/${repository}/pull/${prNumber}`;
        console.log(chalk.cyan(`🔗 PR URL: ${constructedUrl}`));
      }

      // Initialize PR Agent
      const agent = new PRAgent({
        prNumber,
        repository,
        appUrl: options.url || process.env.APP_URL,
        dryRun: options.dryRun,
        headed: options.headed,
        verbose: options.verbose,
      });

      // Run exploration
      await agent.explore();
    } catch (error) {
      console.error(chalk.red("❌ Error:"), error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command("setup")
  .description("Setup PR Agent environment and dependencies")
  .action(async () => {
    try {
      const { setupEnvironment } = await import("./src/utils/setup.js");
      await setupEnvironment();
    } catch (error) {
      console.error(chalk.red("❌ Setup failed:"), error.message);
      process.exit(1);
    }
  });

program
  .command("config")
  .description("Configure GitHub token and other settings")
  .action(async () => {
    try {
      const { configureSettings } = await import("./src/utils/config.js");
      await configureSettings();
    } catch (error) {
      console.error(chalk.red("❌ Configuration failed:"), error.message);
      process.exit(1);
    }
  });

program.parse();
