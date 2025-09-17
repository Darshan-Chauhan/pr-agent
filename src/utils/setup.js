import chalk from "chalk";
import { spawn } from "child_process";
import { configureSettings } from "./config.js";
import { ensureDirectories } from "./validation.js";

/**
 * Setup PR Agent environment and dependencies
 */
export async function setupEnvironment() {
  console.log(chalk.blue.bold("🛠️  PR Agent Setup\n"));

  try {
    // Step 1: Ensure required directories exist
    console.log(chalk.cyan("📁 Creating required directories..."));
    await ensureDirectories();

    // Step 2: Install Playwright browsers
    console.log(chalk.cyan("🎭 Installing Playwright browsers..."));
    await installPlaywrightBrowsers();

    // Step 3: Configure environment variables
    console.log(chalk.cyan("⚙️  Configuring environment..."));
    await configureSettings();

    console.log(chalk.green.bold("\n🎉 Setup completed successfully!"));
    console.log(chalk.cyan("\n💡 Next steps:"));
    console.log(chalk.white("  1. Run: npm run dev"));
    console.log(chalk.white("  2. Or: npm run run -- --pr-url <your-pr-url>"));
  } catch (error) {
    console.error(chalk.red("❌ Setup failed:"), error.message);
    process.exit(1);
  }
}

/**
 * Install Playwright browsers
 */
function installPlaywrightBrowsers() {
  return new Promise((resolve, reject) => {
    console.log(
      chalk.gray("Installing Chromium, Firefox, and WebKit browsers...")
    );

    const process = spawn("npx", ["playwright", "install"], {
      stdio: "inherit",
      shell: true,
    });

    process.on("close", (code) => {
      if (code === 0) {
        console.log(chalk.green("✅ Playwright browsers installed"));
        resolve();
      } else {
        reject(new Error(`Playwright installation failed with code ${code}`));
      }
    });

    process.on("error", (error) => {
      reject(
        new Error(`Failed to start Playwright installation: ${error.message}`)
      );
    });
  });
}

/**
 * Check system requirements
 */
export async function checkSystemRequirements() {
  const requirements = [];

  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.substring(1).split(".")[0]);

  if (majorVersion < 18) {
    requirements.push({
      name: "Node.js",
      current: nodeVersion,
      required: "≥18.0.0",
      status: "error",
    });
  } else {
    requirements.push({
      name: "Node.js",
      current: nodeVersion,
      required: "≥18.0.0",
      status: "ok",
    });
  }

  // Display requirements
  console.log(chalk.cyan("\n🔍 System Requirements Check:"));
  requirements.forEach((req) => {
    const icon = req.status === "ok" ? "✅" : "❌";
    const color = req.status === "ok" ? chalk.green : chalk.red;
    console.log(
      color(`${icon} ${req.name}: ${req.current} (required: ${req.required})`)
    );
  });

  const hasErrors = requirements.some((req) => req.status === "error");
  if (hasErrors) {
    console.log(
      chalk.red(
        "\n❌ System requirements not met. Please upgrade Node.js to version 18 or higher."
      )
    );
    process.exit(1);
  }

  return requirements;
}
