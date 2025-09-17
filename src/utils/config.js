import inquirer from "inquirer";
import chalk from "chalk";
i    {
      type: 'input',
      name: 'ollamaUr# LLM Configuration
OLLAMA_URL=${config.ollamaUrl}
OLLAMA_MODEL=${config.ollamaModel}
OLLAMA_TIMEOUT=30000      message: 'Ollama URL (for local LLM):',
      default: 'http://127.0.0.1:11434'
    },
    {
      type: 'input',
      name: 'ollamaModel',
      message: 'Ollama model name:',
      default: 'llama2'
    },{ writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";

/**
 * Interactive configuration setup
 */
export async function configureSettings() {
  console.log(chalk.blue.bold("🛠️  PR Agent Configuration Setup\n"));

  // Check if .env already exists
  const envExists = existsSync(".env");
  if (envExists) {
    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: ".env file already exists. Do you want to update it?",
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.yellow("Configuration cancelled."));
      return;
    }
  }

  // Gather configuration
  const config = await inquirer.prompt([
    {
      type: "password",
      name: "githubToken",
      message: "Enter your GitHub Personal Access Token:",
      validate: (input) =>
        input.length > 0 ? true : "GitHub token is required",
      mask: "*",
    },
    {
      type: "input",
      name: "defaultRepo",
      message: "Default repository (owner/repo format):",
      default: "browserstack/frontend",
      validate: (input) =>
        input.includes("/") ? true : "Repository must be in owner/repo format",
    },
    {
      type: "input",
      name: "appUrl",
      message: "Default application URL:",
      default: "http://localhost:3000",
      validate: (input) => {
        try {
          new URL(input);
          return true;
        } catch {
          return "Please enter a valid URL";
        }
      },
    },
    {
      type: "password",
      name: "openaiKey",
      message: "OpenAI API Key (optional, for LLM features):",
      mask: "*",
    },
    {
      type: "confirm",
      name: "headless",
      message: "Run browser in headless mode by default?",
      default: false,
    },
    {
      type: "confirm",
      name: "verbose",
      message: "Enable verbose logging by default?",
      default: true,
    },
  ]);

  // Generate .env content
  const envContent = `# GitHub Configuration
GITHUB_TOKEN=${config.githubToken}
GITHUB_API_URL=https://api.github.com

# Default Repository Configuration
DEFAULT_REPO=${config.defaultRepo}
DEFAULT_BRANCH=master

# Application Configuration
APP_URL=${config.appUrl}
APP_STAGING_URL=
APP_PROD_URL=

# PR Configuration
DEFAULT_PR_NUMBER=

# LLM Configuration
OPENAI_API_KEY=${config.openaiKey || ""}
OPENAI_MODEL=gpt-4
ANTHROPIC_API_KEY=

# Playwright Configuration
BROWSER_TYPE=chromium
HEADLESS=${config.headless}
TIMEOUT=30000
VIEWPORT_WIDTH=1280
VIEWPORT_HEIGHT=720

# Exploration Configuration
MAX_STEPS=20
MAX_DURATION_MINUTES=5
RETRY_FAILED_STEPS=true

# Artifact Storage
ARTIFACTS_DIR=./artifacts
KEEP_ARTIFACTS_DAYS=7

# Notification Configuration
SLACK_WEBHOOK_URL=
JIRA_API_URL=
JIRA_EMAIL=
JIRA_API_TOKEN=

# Debug Configuration
DEBUG_MODE=false
VERBOSE_LOGGING=${config.verbose}
SAVE_TRACES=true
SAVE_SCREENSHOTS=true
SAVE_HAR=true
SAVE_CPU_PROFILE=true
`;

  try {
    await writeFile(".env", envContent);
    console.log(chalk.green("\n✅ Configuration saved to .env file"));
    console.log(chalk.cyan("\n💡 You can now run: npm run dev"));
  } catch (error) {
    console.error(chalk.red("❌ Failed to save configuration:"), error.message);
  }
}
