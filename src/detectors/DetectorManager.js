import chalk from "chalk";
import { ConsoleDetector } from "./console/ConsoleDetector.js";
import { NetworkDetector } from "./network/NetworkDetector.js";
import { VisualDetector } from "./visual/VisualDetector.js";
import { PerformanceDetector } from "./performance/PerformanceDetector.js";
import { postPRComment } from "../utils/github.js";

/**
 * Manages all issue detection and analysis
 */
export class DetectorManager {
  constructor(options = {}) {
    this.detectors = new Map();
    this.enabled = options.enabled || [
      "console",
      "network",
      "visual",
      "performance",
    ];
    this.thresholds = options.thresholds || {};

    // GitHub PR commenting configuration
    this.prDetails = options.prDetails || null;
    this.enableGitHubComments = options.enableGitHubComments !== false; // Default true

    this.initializeDetectors();
  }

  /**
   * Initialize all detectors
   */
  initializeDetectors() {
    // Console detector for JavaScript errors and warnings
    if (this.enabled.includes("console")) {
      this.detectors.set(
        "console",
        new ConsoleDetector({
          threshold: this.thresholds.console || {
            errorLimit: 0,
            warningLimit: 5,
          },
        })
      );
    }

    // Network detector for failed requests and performance issues
    if (this.enabled.includes("network")) {
      this.detectors.set(
        "network",
        new NetworkDetector({
          threshold: this.thresholds.network || {
            failureRate: 0.05, // 5% failure rate
            slowRequestMs: 5000,
            timeoutMs: 30000,
          },
        })
      );
    }

    // Visual detector for layout shifts and rendering issues
    if (this.enabled.includes("visual")) {
      this.detectors.set(
        "visual",
        new VisualDetector({
          threshold: this.thresholds.visual || {
            clsThreshold: 0.1,
            renderTimeMs: 3000,
          },
        })
      );
    }

    // Performance detector for Core Web Vitals and timing issues
    if (this.enabled.includes("performance")) {
      this.detectors.set(
        "performance",
        new PerformanceDetector({
          threshold: this.thresholds.performance || {
            fcpMs: 1800,
            lcpMs: 2500,
            fidMs: 100,
            ttfbMs: 600,
          },
        })
      );
    }

    console.log(
      chalk.cyan(
        `🔍 Initialized ${this.detectors.size} detectors: ${Array.from(
          this.detectors.keys()
        ).join(", ")}`
      )
    );
  }

  /**
   * Analyze all collected data and detect issues
   * @param {object} executionResults - Results from PlaywrightRunner
   * @returns {object} - Comprehensive analysis results
   */
  async analyzeResults(executionResults) {
    console.log(chalk.cyan("🔬 Starting comprehensive analysis..."));

    const analysis = {
      timestamp: new Date().toISOString(),
      planId: executionResults.planId,
      overallSummary: {
        totalIssues: 0,
        criticalIssues: 0,
        majorIssues: 0,
        minorIssues: 0,
        riskScore: 0,
        riskLevel: "low",
      },
      detectorResults: {},
      recommendations: [],
      artifactAnalysis: {},
    };

    // Run each detector
    for (const [detectorName, detector] of this.detectors) {
      console.log(chalk.blue(`🔍 Running ${detectorName} detector...`));

      try {
        const detectorResult = await detector.analyze(executionResults);
        analysis.detectorResults[detectorName] = detectorResult;

        // Aggregate issues
        if (detectorResult.issues) {
          analysis.overallSummary.totalIssues += detectorResult.issues.length;

          for (const issue of detectorResult.issues) {
            switch (issue.severity) {
              case "critical":
                analysis.overallSummary.criticalIssues++;
                break;
              case "major":
                analysis.overallSummary.majorIssues++;
                break;
              case "minor":
                analysis.overallSummary.minorIssues++;
                break;
            }
          }
        }

        // Collect recommendations
        if (detectorResult.recommendations) {
          analysis.recommendations.push(...detectorResult.recommendations);
        }

        // Display findings in terminal with enhanced formatting
        this.displayDetectorFindings(detectorName, detectorResult);

        // Post GitHub comment for this detector's findings
        if (
          this.enableGitHubComments &&
          this.prDetails &&
          detectorResult.issues &&
          detectorResult.issues.length > 0
        ) {
          await this.postDetectorComment(detectorName, detectorResult);
        }

        console.log(
          chalk.green(
            `✅ ${detectorName} detector completed: ${
              detectorResult.issues?.length || 0
            } issues found`
          )
        );
      } catch (error) {
        console.error(
          chalk.red(`❌ ${detectorName} detector failed:`, error.message)
        );

        analysis.detectorResults[detectorName] = {
          error: error.message,
          issues: [],
          recommendations: [],
        };
      }
    }

    // Calculate overall risk score and level
    this.calculateRiskScore(analysis);

    // Analyze artifacts for additional insights
    await this.analyzeArtifacts(executionResults.artifacts, analysis);

    console.log(
      chalk.green(
        `✅ Analysis completed: ${analysis.overallSummary.totalIssues} total issues found`
      )
    );
    console.log(
      chalk.cyan(
        `📊 Risk Level: ${analysis.overallSummary.riskLevel.toUpperCase()}, Score: ${
          analysis.overallSummary.riskScore
        }`
      )
    );

    return analysis;
  }

  /**
   * Calculate overall risk score and level
   */
  calculateRiskScore(analysis) {
    const { criticalIssues, majorIssues, minorIssues } =
      analysis.overallSummary;

    // Weighted scoring system
    const riskScore = criticalIssues * 10 + majorIssues * 5 + minorIssues * 1;
    analysis.overallSummary.riskScore = riskScore;

    // Determine risk level
    if (criticalIssues > 0 || riskScore >= 20) {
      analysis.overallSummary.riskLevel = "critical";
    } else if (majorIssues >= 3 || riskScore >= 10) {
      analysis.overallSummary.riskLevel = "high";
    } else if (majorIssues > 0 || riskScore >= 5) {
      analysis.overallSummary.riskLevel = "medium";
    } else {
      analysis.overallSummary.riskLevel = "low";
    }
  }

  /**
   * Analyze artifacts for additional insights
   */
  async analyzeArtifacts(artifacts, analysis) {
    console.log(chalk.blue("🔍 Analyzing artifacts..."));

    const artifactSummary = {
      screenshots: 0,
      networkData: 0,
      consoleData: 0,
      performanceData: 0,
      domSnapshots: 0,
    };

    for (const artifact of artifacts) {
      switch (artifact.type) {
        case "screenshot":
          artifactSummary.screenshots++;
          break;
        case "network":
          artifactSummary.networkData++;
          break;
        case "console":
          artifactSummary.consoleData++;
          break;
        case "performance":
          artifactSummary.performanceData++;
          break;
        case "dom":
          artifactSummary.domSnapshots++;
          break;
      }
    }

    analysis.artifactAnalysis = artifactSummary;
  }

  /**
   * Generate detailed report from analysis
   * @param {object} analysis - Analysis results
   * @returns {object} - Formatted report
   */
  generateReport(analysis) {
    const report = {
      executionSummary: {
        timestamp: analysis.timestamp,
        planId: analysis.planId,
        totalIssuesFound: analysis.overallSummary.totalIssues,
        riskLevel: analysis.overallSummary.riskLevel,
        riskScore: analysis.overallSummary.riskScore,
      },
      issueBreakdown: {
        critical: analysis.overallSummary.criticalIssues,
        major: analysis.overallSummary.majorIssues,
        minor: analysis.overallSummary.minorIssues,
      },
      detectorSummary: {},
      prioritizedIssues: [],
      recommendations: analysis.recommendations,
      artifactSummary: analysis.artifactAnalysis,
    };

    // Summarize each detector's findings
    for (const [detectorName, result] of Object.entries(
      analysis.detectorResults
    )) {
      report.detectorSummary[detectorName] = {
        issuesFound: result.issues?.length || 0,
        status: result.error ? "error" : "completed",
        error: result.error || null,
      };

      // Add issues to prioritized list
      if (result.issues) {
        report.prioritizedIssues.push(...result.issues);
      }
    }

    // Sort issues by severity
    report.prioritizedIssues.sort((a, b) => {
      const severityOrder = { critical: 3, major: 2, minor: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });

    return report;
  }

  /**
   * Get detector by name
   */
  getDetector(name) {
    return this.detectors.get(name);
  }

  /**
   * Enable/disable detector
   */
  toggleDetector(name, enabled) {
    if (enabled && !this.detectors.has(name)) {
      // Re-initialize detector
      this.enabled.push(name);
      this.initializeDetectors();
    } else if (!enabled && this.detectors.has(name)) {
      // Remove detector
      this.detectors.delete(name);
      this.enabled = this.enabled.filter((d) => d !== name);
    }
  }

  /**
   * Update detector thresholds
   */
  updateThresholds(detectorName, thresholds) {
    this.thresholds[detectorName] = {
      ...this.thresholds[detectorName],
      ...thresholds,
    };

    // Reinitialize the specific detector
    if (this.detectors.has(detectorName)) {
      this.detectors.delete(detectorName);
      this.initializeDetectors();
    }
  }

  /**
   * Get current configuration
   */
  getConfiguration() {
    return {
      enabled: this.enabled,
      thresholds: this.thresholds,
      detectors: Array.from(this.detectors.keys()),
    };
  }

  /**
   * Display detector findings in terminal with enhanced formatting
   */
  displayDetectorFindings(detectorName, detectorResult) {
    if (!detectorResult.issues || detectorResult.issues.length === 0) {
      console.log(chalk.gray(`   └── No ${detectorName} issues detected`));
      return;
    }

    const detectorIcons = {
      console: "📟",
      network: "🌐",
      visual: "👁️",
      performance: "⚡",
    };

    const severityColors = {
      critical: chalk.red.bold,
      error: chalk.red,
      major: chalk.yellow,
      warning: chalk.yellow,
      minor: chalk.blue,
      info: chalk.gray,
    };

    console.log(
      chalk.cyan(
        `   ${
          detectorIcons[detectorName] || "🔍"
        } ${detectorName.toUpperCase()} Detector Findings:`
      )
    );
    console.log(chalk.gray("   " + "─".repeat(50)));

    detectorResult.issues.forEach((issue, index) => {
      const colorFn = severityColors[issue.severity] || chalk.white;
      const prefix = `   ${index + 1}.`;

      console.log(
        colorFn(`${prefix} [${issue.severity.toUpperCase()}] ${issue.message}`)
      );

      if (issue.location) {
        console.log(chalk.gray(`      📍 Location: ${issue.location}`));
      }

      if (issue.details) {
        console.log(
          chalk.gray(`      🔍 Details: ${JSON.stringify(issue.details)}`)
        );
      }

      if (issue.suggestion) {
        console.log(chalk.green(`      💡 Fix: ${issue.suggestion}`));
      }

      console.log(); // Empty line between issues
    });
  }

  /**
   * Post GitHub comment for detector findings
   */
  async postDetectorComment(detectorName, detectorResult) {
    try {
      const comment = this.formatDetectorComment(detectorName, detectorResult);

      if (!this.prDetails.repository || !this.prDetails.number) {
        console.log(chalk.yellow("⚠️  Missing PR details for GitHub comment"));
        return;
      }

      console.log(
        chalk.cyan(
          `💬 Posting ${detectorName} findings to PR #${this.prDetails.number}...`
        )
      );

      await postPRComment(
        this.prDetails.repository,
        this.prDetails.number,
        comment
      );

      console.log(
        chalk.green(`✅ ${detectorName} comment posted to GitHub PR`)
      );
    } catch (error) {
      console.log(
        chalk.yellow(
          `⚠️  Failed to post ${detectorName} comment: ${error.message}`
        )
      );
    }
  }

  /**
   * Format detector findings into GitHub comment
   */
  formatDetectorComment(detectorName, detectorResult) {
    const detectorIcons = {
      console: "📟",
      network: "🌐",
      visual: "👁️",
      performance: "⚡",
    };

    const severityEmojis = {
      critical: "🔴",
      error: "🔴",
      major: "🟡",
      warning: "🟡",
      minor: "🔵",
      info: "⚪",
    };

    const icon = detectorIcons[detectorName] || "🔍";
    const title = `${icon} **${detectorName.toUpperCase()} Detector Findings**`;

    let comment = `## ${title}\n\n`;
    comment += `Found **${detectorResult.issues.length}** issue(s) during automated testing:\n\n`;

    detectorResult.issues.forEach((issue, index) => {
      const emoji = severityEmojis[issue.severity] || "⚪";

      comment += `### ${index + 1}. ${emoji} ${issue.message}\n\n`;
      comment += `- **Severity:** ${issue.severity}\n`;

      if (issue.location) {
        comment += `- **Location:** \`${issue.location}\`\n`;
      }

      if (issue.details) {
        comment += `- **Details:**\n\`\`\`json\n${JSON.stringify(
          issue.details,
          null,
          2
        )}\n\`\`\`\n`;
      }

      if (issue.suggestion) {
        comment += `- **💡 Suggested Fix:** ${issue.suggestion}\n`;
      }

      comment += "\n---\n\n";
    });

    // Add recommendations if available
    if (
      detectorResult.recommendations &&
      detectorResult.recommendations.length > 0
    ) {
      comment += "## 🔧 Recommendations\n\n";
      detectorResult.recommendations.forEach((rec) => {
        comment += `- ${rec}\n`;
      });
      comment += "\n";
    }

    comment += `_Generated by PR-Aware Exploration Agent at ${new Date().toISOString()}_\n`;

    return comment;
  }

  /**
   * Set PR details for GitHub commenting
   */
  setPRDetails(prDetails) {
    this.prDetails = prDetails;
  }
}
