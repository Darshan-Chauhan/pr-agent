#!/usr/bin/env node

import chalk from "chalk";
import inquirer from "inquirer";
import { config } from "dotenv";
import { PRAgent } from "./src/core/PRAgent.js";
import { validateEnvironment } from "./src/utils/validation.js";
import { parsePRUrl } from "./src/utils/github.js";

// Load environment variables
config();

async function devRun() {
  try {
    console.log(chalk.blue.bold("🚀 PR Agent Development Mode\n"));

    // Validate environment first
    await validateEnvironment();

    // Check if we have default repository configured
    const defaultRepo = process.env.DEFAULT_REPO || "browserstack/frontend";
    const hasDefaultRepo = !!defaultRepo;

    let prNumber, repository;

    // If we have a default repo, just ask for PR number directly
    if (hasDefaultRepo) {
      console.log(chalk.cyan(`📋 Using default repository: ${defaultRepo}`));

      const prAnswer = await inquirer.prompt([
        {
          type: "input",
          name: "prNumber",
          message: "Enter PR number:",
          validate: (input) => {
            const num = parseInt(input);
            return !isNaN(num) && num > 0
              ? true
              : "Please enter a valid PR number";
          },
        },
      ]);

      prNumber = prAnswer.prNumber;
      repository = defaultRepo;

      // Automatically construct and display the URL
      const constructedUrl = `https://github.com/${repository}/pull/${prNumber}`;
      console.log(chalk.green(`🔗 PR URL: ${constructedUrl}\n`));
    } else {
      // Fallback to the original method if no default repo
      const answers = await inquirer.prompt([
        {
          type: "list",
          name: "inputMethod",
          message: "How would you like to specify the PR?",
          choices: [
            {
              name: "PR URL (e.g., https://github.com/owner/repo/pull/123)",
              value: "url",
            },
            { name: "PR Number + Repository", value: "manual" },
          ],
        },
      ]);

      if (answers.inputMethod === "url") {
        const urlResponse = await inquirer.prompt([
          {
            type: "input",
            name: "prUrl",
            message: "Enter GitHub PR URL:",
            validate: (input) => {
              try {
                parsePRUrl(input);
                return true;
              } catch {
                return "Please enter a valid GitHub PR URL (e.g., https://github.com/owner/repo/pull/123)";
              }
            },
          },
        ]);

        const prInfo = parsePRUrl(urlResponse.prUrl);
        prNumber = prInfo.prNumber;
        repository = prInfo.repository;
      } else {
        const manualAnswers = await inquirer.prompt([
          {
            type: "input",
            name: "prNumber",
            message: "Enter PR number:",
            validate: (input) => {
              const num = parseInt(input);
              return !isNaN(num) && num > 0
                ? true
                : "Please enter a valid PR number";
            },
          },
          {
            type: "input",
            name: "repository",
            message: "Enter repository (owner/repo format):",
            default: process.env.DEFAULT_REPO || "browserstack/frontend",
            validate: (input) =>
              input.includes("/")
                ? true
                : "Repository must be in owner/repo format",
          },
        ]);

        prNumber = manualAnswers.prNumber;
        repository = manualAnswers.repository;
      }
    }

    // Additional configuration - get from environment or use defaults
    const config = {
      appUrl: process.env.APP_URL || "http://localhost:3000",
      dryRun: process.env.DRY_RUN === "true",
      headed: process.env.HEADLESS === "false" || !process.env.HEADLESS,
      verbose: process.env.VERBOSE_LOGGING !== "false",
      cleanArtifacts: process.env.CLEAN_ARTIFACTS === "true",
    };

    // Only ask for app URL if not set in environment
    if (!process.env.APP_URL) {
      const appUrlResponse = await inquirer.prompt([
        {
          type: "input",
          name: "appUrl",
          message: "Enter application URL to test:",
          default: config.appUrl,
          validate: (input) => {
            try {
              new URL(input);
              return true;
            } catch {
              return "Please enter a valid URL";
            }
          },
        },
      ]);
      config.appUrl = appUrlResponse.appUrl;
    }

    console.log(
      chalk.green("\n✅ Configuration complete. Starting exploration...\n")
    );
    console.log(chalk.cyan(`📋 Target: PR #${prNumber} in ${repository}`));
    console.log(chalk.cyan(`🌐 App URL: ${config.appUrl}`));
    console.log(
      chalk.cyan(`🔍 Mode: ${config.dryRun ? "Dry Run" : "Full Exploration"}`)
    );
    console.log(
      chalk.cyan(`👁️  Browser: ${config.headed ? "Visible" : "Headless"}`)
    );
    console.log(
      chalk.cyan(`📝 Verbose: ${config.verbose ? "Enabled" : "Disabled"}`)
    );

    // Clean artifacts if requested
    if (config.cleanArtifacts) {
      console.log(chalk.yellow("🗑️  Clean artifacts mode enabled"));
      const { ArtifactManager } = await import(
        "./src/artifacts/ArtifactManager.js"
      );
      const artifactManager = new ArtifactManager();
      await artifactManager.cleanAllArtifacts();
    }

    console.log(); // Empty line

    // Initialize PR Agent
    const agent = new PRAgent({
      prNumber,
      repository,
      appUrl: config.appUrl,
      dryRun: config.dryRun,
      headed: config.headed,
      verbose: config.verbose,
    });

    // Run exploration
    await agent.explore();
  } catch (error) {
    console.error(chalk.red("❌ Development run failed:"), error.message);
    if (process.env.DEBUG_MODE === "true") {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

devRun();
