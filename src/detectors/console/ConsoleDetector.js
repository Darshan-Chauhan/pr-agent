import chalk from "chalk";

/**
 * Detects JavaScript console errors, warnings, and suspicious patterns
 */
export class ConsoleDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || {
      errorLimit: 0,
      warningLimit: 5,
    };

    this.patterns = {
      // Critical error patterns
      critical: [
        /uncaught\s+error/i,
        /typeerror.*cannot\s+read\s+propert/i,
        /referenceerror.*not\s+defined/i,
        /syntaxerror/i,
        /networkerror/i,
      ],

      // Major issue patterns
      major: [
        /failed\s+to\s+load/i,
        /404.*not\s+found/i,
        /cors.*blocked/i,
        /permission\s+denied/i,
        /security\s+error/i,
      ],

      // Minor issue patterns (warnings)
      minor: [/deprecated/i, /warning/i, /performance.*slow/i, /memory.*leak/i],
    };
  }

  /**
   * Analyze console logs from execution results
   * @param {object} executionResults - Results from PlaywrightRunner
   * @returns {object} - Console analysis results
   */
  async analyze(executionResults) {
    console.log(chalk.blue("🔍 Analyzing console logs..."));

    const analysis = {
      detector: "console",
      timestamp: new Date().toISOString(),
      summary: {
        totalLogs: 0,
        errors: 0,
        warnings: 0,
        infos: 0,
        debugs: 0,
      },
      issues: [],
      recommendations: [],
      patterns: {
        critical: [],
        major: [],
        minor: [],
      },
    };

    // Collect all console logs from execution steps
    const allLogs = [];

    for (const step of executionResults.steps) {
      if (step.artifacts) {
        for (const artifact of step.artifacts) {
          if (artifact.type === "console" && artifact.data) {
            allLogs.push(
              ...artifact.data.map((log) => ({
                ...log,
                stepId: step.stepId,
                stepDescription: step.description,
              }))
            );
          }
        }
      }
    }

    analysis.summary.totalLogs = allLogs.length;

    // Analyze each log entry
    for (const log of allLogs) {
      this.categorizeLog(log, analysis);
      this.detectPatterns(log, analysis);
    }

    // Generate issues based on thresholds and patterns
    this.generateIssues(analysis);

    // Generate recommendations
    this.generateRecommendations(analysis);

    console.log(
      chalk.green(
        `✅ Console analysis completed: ${analysis.issues.length} issues found`
      )
    );

    return analysis;
  }

  /**
   * Categorize log by level
   */
  categorizeLog(log, analysis) {
    switch (log.level?.toLowerCase()) {
      case "error":
        analysis.summary.errors++;
        break;
      case "warn":
      case "warning":
        analysis.summary.warnings++;
        break;
      case "info":
        analysis.summary.infos++;
        break;
      case "debug":
        analysis.summary.debugs++;
        break;
    }
  }

  /**
   * Detect suspicious patterns in log messages
   */
  detectPatterns(log, analysis) {
    const message = log.text || "";

    // Check critical patterns
    for (const pattern of this.patterns.critical) {
      if (pattern.test(message)) {
        analysis.patterns.critical.push({
          pattern: pattern.source,
          message: message,
          stepId: log.stepId,
          stepDescription: log.stepDescription,
          timestamp: log.timestamp,
        });
      }
    }

    // Check major patterns
    for (const pattern of this.patterns.major) {
      if (pattern.test(message)) {
        analysis.patterns.major.push({
          pattern: pattern.source,
          message: message,
          stepId: log.stepId,
          stepDescription: log.stepDescription,
          timestamp: log.timestamp,
        });
      }
    }

    // Check minor patterns
    for (const pattern of this.patterns.minor) {
      if (pattern.test(message)) {
        analysis.patterns.minor.push({
          pattern: pattern.source,
          message: message,
          stepId: log.stepId,
          stepDescription: log.stepDescription,
          timestamp: log.timestamp,
        });
      }
    }
  }

  /**
   * Generate issues based on analysis
   */
  generateIssues(analysis) {
    // Critical issues from error threshold
    if (analysis.summary.errors > this.threshold.errorLimit) {
      analysis.issues.push({
        id: `console-errors-${Date.now()}`,
        severity: "critical",
        type: "console_errors",
        title: "Excessive JavaScript Errors",
        description: `Found ${analysis.summary.errors} console errors, exceeding limit of ${this.threshold.errorLimit}`,
        impact:
          "High - JavaScript errors can break functionality and user experience",
        evidence: {
          errorCount: analysis.summary.errors,
          threshold: this.threshold.errorLimit,
        },
        recommendation: "Fix all JavaScript errors before deployment",
      });
    }

    // Major issues from warning threshold
    if (analysis.summary.warnings > this.threshold.warningLimit) {
      analysis.issues.push({
        id: `console-warnings-${Date.now()}`,
        severity: "major",
        type: "console_warnings",
        title: "Excessive Console Warnings",
        description: `Found ${analysis.summary.warnings} console warnings, exceeding limit of ${this.threshold.warningLimit}`,
        impact:
          "Medium - Warnings may indicate potential issues or deprecated code",
        evidence: {
          warningCount: analysis.summary.warnings,
          threshold: this.threshold.warningLimit,
        },
        recommendation: "Review and address console warnings",
      });
    }

    // Critical pattern issues
    for (const criticalPattern of analysis.patterns.critical) {
      analysis.issues.push({
        id: `console-critical-pattern-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`,
        severity: "critical",
        type: "critical_console_pattern",
        title: "Critical Console Error Pattern Detected",
        description: `Critical error pattern detected: "${criticalPattern.message}"`,
        impact:
          "High - Critical console patterns indicate serious runtime issues",
        evidence: {
          pattern: criticalPattern.pattern,
          message: criticalPattern.message,
          stepId: criticalPattern.stepId,
          stepDescription: criticalPattern.stepDescription,
        },
        recommendation: "Immediately investigate and fix this critical error",
      });
    }

    // Major pattern issues
    for (const majorPattern of analysis.patterns.major) {
      analysis.issues.push({
        id: `console-major-pattern-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`,
        severity: "major",
        type: "major_console_pattern",
        title: "Major Console Issue Pattern Detected",
        description: `Major issue pattern detected: "${majorPattern.message}"`,
        impact: "Medium - Major console patterns may affect functionality",
        evidence: {
          pattern: majorPattern.pattern,
          message: majorPattern.message,
          stepId: majorPattern.stepId,
          stepDescription: majorPattern.stepDescription,
        },
        recommendation: "Investigate and resolve this console issue",
      });
    }

    // Minor pattern issues
    if (analysis.patterns.minor.length > 3) {
      analysis.issues.push({
        id: `console-minor-patterns-${Date.now()}`,
        severity: "minor",
        type: "minor_console_patterns",
        title: "Multiple Console Warnings Detected",
        description: `Found ${analysis.patterns.minor.length} warning patterns in console logs`,
        impact: "Low - Multiple warnings may indicate code quality issues",
        evidence: {
          patternCount: analysis.patterns.minor.length,
          patterns: analysis.patterns.minor.slice(0, 5), // Show first 5
        },
        recommendation: "Review console warnings and improve code quality",
      });
    }
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(analysis) {
    // General recommendations based on console activity
    if (analysis.summary.errors > 0) {
      analysis.recommendations.push({
        type: "error_handling",
        priority: "high",
        title: "Implement Better Error Handling",
        description:
          "Add try-catch blocks and error boundaries to handle runtime errors gracefully",
        impact: "Prevents application crashes and improves user experience",
      });
    }

    if (analysis.summary.warnings > 5) {
      analysis.recommendations.push({
        type: "code_quality",
        priority: "medium",
        title: "Address Console Warnings",
        description:
          "Review and fix console warnings to improve code quality and maintainability",
        impact: "Reduces technical debt and potential future issues",
      });
    }

    if (analysis.patterns.critical.length > 0) {
      analysis.recommendations.push({
        type: "critical_fixes",
        priority: "critical",
        title: "Fix Critical Console Errors",
        description:
          "Immediately address all critical console errors that could break functionality",
        impact: "Prevents application failures and data loss",
      });
    }

    // Performance recommendations
    if (analysis.summary.debugs > 50) {
      analysis.recommendations.push({
        type: "performance",
        priority: "low",
        title: "Remove Debug Logging in Production",
        description:
          "Remove or disable debug console logs in production to improve performance",
        impact: "Reduces console noise and slight performance improvement",
      });
    }

    // Security recommendations
    const hasSecurityWarnings = analysis.patterns.major.some((p) =>
      /security|permission|cors/i.test(p.message)
    );

    if (hasSecurityWarnings) {
      analysis.recommendations.push({
        type: "security",
        priority: "high",
        title: "Review Security Console Messages",
        description:
          "Address security-related console messages to ensure application security",
        impact: "Prevents potential security vulnerabilities",
      });
    }
  }

  /**
   * Update detection thresholds
   */
  updateThresholds(newThresholds) {
    this.threshold = { ...this.threshold, ...newThresholds };
  }

  /**
   * Add custom pattern for detection
   */
  addPattern(severity, pattern) {
    if (this.patterns[severity]) {
      this.patterns[severity].push(new RegExp(pattern, "i"));
    }
  }

  /**
   * Get detector configuration
   */
  getConfiguration() {
    return {
      threshold: this.threshold,
      patterns: {
        critical: this.patterns.critical.map((p) => p.source),
        major: this.patterns.major.map((p) => p.source),
        minor: this.patterns.minor.map((p) => p.source),
      },
    };
  }
}
