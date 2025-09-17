import chalk from "chalk";
import pa11y from "pa11y";

/**
 * Enhanced Console Detector with CDP monitoring, memory leak detection, and accessibility analysis
 */
export class ConsoleDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || {
      errorLimit: 0,
      warningLimit: 5,
      memoryLeakThreshold: 50, // MB growth
      longTaskThreshold: 50, // ms
    };

    this.patterns = {
      // Critical error patterns
      critical: [
        /uncaught\s+error/i,
        /typeerror.*cannot\s+read\s+propert/i,
        /referenceerror.*not\s+defined/i,
        /syntaxerror/i,
        /networkerror/i,
        /out\s+of\s+memory/i,
        /maximum\s+call\s+stack/i,
      ],

      // Major issue patterns
      major: [
        /failed\s+to\s+load/i,
        /404.*not\s+found/i,
        /cors.*blocked/i,
        /permission\s+denied/i,
        /security\s+error/i,
        /content\s+security\s+policy/i,
        /mixed\s+content/i,
      ],

      // Minor issue patterns (warnings)
      minor: [
        /deprecated/i,
        /warning/i,
        /performance.*slow/i,
        /memory.*leak/i,
        /accessibility/i,
        /a11y/i,
      ],

      // Memory related patterns
      memory: [
        /memory.*leak/i,
        /heap\s+out\s+of\s+memory/i,
        /cannot\s+allocate\s+memory/i,
        /gc\s+pressure/i,
      ],

      // Security patterns
      security: [
        /csp\s+violation/i,
        /content\s+security\s+policy/i,
        /mixed\s+content/i,
        /insecure\s+request/i,
        /blocked.*security/i,
      ],
    };

    this.cdpEnabled = options.enableCDP !== false;
    this.accessibilityEnabled = options.enableAccessibility !== false;
    this.memoryMonitoring = options.enableMemoryMonitoring !== false;

    // Real-time monitoring data
    this.realTimeConsole = [];
    this.memorySnapshots = [];
    this.longTasks = [];
  }

  /**
   * Enhanced console analysis with CDP monitoring, memory analysis, and accessibility checks
   * @param {object} executionResults - Results from PlaywrightRunner
   * @returns {object} - Comprehensive console analysis results
   */
  async analyze(executionResults) {
    console.log(
      chalk.blue("🔍 Analyzing console logs with enhanced monitoring...")
    );

    const analysis = {
      detector: "console",
      timestamp: new Date().toISOString(),
      summary: {
        totalLogs: 0,
        errors: 0,
        warnings: 0,
        infos: 0,
        debugs: 0,
        memoryLeaks: 0,
        securityIssues: 0,
        accessibilityIssues: 0,
        longTasks: 0,
      },
      issues: [],
      recommendations: [],
      patterns: {
        critical: [],
        major: [],
        minor: [],
        memory: [],
        security: [],
      },
      memoryAnalysis: {
        snapshots: [],
        leaks: [],
        growth: 0,
      },
      realTimeData: {
        console: [],
        errors: [],
        warnings: [],
      },
      accessibilityReport: null,
      cdpData: null,
    };

    // Collect all console logs from execution steps
    const allLogs = [];
    let targetUrl = null;
    let page = null;

    for (const step of executionResults.steps) {
      // Extract target URL and page for enhanced analysis
      if (step.type === "navigate" && step.data && step.data.url) {
        targetUrl = step.data.url;
      }
      if (step.data && step.data.page) {
        page = step.data.page;
      }

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

    // Enhanced console monitoring with CDP (if page available)
    if (page && this.cdpEnabled) {
      try {
        console.log(chalk.blue("🔧 Setting up CDP console monitoring..."));
        await this.setupCDPMonitoring(page, analysis);
      } catch (error) {
        console.log(
          chalk.yellow(`⚠️ CDP monitoring setup failed: ${error.message}`)
        );
      }
    }

    // Memory monitoring (if page available)
    if (page && this.memoryMonitoring) {
      try {
        console.log(chalk.blue("📊 Analyzing memory usage..."));
        await this.analyzeMemoryUsage(page, analysis);
      } catch (error) {
        console.log(
          chalk.yellow(`⚠️ Memory analysis failed: ${error.message}`)
        );
      }
    }

    // Accessibility analysis (if URL available)
    if (targetUrl && this.accessibilityEnabled) {
      try {
        console.log(chalk.blue("♿ Running accessibility analysis..."));
        analysis.accessibilityReport = await this.runAccessibilityAnalysis(
          targetUrl
        );
        this.processAccessibilityIssues(analysis.accessibilityReport, analysis);
      } catch (error) {
        console.log(
          chalk.yellow(`⚠️ Accessibility analysis failed: ${error.message}`)
        );
      }
    }

    // Analyze each log entry (traditional analysis)
    for (const log of allLogs) {
      this.categorizeLog(log, analysis);
      this.detectPatterns(log, analysis);
    }

    // Analyze real-time data
    if (this.realTimeConsole.length > 0) {
      analysis.realTimeData.console = this.realTimeConsole;
      this.analyzeRealTimeData(analysis);
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
   * Setup CDP monitoring for real-time console analysis
   * @param {Page} page - Playwright page
   * @param {object} analysis - Analysis object to populate
   */
  async setupCDPMonitoring(page, analysis) {
    const client = await page.context().newCDPSession(page);

    // Enable runtime domain
    await client.send("Runtime.enable");

    // Listen for console API calls
    client.on("Runtime.consoleAPICalled", (event) => {
      const consoleEntry = {
        type: event.type,
        args: event.args.map(
          (arg) => arg.value || arg.description || "[object]"
        ),
        timestamp: Date.now(),
        stackTrace: event.stackTrace,
        executionContextId: event.executionContextId,
      };

      this.realTimeConsole.push(consoleEntry);

      // Real-time pattern detection
      const message = consoleEntry.args.join(" ");
      this.detectRealTimePatterns(message, consoleEntry, analysis);
    });

    // Listen for runtime exceptions
    client.on("Runtime.exceptionThrown", (event) => {
      const exception = {
        text: event.exceptionDetails.text,
        url: event.exceptionDetails.url,
        lineNumber: event.exceptionDetails.lineNumber,
        columnNumber: event.exceptionDetails.columnNumber,
        stackTrace: event.exceptionDetails.stackTrace,
        timestamp: Date.now(),
      };

      analysis.realTimeData.errors.push(exception);

      // Add to issues immediately for critical errors
      analysis.issues.push({
        id: `console-runtime-exception-${Date.now()}`,
        severity: "critical",
        type: "runtime_exception",
        title: "Runtime Exception Detected",
        description: `Runtime exception: ${exception.text}`,
        impact: "High - Runtime exceptions can break application functionality",
        evidence: exception,
        recommendation:
          "Fix the runtime exception to prevent application errors",
      });
    });

    analysis.cdpData = { client, monitoring: true };
  }

  /**
   * Analyze memory usage patterns for leaks
   * @param {Page} page - Playwright page
   * @param {object} analysis - Analysis object to populate
   */
  async analyzeMemoryUsage(page, analysis) {
    const client = await page.context().newCDPSession(page);

    // Take initial memory snapshot
    const initialMemory = await client.send("Runtime.getHeapUsage");
    this.memorySnapshots.push({
      timestamp: Date.now(),
      ...initialMemory,
    });

    // Wait and take another snapshot to detect growth
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const finalMemory = await client.send("Runtime.getHeapUsage");
    this.memorySnapshots.push({
      timestamp: Date.now(),
      ...finalMemory,
    });

    // Calculate memory growth
    const memoryGrowth =
      (finalMemory.usedJSHeapSize - initialMemory.usedJSHeapSize) /
      (1024 * 1024);

    analysis.memoryAnalysis = {
      snapshots: this.memorySnapshots,
      growth: memoryGrowth,
      initialUsage: initialMemory.usedJSHeapSize / (1024 * 1024),
      finalUsage: finalMemory.usedJSHeapSize / (1024 * 1024),
      totalHeap: finalMemory.totalJSHeapSize / (1024 * 1024),
      heapLimit: finalMemory.jsHeapSizeLimit / (1024 * 1024),
    };

    // Detect potential memory leaks
    if (memoryGrowth > this.threshold.memoryLeakThreshold) {
      analysis.summary.memoryLeaks++;
      analysis.memoryAnalysis.leaks.push({
        type: "excessive_growth",
        growth: memoryGrowth,
        threshold: this.threshold.memoryLeakThreshold,
      });
    }

    // Detect high memory usage
    const memoryUsagePercent =
      (finalMemory.usedJSHeapSize / finalMemory.jsHeapSizeLimit) * 100;
    if (memoryUsagePercent > 80) {
      analysis.summary.memoryLeaks++;
      analysis.memoryAnalysis.leaks.push({
        type: "high_usage",
        usage: memoryUsagePercent,
        threshold: 80,
      });
    }

    await client.detach();
  }

  /**
   * Run accessibility analysis using Pa11y
   * @param {string} url - URL to analyze
   * @returns {object} - Accessibility report
   */
  async runAccessibilityAnalysis(url) {
    try {
      const results = await pa11y(url, {
        standard: "WCAG2AA",
        includeNotices: false,
        includeWarnings: true,
        timeout: 10000,
        wait: 1000,
      });

      return {
        url,
        timestamp: new Date().toISOString(),
        issues: results.issues,
        summary: {
          total: results.issues.length,
          errors: results.issues.filter((i) => i.type === "error").length,
          warnings: results.issues.filter((i) => i.type === "warning").length,
          notices: results.issues.filter((i) => i.type === "notice").length,
        },
      };
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Pa11y analysis failed: ${error.message}`));
      return null;
    }
  }

  /**
   * Process accessibility issues into console analysis
   * @param {object} accessibilityReport - Pa11y report
   * @param {object} analysis - Analysis object to populate
   */
  processAccessibilityIssues(accessibilityReport, analysis) {
    if (!accessibilityReport || !accessibilityReport.issues) return;

    const { errors, warnings } = accessibilityReport.summary;
    analysis.summary.accessibilityIssues = errors + warnings;

    // Add critical accessibility errors
    if (errors > 0) {
      analysis.issues.push({
        id: `console-accessibility-errors-${Date.now()}`,
        severity: "major",
        type: "accessibility_errors",
        title: "Accessibility Errors Detected",
        description: `Found ${errors} accessibility errors that violate WCAG 2.1 AA standards`,
        impact:
          "High - Accessibility errors prevent users with disabilities from using the application",
        evidence: {
          errors,
          warnings,
          issues: accessibilityReport.issues
            .filter((i) => i.type === "error")
            .slice(0, 5),
        },
        recommendation:
          "Fix accessibility errors to ensure the application is usable by all users",
      });
    }

    // Add accessibility warnings
    if (warnings > 5) {
      analysis.issues.push({
        id: `console-accessibility-warnings-${Date.now()}`,
        severity: "minor",
        type: "accessibility_warnings",
        title: "Multiple Accessibility Warnings",
        description: `Found ${warnings} accessibility warnings that should be addressed`,
        impact:
          "Medium - Accessibility warnings indicate potential barriers for users with disabilities",
        evidence: {
          warnings,
          issues: accessibilityReport.issues
            .filter((i) => i.type === "warning")
            .slice(0, 3),
        },
        recommendation:
          "Review and address accessibility warnings to improve usability",
      });
    }
  }

  /**
   * Detect real-time patterns in console messages
   * @param {string} message - Console message
   * @param {object} consoleEntry - Console entry object
   * @param {object} analysis - Analysis object to populate
   */
  detectRealTimePatterns(message, consoleEntry, analysis) {
    // Security pattern detection
    for (const pattern of this.patterns.security) {
      if (pattern.test(message)) {
        analysis.summary.securityIssues++;
        analysis.patterns.security.push({
          pattern: pattern.source,
          message,
          timestamp: consoleEntry.timestamp,
          stackTrace: consoleEntry.stackTrace,
        });
      }
    }

    // Memory pattern detection
    for (const pattern of this.patterns.memory) {
      if (pattern.test(message)) {
        analysis.summary.memoryLeaks++;
        analysis.patterns.memory.push({
          pattern: pattern.source,
          message,
          timestamp: consoleEntry.timestamp,
        });
      }
    }
  }

  /**
   * Analyze real-time collected data
   * @param {object} analysis - Analysis object to populate
   */
  analyzeRealTimeData(analysis) {
    const realTimeErrors = this.realTimeConsole.filter(
      (entry) => entry.type === "error"
    );
    const realTimeWarnings = this.realTimeConsole.filter(
      (entry) => entry.type === "warning"
    );

    // Update summary with real-time data
    analysis.summary.errors += realTimeErrors.length;
    analysis.summary.warnings += realTimeWarnings.length;

    // Detect error patterns in real-time data
    for (const error of realTimeErrors) {
      const message = error.args.join(" ");

      // Check for critical patterns
      for (const pattern of this.patterns.critical) {
        if (pattern.test(message)) {
          analysis.issues.push({
            id: `console-realtime-critical-${Date.now()}-${Math.random()
              .toString(36)
              .substr(2, 9)}`,
            severity: "critical",
            type: "realtime_critical_error",
            title: "Real-time Critical Error Detected",
            description: `Critical error pattern detected in real-time: "${message}"`,
            impact:
              "High - Real-time critical errors indicate serious runtime issues",
            evidence: {
              pattern: pattern.source,
              message,
              timestamp: error.timestamp,
              stackTrace: error.stackTrace,
            },
            recommendation:
              "Immediately investigate and fix this critical error",
          });
        }
      }
    }

    // Memory leak analysis from real-time data
    if (
      analysis.memoryAnalysis &&
      analysis.memoryAnalysis.growth > this.threshold.memoryLeakThreshold
    ) {
      analysis.issues.push({
        id: `console-memory-leak-${Date.now()}`,
        severity: "major",
        type: "memory_leak_detected",
        title: "Memory Leak Detected",
        description: `Memory usage increased by ${analysis.memoryAnalysis.growth.toFixed(
          2
        )}MB during analysis`,
        impact:
          "High - Memory leaks can cause application crashes and poor performance",
        evidence: {
          growth: analysis.memoryAnalysis.growth,
          threshold: this.threshold.memoryLeakThreshold,
          initialUsage: analysis.memoryAnalysis.initialUsage,
          finalUsage: analysis.memoryAnalysis.finalUsage,
        },
        recommendation:
          "Investigate and fix memory leaks by removing event listeners and cleaning up object references",
      });
    }

    // Security issues from real-time data
    if (analysis.summary.securityIssues > 0) {
      analysis.issues.push({
        id: `console-security-issues-${Date.now()}`,
        severity: "major",
        type: "security_console_issues",
        title: "Security Issues in Console",
        description: `Found ${analysis.summary.securityIssues} security-related console messages`,
        impact: "High - Security console messages may indicate vulnerabilities",
        evidence: {
          securityIssues: analysis.summary.securityIssues,
          patterns: analysis.patterns.security.slice(0, 3),
        },
        recommendation: "Review and address security-related console messages",
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
