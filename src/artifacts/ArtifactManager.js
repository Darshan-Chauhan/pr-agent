import fs from "fs/promises";
import path from "path";
import chalk from "chalk";

/**
 * Manages artifacts (screenshots, HAR files, reports) from test execution
 */
export class ArtifactManager {
  constructor(options = {}) {
    this.baseDir = options.baseDir || "artifacts";
    this.timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.currentRunDir = null;
  }

  /**
   * Initialize artifacts directory for a new run
   * @param {string} prNumber - PR number for organization
   * @param {boolean} cleanOldRuns - Whether to clean up old runs (default: true)
   * @returns {string} - Path to run directory
   */
  async initializeRun(prNumber, cleanOldRuns = true) {
    // Clean up old artifacts first
    if (cleanOldRuns) {
      await this.cleanupOldRuns(5); // Keep only 5 most recent runs
    }

    const runId = `pr-${prNumber}-${this.timestamp}`;
    this.currentRunDir = path.join(this.baseDir, runId);

    console.log(
      chalk.cyan(`📁 Initializing artifacts directory: ${this.currentRunDir}`)
    );

    await this.ensureDirectoryStructure();

    return this.currentRunDir;
  }

  /**
   * Create required directory structure
   */
  async ensureDirectoryStructure() {
    const directories = [
      this.currentRunDir,
      path.join(this.currentRunDir, "screenshots"),
      path.join(this.currentRunDir, "videos"),
      path.join(this.currentRunDir, "network"),
      path.join(this.currentRunDir, "reports"),
      path.join(this.currentRunDir, "logs"),
      path.join(this.currentRunDir, "dom-snapshots"),
    ];

    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Save execution results as JSON
   * @param {object} executionResults - Results from PlaywrightRunner
   * @returns {string} - Path to saved file
   */
  async saveExecutionResults(executionResults) {
    const filename = "execution-results.json";
    const filepath = path.join(this.currentRunDir, "reports", filename);

    await fs.writeFile(filepath, JSON.stringify(executionResults, null, 2));

    console.log(chalk.green(`💾 Execution results saved: ${filepath}`));
    return filepath;
  }

  /**
   * Save analysis results as JSON
   * @param {object} analysisResults - Results from DetectorManager
   * @returns {string} - Path to saved file
   */
  async saveAnalysisResults(analysisResults) {
    const filename = "analysis-results.json";
    const filepath = path.join(this.currentRunDir, "reports", filename);

    await fs.writeFile(filepath, JSON.stringify(analysisResults, null, 2));

    console.log(chalk.green(`🔍 Analysis results saved: ${filepath}`));
    return filepath;
  }

  /**
   * Generate and save HTML report
   * @param {object} reportData - Combined execution and analysis data
   * @returns {string} - Path to HTML report
   */
  async generateHTMLReport(reportData) {
    const filename = "pr-exploration-report.html";
    const filepath = path.join(this.currentRunDir, "reports", filename);

    const html = this.generateHTMLContent(reportData);
    await fs.writeFile(filepath, html);

    console.log(chalk.green(`📄 HTML report generated: ${filepath}`));
    return filepath;
  }

  /**
   * Generate HTML content for report
   */
  generateHTMLContent(reportData) {
    const { executionResults, analysisResults, prDetails } = reportData;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PR Exploration Report - #${prDetails.number}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .header { border-bottom: 2px solid #007acc; padding-bottom: 20px; margin-bottom: 30px; }
        .section { margin-bottom: 30px; }
        .issue { border-left: 4px solid #ff6b6b; padding: 15px; margin: 10px 0; background: #fff5f5; }
        .issue.major { border-color: #ffa500; background: #fff8e1; }
        .issue.minor { border-color: #4caf50; background: #f1f8e9; }
        .metric { display: inline-block; margin: 10px; padding: 15px; background: #e3f2fd; border-radius: 4px; }
        .screenshot { max-width: 300px; margin: 10px; border: 1px solid #ddd; }
        .step { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 4px; }
        .success { background: #e8f5e8; }
        .failed { background: #ffe8e8; }
        .recommendations { background: #f0f8ff; padding: 20px; border-radius: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 PR Exploration Report</h1>
            <h2>PR #${prDetails.number}: ${prDetails.title}</h2>
            <p><strong>Author:</strong> ${
              prDetails.author
            } | <strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        </div>

        <div class="section">
            <h3>📊 Execution Summary</h3>
            <div class="metric"><strong>Total Steps:</strong> ${
              executionResults.totalSteps
            }</div>
            <div class="metric"><strong>Successful:</strong> ${
              executionResults.successfulSteps
            }</div>
            <div class="metric"><strong>Failed:</strong> ${
              executionResults.failedSteps
            }</div>
            <div class="metric"><strong>Execution Time:</strong> ${(
              executionResults.executionTimeMs / 1000
            ).toFixed(2)}s</div>
        </div>

        <div class="section">
            <h3>🚨 Issues Found</h3>
            <div class="metric"><strong>Total Issues:</strong> ${
              analysisResults.overallSummary.totalIssues
            }</div>
            <div class="metric"><strong>Critical:</strong> ${
              analysisResults.overallSummary.criticalIssues
            }</div>
            <div class="metric"><strong>Major:</strong> ${
              analysisResults.overallSummary.majorIssues
            }</div>
            <div class="metric"><strong>Minor:</strong> ${
              analysisResults.overallSummary.minorIssues
            }</div>
            <div class="metric"><strong>Risk Level:</strong> ${analysisResults.overallSummary.riskLevel.toUpperCase()}</div>
        </div>

        ${this.generateIssuesHTML(analysisResults)}
        ${this.generateStepsHTML(executionResults)}
        ${this.generateRecommendationsHTML(analysisResults)}

    </div>
</body>
</html>`;
  }

  /**
   * Generate issues section HTML
   */
  generateIssuesHTML(analysisResults) {
    let html = '<div class="section"><h3>🔍 Detailed Issues</h3>';

    for (const [detectorName, result] of Object.entries(
      analysisResults.detectorResults
    )) {
      if (result.issues && result.issues.length > 0) {
        html += `<h4>${
          detectorName.charAt(0).toUpperCase() + detectorName.slice(1)
        } Detector</h4>`;

        for (const issue of result.issues) {
          html += `
            <div class="issue ${issue.severity}">
              <h5>${issue.title}</h5>
              <p><strong>Severity:</strong> ${issue.severity.toUpperCase()}</p>
              <p><strong>Description:</strong> ${issue.description}</p>
              <p><strong>Impact:</strong> ${issue.impact}</p>
              <p><strong>Recommendation:</strong> ${issue.recommendation}</p>
            </div>`;
        }
      }
    }

    html += "</div>";
    return html;
  }

  /**
   * Generate steps section HTML
   */
  generateStepsHTML(executionResults) {
    let html = '<div class="section"><h3>📋 Execution Steps</h3>';

    for (const step of executionResults.steps.slice(0, 10)) {
      // Show first 10 steps
      html += `
        <div class="step ${step.status}">
          <h5>Step ${step.stepNumber}: ${step.description}</h5>
          <p><strong>Status:</strong> ${step.status}</p>
          <p><strong>Execution Time:</strong> ${step.executionTimeMs}ms</p>
          ${step.error ? `<p><strong>Error:</strong> ${step.error}</p>` : ""}
        </div>`;
    }

    if (executionResults.steps.length > 10) {
      html += `<p><em>... and ${
        executionResults.steps.length - 10
      } more steps</em></p>`;
    }

    html += "</div>";
    return html;
  }

  /**
   * Generate recommendations section HTML
   */
  generateRecommendationsHTML(analysisResults) {
    let html =
      '<div class="section"><div class="recommendations"><h3>💡 Recommendations</h3>';

    for (const recommendation of analysisResults.recommendations.slice(0, 5)) {
      // Top 5 recommendations
      html += `
        <div style="margin: 15px 0; padding: 10px; border-left: 3px solid #2196F3;">
          <h5>${recommendation.title}</h5>
          <p><strong>Priority:</strong> ${recommendation.priority.toUpperCase()}</p>
          <p>${recommendation.description}</p>
          <p><em>Impact: ${recommendation.impact}</em></p>
        </div>`;
    }

    html += "</div></div>";
    return html;
  }

  /**
   * Copy artifact to managed location
   * @param {string} sourcePath - Original artifact path
   * @param {string} category - Category (screenshots, videos, etc.)
   * @param {string} filename - Target filename
   * @returns {string} - New artifact path
   */
  async copyArtifact(sourcePath, category, filename) {
    const targetDir = path.join(this.currentRunDir, category);
    const targetPath = path.join(targetDir, filename);

    try {
      await fs.copyFile(sourcePath, targetPath);
      console.log(chalk.gray(`📎 Artifact copied: ${filename}`));
      return targetPath;
    } catch (error) {
      console.error(chalk.red(`Failed to copy artifact: ${error.message}`));
      return null;
    }
  }

  /**
   * Get summary of all artifacts in current run
   * @returns {object} - Artifact summary
   */
  async getArtifactSummary() {
    if (!this.currentRunDir) return null;

    const summary = {
      runDirectory: this.currentRunDir,
      categories: {},
    };

    const categories = [
      "screenshots",
      "videos",
      "network",
      "reports",
      "logs",
      "dom-snapshots",
    ];

    for (const category of categories) {
      const categoryDir = path.join(this.currentRunDir, category);
      try {
        const files = await fs.readdir(categoryDir);
        summary.categories[category] = {
          count: files.length,
          files: files.slice(0, 5), // First 5 files
        };
      } catch (error) {
        summary.categories[category] = { count: 0, files: [] };
      }
    }

    return summary;
  }

  /**
   * Clean up old artifact directories (keep last N runs)
   * @param {number} keepCount - Number of recent runs to keep
   */
  /**
   * Clean up old artifact runs, keeping only the most recent ones
   * @param {number} keepCount - Number of recent runs to keep
   */
  async cleanupOldRuns(keepCount = 10) {
    try {
      // Ensure artifacts directory exists
      await fs.mkdir(this.baseDir, { recursive: true });

      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      const directories = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("pr-"))
        .map((entry) => ({
          name: entry.name,
          path: path.join(this.baseDir, entry.name),
        }))
        .sort((a, b) => b.name.localeCompare(a.name)); // Sort by name (newest first)

      if (directories.length > keepCount) {
        const toDelete = directories.slice(keepCount);

        for (const dir of toDelete) {
          await fs.rm(dir.path, { recursive: true, force: true });
          console.log(chalk.gray(`🗑️  Cleaned up old run: ${dir.name}`));
        }

        console.log(
          chalk.green(
            `✅ Cleaned up ${toDelete.length} old artifact directories`
          )
        );
      } else if (directories.length > 0) {
        console.log(
          chalk.gray(
            `📁 Found ${directories.length} existing runs, keeping all (within limit of ${keepCount})`
          )
        );
      }
    } catch (error) {
      console.error(chalk.red(`Failed to cleanup old runs: ${error.message}`));
    }
  }

  /**
   * Clean all artifacts (for fresh start)
   */
  async cleanAllArtifacts() {
    try {
      console.log(
        chalk.yellow("🗑️  Cleaning all artifacts for fresh start...")
      );

      // Check if artifacts directory exists
      try {
        await fs.access(this.baseDir);
        await fs.rm(this.baseDir, { recursive: true, force: true });
        console.log(chalk.green("✅ All artifacts cleaned"));
      } catch (error) {
        // Directory doesn't exist, which is fine
        console.log(chalk.gray("📁 No existing artifacts to clean"));
      }

      // Recreate base directory
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch (error) {
      console.error(
        chalk.red(`Failed to clean all artifacts: ${error.message}`)
      );
    }
  }

  /**
   * Get current run directory
   */
  getCurrentRunDir() {
    return this.currentRunDir;
  }

  /**
   * Check if artifacts directory exists and is writable
   */
  async validateArtifactsDirectory() {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });

      // Test write permissions
      const testFile = path.join(this.baseDir, ".write-test");
      await fs.writeFile(testFile, "test");
      await fs.unlink(testFile);

      return true;
    } catch (error) {
      console.error(
        chalk.red(`Artifacts directory validation failed: ${error.message}`)
      );
      return false;
    }
  }

  /**
   * Save error artifacts when exploration fails
   * @param {object} errorData - Error information to save
   */
  async saveErrorArtifacts(errorData) {
    try {
      if (!this.currentRunDir) {
        console.warn(
          chalk.yellow("No run directory initialized for error artifacts")
        );
        return;
      }

      const errorFile = path.join(this.currentRunDir, "reports", "error.json");
      await fs.writeFile(errorFile, JSON.stringify(errorData, null, 2));

      console.log(chalk.cyan(`💾 Error artifacts saved: ${errorFile}`));
    } catch (error) {
      console.error(
        chalk.red(`Failed to save error artifacts: ${error.message}`)
      );
    }
  }

  /**
   * Cleanup resources and temporary files
   */
  async cleanup() {
    try {
      // Perform any necessary cleanup
      console.log(chalk.cyan("🧹 Artifacts cleanup completed"));
    } catch (error) {
      console.error(chalk.red(`Cleanup failed: ${error.message}`));
    }
  }
}
