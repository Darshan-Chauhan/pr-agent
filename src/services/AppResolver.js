import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import axios from "axios";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves which local application to test based on GitHub PR changes
 */
export class AppResolver {
  constructor() {
    this.mappings = null;
    this.configPath = path.join(__dirname, "../../config/app-mapping.json");
  }

  /**
   * Load app mappings configuration
   */
  async loadMappings() {
    try {
      const configData = await fs.readFile(this.configPath, "utf8");
      this.mappings = JSON.parse(configData);
      console.log(
        chalk.cyan(
          `📋 Loaded ${this.mappings.mappings.length} app mapping configurations`
        )
      );
      return this.mappings;
    } catch (error) {
      console.error(chalk.red(`Failed to load app mappings: ${error.message}`));
      throw error;
    }
  }

  /**
   * Resolve target application based on PR file changes
   * @param {object} prDetails - PR details from GitHub API
   * @param {Array} changedFiles - List of changed files in PR
   * @returns {object|null} - Matching app configuration
   */
  async resolveTargetApp(prDetails, changedFiles) {
    console.log(
      chalk.cyan("🎯 Resolving target application from PR changes...")
    );

    if (!this.mappings) {
      await this.loadMappings();
    }

    // Analyze changed files to find matching app
    const matchScores = new Map();

    for (const mapping of this.mappings.mappings) {
      let score = 0;
      const matchedPaths = [];

      // Check if PR affects this app's repository paths
      for (const changedFile of changedFiles) {
        for (const repoPath of mapping.repository.paths) {
          if (this.matchesPath(changedFile.filename, repoPath)) {
            // Higher score for more specific matches
            const pathSpecificity = this.calculatePathSpecificity(repoPath);
            const changeWeight = this.getChangeWeight(changedFile);
            score += pathSpecificity * changeWeight;

            matchedPaths.push({
              file: changedFile.filename,
              pattern: repoPath,
              changes: changedFile.changes || 0,
              status: changedFile.status,
            });
          }
        }
      }

      if (score > 0) {
        matchScores.set(mapping.id, {
          mapping,
          score,
          matchedPaths,
          confidence: this.calculateConfidence(
            score,
            matchedPaths.length,
            changedFiles.length
          ),
        });
      }
    }

    // Find the best match
    if (matchScores.size === 0) {
      console.log(
        chalk.yellow("⚠️  No matching applications found for PR changes")
      );
      return null;
    }

    // Sort by score and return the best match
    const sortedMatches = Array.from(matchScores.values()).sort(
      (a, b) => b.score - a.score
    );
    const bestMatch = sortedMatches[0];

    console.log(
      chalk.green(
        `✅ Target app resolved: ${bestMatch.mapping.name} (confidence: ${(
          bestMatch.confidence * 100
        ).toFixed(1)}%)`
      )
    );
    console.log(
      chalk.gray(
        `   Matched paths: ${bestMatch.matchedPaths.length}, Score: ${bestMatch.score}`
      )
    );

    // Log matched files for transparency
    for (const match of bestMatch.matchedPaths.slice(0, 5)) {
      console.log(chalk.gray(`   📄 ${match.file} (${match.changes} changes)`));
    }

    return {
      ...bestMatch.mapping,
      resolution: {
        confidence: bestMatch.confidence,
        score: bestMatch.score,
        matchedPaths: bestMatch.matchedPaths,
        alternativeMatches: sortedMatches.slice(1, 3), // Show top 2 alternatives
      },
    };
  }

  /**
   * Check if file path matches pattern (supports glob-like patterns)
   */
  matchesPath(filePath, pattern) {
    // Handle different pattern types
    if (pattern.endsWith("**")) {
      // Path prefix matching (e.g., "apps/quality-dashboard/**")
      const prefix = pattern.replace("**", "");
      return filePath.startsWith(prefix);
    } else if (pattern.includes("*")) {
      // Convert glob-like pattern to regex
      const regexPattern = pattern
        .replace(/\*\*/g, ".*") // ** matches any path
        .replace(/\*/g, "[^/]*") // * matches any filename part
        .replace(/\./g, "\\.") // Escape dots
        .replace(/\//g, "\\/"); // Escape slashes

      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(filePath);
    } else {
      // Exact path matching
      return filePath === pattern || filePath.startsWith(pattern + "/");
    }
  }

  /**
   * Calculate path specificity (more specific paths get higher scores)
   */
  calculatePathSpecificity(pattern) {
    const parts = pattern
      .split("/")
      .filter((part) => part && part !== "**" && part !== "*");
    const baseScore = parts.length;

    // Bonus points for specific file types or directories
    if (pattern.includes("src/")) return baseScore + 2;
    if (pattern.includes("components/")) return baseScore + 1;
    if (pattern.includes("pages/")) return baseScore + 1;
    if (pattern.includes("**")) return Math.max(baseScore - 1, 1);

    return baseScore;
  }

  /**
   * Get weight for different types of changes
   */
  getChangeWeight(changedFile) {
    const { status, changes, filename } = changedFile;

    let weight = 1;

    // Status-based weights
    if (status === "added") weight += 0.5;
    if (status === "modified") weight += 1;
    if (status === "removed") weight += 0.3;

    // Change amount weights
    if (changes > 100) weight += 1;
    if (changes > 50) weight += 0.5;

    // File type weights
    const ext = path.extname(filename).toLowerCase();
    if ([".jsx", ".tsx", ".js", ".ts"].includes(ext)) weight += 1;
    if ([".css", ".scss", ".less"].includes(ext)) weight += 0.5;
    if ([".json", ".config.js"].includes(ext)) weight += 0.8;

    // Critical file weights
    if (filename.includes("package.json")) weight += 2;
    if (filename.includes("index.") || filename.includes("main."))
      weight += 1.5;
    if (filename.includes("App.jsx") || filename.includes("App.tsx"))
      weight += 2;

    return weight;
  }

  /**
   * Calculate confidence score
   */
  calculateConfidence(score, matchedPathsCount, totalFiles) {
    const pathCoverage = matchedPathsCount / totalFiles;
    const normalizedScore = Math.min(score / 10, 1); // Normalize score

    // Combine factors for confidence
    const confidence = pathCoverage * 0.6 + normalizedScore * 0.4;

    return Math.min(confidence, 1);
  }

  /**
   * Verify that target app is available locally
   * @param {object} appConfig - App configuration
   * @returns {boolean} - Whether app is accessible
   */
  async verifyAppAvailability(appConfig) {
    console.log(chalk.blue(`🔍 Verifying app availability: ${appConfig.name}`));

    try {
      // Check if app URL is accessible
      const healthUrl = `${appConfig.localApp.baseUrl}${
        appConfig.localApp.healthCheck || "/"
      }`;

      const response = await axios.get(healthUrl, {
        timeout: 5000,
        validateStatus: (status) => status < 500, // Accept any status < 500
      });

      console.log(
        chalk.green(
          `✅ App is available at ${appConfig.localApp.baseUrl} (status: ${response.status})`
        )
      );
      return true;
    } catch (error) {
      if (error.code === "ECONNREFUSED") {
        console.log(
          chalk.red(`❌ App not running at ${appConfig.localApp.baseUrl}`)
        );
        console.log(
          chalk.yellow(`💡 Try running: ${appConfig.localApp.startCommand}`)
        );
      } else {
        console.log(chalk.yellow(`⚠️  App check failed: ${error.message}`));
      }
      return false;
    }
  }

  /**
   * Get app configuration by ID
   */
  async getAppById(appId) {
    if (!this.mappings) {
      await this.loadMappings();
    }

    return (
      this.mappings.mappings.find((mapping) => mapping.id === appId) || null
    );
  }

  /**
   * List all available applications
   */
  async listAvailableApps() {
    if (!this.mappings) {
      await this.loadMappings();
    }

    console.log(chalk.cyan("📱 Available applications:"));

    for (const mapping of this.mappings.mappings) {
      console.log(chalk.blue(`  ${mapping.id}: ${mapping.name}`));
      console.log(chalk.gray(`     URL: ${mapping.localApp.baseUrl}`));
      console.log(
        chalk.gray(`     Paths: ${mapping.repository.paths.join(", ")}`)
      );
    }

    return this.mappings.mappings;
  }

  /**
   * Override app resolution (for manual testing)
   */
  async resolveAppManually(appIdOrUrl) {
    console.log(chalk.cyan(`🎯 Manual app resolution: ${appIdOrUrl}`));

    if (!this.mappings) {
      await this.loadMappings();
    }

    // Check if it's an app ID
    const appById = this.mappings.mappings.find((m) => m.id === appIdOrUrl);
    if (appById) {
      console.log(chalk.green(`✅ Found app by ID: ${appById.name}`));
      return appById;
    }

    // Check if it's a URL that matches an app
    const appByUrl = this.mappings.mappings.find(
      (m) =>
        m.localApp.baseUrl === appIdOrUrl ||
        appIdOrUrl.startsWith(m.localApp.baseUrl)
    );
    if (appByUrl) {
      console.log(chalk.green(`✅ Found app by URL: ${appByUrl.name}`));
      return appByUrl;
    }

    // Create a custom app config for unknown URL
    if (appIdOrUrl.startsWith("http")) {
      console.log(
        chalk.yellow(`⚠️  Creating custom app config for: ${appIdOrUrl}`)
      );

      return {
        id: "custom-app",
        name: "Custom Application",
        description: "Manually specified application",
        repository: { paths: [] },
        localApp: {
          baseUrl: appIdOrUrl,
          healthCheck: "/",
        },
        testConfig: {
          routes: [{ path: "/", name: "Home Page", critical: true }],
          components: [],
        },
      };
    }

    throw new Error(`Could not resolve app: ${appIdOrUrl}`);
  }

  /**
   * Update app mapping configuration
   */
  async updateMapping(appId, updates) {
    if (!this.mappings) {
      await this.loadMappings();
    }

    const appIndex = this.mappings.mappings.findIndex((m) => m.id === appId);
    if (appIndex === -1) {
      throw new Error(`App not found: ${appId}`);
    }

    // Deep merge updates
    this.mappings.mappings[appIndex] = {
      ...this.mappings.mappings[appIndex],
      ...updates,
    };

    // Save updated configuration
    await fs.writeFile(this.configPath, JSON.stringify(this.mappings, null, 2));

    console.log(chalk.green(`✅ Updated app configuration: ${appId}`));
  }

  /**
   * Get default configuration
   */
  getDefaultConfig() {
    return (
      this.mappings?.defaultConfig || {
        timeout: 30000,
        retries: 3,
        headless: true,
        viewport: { width: 1920, height: 1080 },
      }
    );
  }
}
