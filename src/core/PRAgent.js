import chalk from "chalk";
import {
  fetchPRDetails,
  fetchPRDiff,
  postPRComment,
  hasPRLabels,
} from "../utils/github.js";
import {
  validatePRParameters,
  ensureDirectories,
} from "../utils/validation.js";
import { ScopeInferenceService } from "../llm/ScopeInferenceService.js";
import { ExplorationPlanner } from "../core/ExplorationPlanner.js";
import { PlaywrightRunner } from "../automation/PlaywrightRunner.js";
import { DetectorManager } from "../detectors/DetectorManager.js";
import { ReportGenerator } from "../llm/ReportGenerator.js";
import { ArtifactManager } from "../artifacts/ArtifactManager.js";
import { AppResolver } from "../services/AppResolver.js";

/**
 * Main PR Agent class that orchestrates the entire exploration process
 */
export class PRAgent {
  constructor(options) {
    this.options = {
      prNumber: null,
      repository: null,
      appUrl: "http://localhost:3000",
      dryRun: false,
      headed: false,
      verbose: false,
      maxSteps: parseInt(process.env.MAX_STEPS) || 20,
      maxDuration: parseInt(process.env.MAX_DURATION_MINUTES) || 5,
      requiredLabels: process.env.REQUIRED_LABELS?.split(",") || [],
      ...options,
    };

    this.prDetails = null;
    this.prDiff = null;
    this.explorationPlan = null;
    this.executionResults = null;
    this.detectedIssues = [];
    this.artifacts = {};

    // Initialize services
    this.scopeInference = new ScopeInferenceService();
    this.planner = new ExplorationPlanner();
    this.runner = new PlaywrightRunner({
      headed: this.options.headed,
      verbose: this.options.verbose,
    });
    this.detectorManager = new DetectorManager({
      enableGitHubComments: !this.options.dryRun, // Enable comments only for real runs
    });
    this.reportGenerator = new ReportGenerator();
    this.artifactManager = new ArtifactManager();
    this.appResolver = new AppResolver();
  }

  /**
   * Main exploration workflow
   */
  async explore() {
    try {
      console.log(chalk.blue.bold("🤖 Starting PR-Aware Exploration\n"));

      // Step 1: Validate parameters
      this.validateParameters();

      // Step 2: Initialize artifacts (with cleanup of old runs)
      await this.artifactManager.initializeRun(this.options.prNumber, true);

      // Step 3: Ensure required directories exist
      await ensureDirectories();

      // Step 4: Fetch PR data
      await this.fetchPRData();

      // Step 5: Check label-based triggers (if configured)
      if (!this.checkLabelTriggers()) {
        console.log(
          chalk.yellow("⏭️  Skipping exploration (label requirements not met)")
        );
        return;
      }

      // Step 6: Infer scope using LLM
      await this.inferScope();

      // Step 7: Generate exploration plan
      await this.generateExplorationPlan();

      if (this.options.dryRun) {
        console.log(
          chalk.yellow("🔍 Dry run mode - exploration plan generated")
        );
        await this.saveDryRunResults();
        return;
      }

      // Step 8: Execute exploration plan
      await this.executeExploration();

      // Step 9: Analyze results and detect issues
      await this.analyzeResults();

      // Step 10: Generate report
      await this.generateReport();

      // Step 11: Save artifacts and cleanup
      await this.saveArtifacts();

      console.log(chalk.green.bold("\n🎉 Exploration completed successfully!"));
    } catch (error) {
      console.error(chalk.red("❌ Exploration failed:"), error.message);

      if (this.options.verbose) {
        console.error(error.stack);
      }

      // Save error artifacts if available
      await this.saveErrorArtifacts(error);

      throw error;
    } finally {
      // Cleanup resources
      await this.cleanup();
    }
  }

  /**
   * Validate input parameters
   */
  validateParameters() {
    validatePRParameters(this.options.repository, this.options.prNumber);
    console.log(chalk.green("✅ Parameters validated"));
  }

  /**
   * Fetch PR details and diff from GitHub
   */
  async fetchPRData() {
    console.log(chalk.cyan("📡 Fetching PR data from GitHub..."));

    // Fetch PR details
    this.prDetails = await fetchPRDetails(
      this.options.repository,
      this.options.prNumber
    );

    // Fetch PR diff
    this.prDiff = await fetchPRDiff(
      this.options.repository,
      this.options.prNumber
    );

    console.log(
      chalk.green(
        `✅ PR data fetched: ${this.prDiff.files.length} files changed`
      )
    );

    // Configure detector manager with PR details for GitHub commenting
    this.detectorManager.setPRDetails({
      repository: this.options.repository,
      number: this.options.prNumber,
      title: this.prDetails.title,
      author: this.prDetails.author,
    });

    // Resolve target application based on changed files
    if (
      !this.options.appUrl ||
      this.options.appUrl === "http://localhost:3000"
    ) {
      await this.resolveTargetApp();
    }
  }

  /**
   * Resolve target application from PR changes
   */
  async resolveTargetApp() {
    console.log(chalk.cyan("🎯 Resolving target application..."));

    try {
      const targetApp = await this.appResolver.resolveTargetApp(
        this.prDetails,
        this.prDiff.files
      );

      if (targetApp) {
        this.targetApp = targetApp;
        this.options.appUrl = targetApp.localApp.baseUrl;

        // Verify app is available
        const isAvailable = await this.appResolver.verifyAppAvailability(
          targetApp
        );
        if (!isAvailable) {
          console.log(
            chalk.yellow(`⚠️  Target app ${targetApp.name} is not running`)
          );
          console.log(
            chalk.blue(`💡 Start command: ${targetApp.localApp.startCommand}`)
          );

          if (!this.options.dryRun) {
            throw new Error(
              `Target application ${targetApp.name} is not available at ${targetApp.localApp.baseUrl}`
            );
          }
        }

        console.log(
          chalk.green(
            `✅ Target app: ${targetApp.name} at ${this.options.appUrl}`
          )
        );
      } else {
        console.log(
          chalk.yellow(
            "⚠️  Could not automatically resolve target app, using default URL"
          )
        );
        console.log(
          chalk.blue(
            "💡 You can specify a URL manually with --app-url or configure app-mapping.json"
          )
        );
      }
    } catch (error) {
      console.log(chalk.red(`❌ App resolution failed: ${error.message}`));
      if (!this.options.dryRun) {
        throw error;
      }
    }
  }

  /**
   * Check if PR meets label-based trigger requirements
   */
  checkLabelTriggers() {
    if (!this.options.requiredLabels.length) {
      return true; // No label requirements
    }

    const hasRequiredLabels = hasPRLabels(
      this.prDetails,
      this.options.requiredLabels
    );

    if (!hasRequiredLabels) {
      console.log(
        chalk.yellow(
          `⚠️  PR does not have required labels: ${this.options.requiredLabels.join(
            ", "
          )}`
        )
      );
    }

    return hasRequiredLabels;
  }

  /**
   * Use LLM to infer exploration scope from PR changes
   */
  async inferScope() {
    console.log(chalk.cyan("🧠 Inferring exploration scope using LLM..."));

    this.explorationScope = await this.scopeInference.inferScope({
      prDetails: this.prDetails,
      prDiff: this.prDiff,
      repository: this.options.repository,
    });

    console.log(
      chalk.green(
        `✅ Scope inferred: ${this.explorationScope.routes.length} routes, ${this.explorationScope.components.length} components`
      )
    );

    if (this.options.verbose) {
      console.log(
        chalk.gray("Routes:"),
        this.explorationScope.routes.map((r) => r.path).join(", ")
      );
      console.log(
        chalk.gray("Key Components:"),
        this.explorationScope.components.map((c) => c.name).join(", ")
      );
    }
  }

  /**
   * Generate deterministic exploration plan
   */
  async generateExplorationPlan() {
    console.log(chalk.cyan("📋 Generating exploration plan..."));

    this.explorationPlan = await this.planner.generatePlan({
      scope: this.explorationScope,
      appUrl: this.options.appUrl,
      maxSteps: this.options.maxSteps,
      prDetails: this.prDetails,
    });

    console.log(
      chalk.green(
        `✅ Plan generated: ${this.explorationPlan.steps.length} steps`
      )
    );

    if (this.options.verbose) {
      this.explorationPlan.steps.forEach((step, index) => {
        const target =
          step.url ||
          step.selector ||
          step.route ||
          step.text ||
          "page interaction";
        console.log(chalk.gray(`  ${index + 1}. ${step.action}: ${target}`));
      });
    }
  }

  /**
   * Execute exploration plan using Playwright
   */
  async executeExploration() {
    console.log(chalk.cyan("🚀 Executing exploration plan..."));

    // Set PR context for AI-powered navigation
    this.runner.setPRContext({
      title: this.prDetails.title,
      number: this.prDetails.number,
      changedFiles: this.prDiff?.files || [],
      components: this.scope?.components || [],
      routes: this.scope?.routes || [],
      prDiff: this.prDiff,
      branch: this.prDetails?.head?.ref || "unknown",
    });

    this.executionResults = await this.runner.executePlan(
      this.explorationPlan,
      {
        detectorManager: this.detectorManager,
        artifactManager: this.artifactManager,
        verbose: this.options.verbose,
      }
    );

    console.log(
      chalk.green(
        `✅ Exploration executed: ${this.executionResults.completedSteps} steps completed`
      )
    );
  }

  /**
   * Analyze execution results and detect issues
   */
  async analyzeResults() {
    console.log(chalk.cyan("🔍 Analyzing results for issues..."));

    const analysisResults = await this.detectorManager.analyzeResults(
      this.executionResults
    );

    // Extract all issues from detector results
    this.detectedIssues = [];
    Object.values(analysisResults.detectorResults).forEach((detectorResult) => {
      if (detectorResult.issues && Array.isArray(detectorResult.issues)) {
        this.detectedIssues.push(...detectorResult.issues);
      }
    });

    // Store the full analysis results
    this.analysisResults = analysisResults;

    const errorCount = this.detectedIssues.filter(
      (issue) => issue.severity === "error"
    ).length;
    const warningCount = this.detectedIssues.filter(
      (issue) => issue.severity === "warning"
    ).length;

    console.log(
      chalk.green(
        `✅ Analysis completed: ${this.detectedIssues.length} total issues found`
      )
    );
    console.log(
      chalk.cyan(
        `📊 Risk Level: ${analysisResults.overallSummary.riskLevel.toUpperCase()}, Score: ${
          analysisResults.overallSummary.riskScore
        }`
      )
    );
  }

  /**
   * Generate human-readable report using LLM
   */
  async generateReport() {
    console.log(chalk.cyan("📝 Generating exploration report..."));

    this.report = await this.reportGenerator.generateReport({
      prDetails: this.prDetails,
      explorationScope: this.explorationScope,
      explorationPlan: this.explorationPlan,
      executionResults: this.executionResults,
      detectedIssues: this.detectedIssues,
      artifacts: this.artifacts,
    });

    console.log(chalk.green(`✅ Report generated: ${this.report.verdict}`));
    console.log(
      chalk.cyan(`📄 Summary: ${this.report.summary.substring(0, 100)}...`)
    );
  }

  /**
   * Save dry run results (plan only)
   */
  async saveDryRunResults() {
    const dryRunReport = {
      timestamp: new Date().toISOString(),
      prDetails: this.prDetails,
      explorationScope: this.explorationScope,
      explorationPlan: this.explorationPlan,
      mode: "dry-run",
    };

    await this.artifactManager.saveDryRunReport(dryRunReport);
    console.log(chalk.green("✅ Dry run results saved to artifacts/"));
  }

  /**
   * Save all artifacts
   */
  async saveArtifacts() {
    console.log(chalk.cyan("💾 Saving artifacts..."));

    await this.artifactManager.saveExplorationArtifacts({
      prDetails: this.prDetails,
      explorationScope: this.explorationScope,
      explorationPlan: this.explorationPlan,
      executionResults: this.executionResults,
      detectedIssues: this.detectedIssues,
      report: this.report,
    });

    console.log(chalk.green("✅ Artifacts saved to artifacts/ directory"));
  }

  /**
   * Save error artifacts when exploration fails
   */
  async saveErrorArtifacts(error) {
    try {
      await this.artifactManager.saveErrorArtifacts({
        error: {
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        },
        prDetails: this.prDetails,
        executionResults: this.executionResults,
      });
    } catch (saveError) {
      console.error(
        chalk.red("Failed to save error artifacts:"),
        saveError.message
      );
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      if (this.runner) {
        await this.runner.cleanup();
      }

      if (this.artifactManager) {
        await this.artifactManager.cleanup();
      }
    } catch (error) {
      console.error(chalk.red("Cleanup error:"), error.message);
    }
  }
}
