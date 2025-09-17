import chalk from "chalk";
import { createGitHubClient } from "./github.js";

/**
 * Validate environment configuration
 */
export async function validateEnvironment() {
  const errors = [];
  const warnings = [];

  console.log(chalk.cyan("🔍 Validating environment configuration...\n"));

  // Check required environment variables
  const requiredEnvVars = ["GITHUB_TOKEN"];

  const optionalEnvVars = [
    "OLLAMA_URL",
    "OLLAMA_MODEL",
    "APP_URL",
    "DEFAULT_REPO",
  ];

  // Validate required variables
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      errors.push(`${envVar} is required but not set`);
    } else {
      console.log(chalk.green(`✅ ${envVar} is configured`));
    }
  }

  // Check optional variables
  for (const envVar of optionalEnvVars) {
    if (!process.env[envVar]) {
      warnings.push(`${envVar} is not set (optional but recommended)`);
    } else {
      console.log(chalk.green(`✅ ${envVar} is configured`));
    }
  }

  // Test GitHub authentication
  if (process.env.GITHUB_TOKEN) {
    try {
      const octokit = createGitHubClient();
      await octokit.rest.users.getAuthenticated();
      console.log(chalk.green("✅ GitHub authentication successful"));
    } catch (error) {
      errors.push(`GitHub authentication failed: ${error.message}`);
    }
  }

  // Validate URLs if provided
  const urlEnvVars = ["APP_URL", "APP_STAGING_URL", "APP_PROD_URL"];
  for (const urlVar of urlEnvVars) {
    if (process.env[urlVar]) {
      try {
        new URL(process.env[urlVar]);
        console.log(chalk.green(`✅ ${urlVar} is a valid URL`));
      } catch {
        warnings.push(`${urlVar} is not a valid URL: ${process.env[urlVar]}`);
      }
    }
  }

  // Display warnings
  if (warnings.length > 0) {
    console.log(chalk.yellow("\n⚠️  Warnings:"));
    warnings.forEach((warning) => {
      console.log(chalk.yellow(`   • ${warning}`));
    });
  }

  // Display errors and exit if any
  if (errors.length > 0) {
    console.log(chalk.red("\n❌ Errors:"));
    errors.forEach((error) => {
      console.log(chalk.red(`   • ${error}`));
    });
    console.log(
      chalk.red("\n💡 Please check your .env file or run: npm run setup\n")
    );
    process.exit(1);
  }

  if (warnings.length === 0 && errors.length === 0) {
    console.log(chalk.green("\n🎉 Environment configuration is valid!\n"));
  } else {
    console.log(
      chalk.yellow("\n⚠️  Environment has warnings but is functional\n")
    );
  }
}

/**
 * Validate PR-specific parameters
 * @param {string} repository - Repository in owner/repo format
 * @param {string|number} prNumber - PR number
 */
export function validatePRParameters(repository, prNumber) {
  const errors = [];

  // Validate repository format
  if (!repository || !repository.includes("/")) {
    errors.push(
      'Repository must be in owner/repo format (e.g., "browserstack/frontend")'
    );
  }

  // Validate PR number
  if (!prNumber || isNaN(parseInt(prNumber))) {
    errors.push("PR number must be a valid integer");
  }

  if (errors.length > 0) {
    throw new Error(
      `Validation failed:\n${errors.map((e) => `• ${e}`).join("\n")}`
    );
  }
}

/**
 * Check if required directories exist, create them if they don't
 */
export async function ensureDirectories() {
  const fs = await import("fs/promises");
  const path = await import("path");

  const requiredDirs = [
    process.env.ARTIFACTS_DIR || "./artifacts",
    "./config",
    "./src",
  ];

  for (const dir of requiredDirs) {
    try {
      await fs.access(dir);
      console.log(chalk.green(`✅ Directory exists: ${dir}`));
    } catch {
      try {
        await fs.mkdir(dir, { recursive: true });
        console.log(chalk.green(`✅ Created directory: ${dir}`));
      } catch (error) {
        throw new Error(`Failed to create directory ${dir}: ${error.message}`);
      }
    }
  }
}
