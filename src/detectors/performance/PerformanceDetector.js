import chalk from "chalk";
import PerformanceUtils from "../../utils/PerformanceUtils.js";

/**
 * Enhanced Performance Detector with Lighthouse and Web Vitals integration
 */
export class PerformanceDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || {
      // Core Web Vitals thresholds
      fcpMs: 1800, // First Contentful Paint
      lcpMs: 2500, // Largest Contentful Paint
      fidMs: 100, // First Input Delay
      clsScore: 0.1, // Cumulative Layout Shift
      ttfbMs: 600, // Time to First Byte

      // Additional performance thresholds
      domCompleteMs: 3000,
      loadEventMs: 4000,
      memoryUsageMB: 100,
      cpuUsagePercent: 50,
      performanceScore: 90, // Lighthouse performance score
      longTaskMs: 50, // Long task threshold
    };

    this.performanceUtils = new PerformanceUtils(options);
    this.lighthouseEnabled = options.enableLighthouse !== false;
    this.webVitalsEnabled = options.enableWebVitals !== false;
  }

  /**
   * Enhanced performance analysis with Lighthouse and Web Vitals
   * @param {object} executionResults - Results from PlaywrightRunner
   * @returns {object} - Comprehensive performance analysis results
   */
  async analyze(executionResults) {
    console.log(
      chalk.blue("⚡ Analyzing performance metrics with enhanced tools...")
    );

    const analysis = {
      detector: "performance",
      timestamp: new Date().toISOString(),
      summary: {
        totalMeasurements: 0,
        coreWebVitals: {
          fcp: null,
          lcp: null,
          fid: null,
          cls: null,
          ttfb: null,
        },
        timingMetrics: {
          domComplete: null,
          loadEvent: null,
          averageLoadTime: 0,
        },
        resourceMetrics: {
          memoryUsage: null,
          cpuUsage: null,
        },
        lighthouse: null,
        webVitals: null,
        performanceScore: null,
        budgetCompliance: null,
      },
      issues: [],
      recommendations: [],
      performanceProfile: {},
      stepPerformance: [],
      lighthouseReport: null,
      cdpMetrics: null,
      longTasks: [],
    };

    // Collect all performance data from execution steps
    const performanceData = [];
    let targetUrl = null;
    let page = null;

    for (const step of executionResults.steps) {
      // Extract target URL from navigation steps
      if (step.type === "navigate" && step.data && step.data.url) {
        targetUrl = step.data.url;
      }

      // Extract page reference if available
      if (step.data && step.data.page) {
        page = step.data.page;
      }

      // Check step-level performance data
      if (step.data && step.data.performance) {
        performanceData.push({
          ...step.data.performance,
          stepId: step.stepId,
          stepDescription: step.description,
        });
        analysis.summary.totalMeasurements++;
      }

      // Check artifacts for performance data
      if (step.artifacts) {
        for (const artifact of step.artifacts) {
          if (artifact.type === "performance" && artifact.data) {
            performanceData.push({
              ...artifact.data,
              stepId: step.stepId,
              stepDescription: step.description,
            });
            analysis.summary.totalMeasurements++;
          }
        }
      }

      // Store step execution performance
      analysis.stepPerformance.push({
        stepId: step.stepId,
        description: step.description,
        executionTimeMs: step.executionTimeMs,
        status: step.status,
      });
    }

    // Enhanced performance analysis
    if (targetUrl && this.lighthouseEnabled) {
      try {
        console.log(chalk.blue("🚀 Running Lighthouse audit..."));
        analysis.lighthouseReport =
          await this.performanceUtils.runLighthouseAudit(targetUrl);
        analysis.summary.lighthouse =
          this.performanceUtils.extractCoreWebVitals(analysis.lighthouseReport);
        analysis.summary.performanceScore =
          analysis.summary.lighthouse.performanceScore;

        // Extract Lighthouse recommendations
        const lighthouseRecommendations =
          this.performanceUtils.extractRecommendations(
            analysis.lighthouseReport
          );
        analysis.recommendations.push(
          ...lighthouseRecommendations.map((rec) => ({
            ...rec,
            source: "lighthouse",
            type: "performance_optimization",
            priority: rec.impact,
          }))
        );
      } catch (error) {
        console.log(
          chalk.yellow(`⚠️ Lighthouse audit failed: ${error.message}`)
        );
      }
    }

    // Web Vitals collection (if page is available)
    if (page && this.webVitalsEnabled) {
      try {
        console.log(chalk.blue("📊 Collecting Web Vitals..."));
        analysis.summary.webVitals =
          await this.performanceUtils.collectWebVitals(page);
      } catch (error) {
        console.log(
          chalk.yellow(`⚠️ Web Vitals collection failed: ${error.message}`)
        );
      }
    }

    // CDP metrics collection (if page is available)
    if (page) {
      try {
        console.log(chalk.blue("🔧 Collecting CDP metrics..."));
        const cdpSession = await this.performanceUtils.setupCDPSession(page);
        analysis.cdpMetrics = await this.performanceUtils.collectCDPMetrics(
          cdpSession
        );
        analysis.longTasks = await this.performanceUtils.monitorLongTasks(
          cdpSession
        );
        await cdpSession.detach();
      } catch (error) {
        console.log(
          chalk.yellow(`⚠️ CDP metrics collection failed: ${error.message}`)
        );
      }
    }

    // Analyze collected performance data
    if (performanceData.length > 0) {
      this.analyzeCoreWebVitals(performanceData, analysis);
      this.analyzeTimingMetrics(performanceData, analysis);
      this.analyzeStepPerformance(analysis);
    }

    // Enhanced analysis with Lighthouse data
    if (analysis.summary.lighthouse) {
      this.analyzeLighthouseResults(analysis);
    }

    // Memory and CPU analysis from CDP
    if (analysis.cdpMetrics) {
      this.analyzeCDPMetrics(analysis);
    }

    // Performance budget compliance
    if (analysis.summary.lighthouse || analysis.summary.webVitals) {
      analysis.summary.budgetCompliance =
        this.performanceUtils.calculateBudgetCompliance(
          analysis.summary.lighthouse || analysis.summary.webVitals,
          this.threshold
        );
    } // Generate issues based on analysis
    this.generateIssues(analysis);

    // Generate recommendations
    this.generateRecommendations(analysis);

    console.log(
      chalk.green(
        `✅ Performance analysis completed: ${analysis.issues.length} issues found`
      )
    );

    return analysis;
  }

  /**
   * Analyze Core Web Vitals metrics
   */
  analyzeCoreWebVitals(performanceData, analysis) {
    const vitals = analysis.summary.coreWebVitals;

    for (const data of performanceData) {
      // First Contentful Paint (estimated from domContentLoaded)
      if (
        data.domContentLoaded &&
        (!vitals.fcp || data.domContentLoaded < vitals.fcp)
      ) {
        vitals.fcp = data.domContentLoaded;
      }

      // Largest Contentful Paint (estimated from loadTime)
      if (data.loadTime && (!vitals.lcp || data.loadTime > vitals.lcp)) {
        vitals.lcp = data.loadTime;
      }

      // Time to First Byte
      if (data.ttfb && (!vitals.ttfb || data.ttfb < vitals.ttfb)) {
        vitals.ttfb = data.ttfb;
      }

      // Estimate CLS from timing variations
      if (data.domComplete && data.loadTime) {
        const timingVariation = Math.abs(data.domComplete - data.loadTime);
        const estimatedCLS = Math.min(timingVariation / 10000, 0.5); // Conservative estimation

        if (!vitals.cls || estimatedCLS > vitals.cls) {
          vitals.cls = estimatedCLS;
        }
      }
    }
  }

  /**
   * Analyze timing metrics
   */
  analyzeTimingMetrics(performanceData, analysis) {
    const timing = analysis.summary.timingMetrics;
    const loadTimes = [];

    for (const data of performanceData) {
      // DOM Complete timing
      if (
        data.domComplete &&
        (!timing.domComplete || data.domComplete > timing.domComplete)
      ) {
        timing.domComplete = data.domComplete;
      }

      // Load event timing
      if (data.loadTime) {
        loadTimes.push(data.loadTime);

        if (!timing.loadEvent || data.loadTime > timing.loadEvent) {
          timing.loadEvent = data.loadTime;
        }
      }
    }

    // Calculate average load time
    if (loadTimes.length > 0) {
      timing.averageLoadTime =
        loadTimes.reduce((sum, time) => sum + time, 0) / loadTimes.length;
    }

    // Build performance profile
    analysis.performanceProfile = {
      fastestLoad: Math.min(...loadTimes) || 0,
      slowestLoad: Math.max(...loadTimes) || 0,
      loadTimeVariation:
        loadTimes.length > 1
          ? Math.max(...loadTimes) - Math.min(...loadTimes)
          : 0,
      consistencyScore: this.calculateConsistencyScore(loadTimes),
    };
  }

  /**
   * Analyze step execution performance
   */
  analyzeStepPerformance(analysis) {
    const stepTimes = analysis.stepPerformance
      .map((s) => s.executionTimeMs)
      .filter((t) => t > 0);

    if (stepTimes.length > 0) {
      const avgStepTime =
        stepTimes.reduce((sum, time) => sum + time, 0) / stepTimes.length;
      const slowSteps = analysis.stepPerformance.filter(
        (s) => s.executionTimeMs > avgStepTime * 2
      );

      analysis.performanceProfile.stepAnalysis = {
        averageStepTime: avgStepTime,
        slowSteps: slowSteps.length,
        slowStepDetails: slowSteps.slice(0, 5), // Top 5 slow steps
      };
    }
  }

  /**
   * Calculate performance consistency score
   */
  calculateConsistencyScore(values) {
    if (values.length < 2) return 1.0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      values.length;
    const stdDev = Math.sqrt(variance);

    // Lower coefficient of variation = higher consistency
    const coefficientOfVariation = stdDev / mean;
    return Math.max(0, 1 - coefficientOfVariation);
  }

  /**
   * Generate issues based on performance analysis
   */
  generateIssues(analysis) {
    const vitals = analysis.summary.coreWebVitals;
    const timing = analysis.summary.timingMetrics;

    // First Contentful Paint issues
    if (vitals.fcp && vitals.fcp > this.threshold.fcpMs) {
      analysis.issues.push({
        id: `performance-slow-fcp-${Date.now()}`,
        severity: vitals.fcp > this.threshold.fcpMs * 2 ? "critical" : "major",
        type: "slow_first_contentful_paint",
        title: "Slow First Contentful Paint",
        description: `First Contentful Paint of ${vitals.fcp}ms exceeds threshold of ${this.threshold.fcpMs}ms`,
        impact: "High - Slow FCP impacts perceived loading performance",
        evidence: {
          fcp: vitals.fcp,
          threshold: this.threshold.fcpMs,
          exceedsBy: vitals.fcp - this.threshold.fcpMs,
        },
        recommendation:
          "Optimize critical rendering path and reduce render-blocking resources",
      });
    }

    // Largest Contentful Paint issues
    if (vitals.lcp && vitals.lcp > this.threshold.lcpMs) {
      analysis.issues.push({
        id: `performance-slow-lcp-${Date.now()}`,
        severity: vitals.lcp > this.threshold.lcpMs * 2 ? "critical" : "major",
        type: "slow_largest_contentful_paint",
        title: "Slow Largest Contentful Paint",
        description: `Largest Contentful Paint of ${vitals.lcp}ms exceeds threshold of ${this.threshold.lcpMs}ms`,
        impact:
          "High - Slow LCP indicates poor loading performance for main content",
        evidence: {
          lcp: vitals.lcp,
          threshold: this.threshold.lcpMs,
          exceedsBy: vitals.lcp - this.threshold.lcpMs,
        },
        recommendation:
          "Optimize images, fonts, and critical resources for faster loading",
      });
    }

    // Time to First Byte issues
    if (vitals.ttfb && vitals.ttfb > this.threshold.ttfbMs) {
      analysis.issues.push({
        id: `performance-slow-ttfb-${Date.now()}`,
        severity: vitals.ttfb > this.threshold.ttfbMs * 2 ? "major" : "minor",
        type: "slow_time_to_first_byte",
        title: "Slow Time to First Byte",
        description: `Time to First Byte of ${vitals.ttfb}ms exceeds threshold of ${this.threshold.ttfbMs}ms`,
        impact:
          "Medium - Slow TTFB indicates server or network performance issues",
        evidence: {
          ttfb: vitals.ttfb,
          threshold: this.threshold.ttfbMs,
          exceedsBy: vitals.ttfb - this.threshold.ttfbMs,
        },
        recommendation:
          "Optimize server response time, use CDN, or implement caching",
      });
    }

    // Cumulative Layout Shift issues
    if (vitals.cls && vitals.cls > this.threshold.clsScore) {
      analysis.issues.push({
        id: `performance-high-cls-${Date.now()}`,
        severity: vitals.cls > this.threshold.clsScore * 2 ? "major" : "minor",
        type: "high_cumulative_layout_shift",
        title: "High Cumulative Layout Shift",
        description: `Cumulative Layout Shift score of ${vitals.cls.toFixed(
          3
        )} exceeds threshold of ${this.threshold.clsScore}`,
        impact: "Medium - Layout shifts create poor user experience",
        evidence: {
          cls: vitals.cls,
          threshold: this.threshold.clsScore,
          exceedsBy: vitals.cls - this.threshold.clsScore,
        },
        recommendation:
          "Ensure elements have reserved space and avoid inserting content above existing elements",
      });
    }

    // DOM Complete performance issues
    if (
      timing.domComplete &&
      timing.domComplete > this.threshold.domCompleteMs
    ) {
      analysis.issues.push({
        id: `performance-slow-dom-${Date.now()}`,
        severity:
          timing.domComplete > this.threshold.domCompleteMs * 2
            ? "major"
            : "minor",
        type: "slow_dom_complete",
        title: "Slow DOM Processing",
        description: `DOM complete time of ${timing.domComplete}ms exceeds threshold of ${this.threshold.domCompleteMs}ms`,
        impact: "Medium - Slow DOM processing affects interactivity",
        evidence: {
          domComplete: timing.domComplete,
          threshold: this.threshold.domCompleteMs,
          exceedsBy: timing.domComplete - this.threshold.domCompleteMs,
        },
        recommendation:
          "Optimize DOM structure and reduce JavaScript processing time",
      });
    }

    // Performance consistency issues
    if (analysis.performanceProfile.consistencyScore < 0.8) {
      analysis.issues.push({
        id: `performance-inconsistent-${Date.now()}`,
        severity: "minor",
        type: "inconsistent_performance",
        title: "Inconsistent Performance",
        description: `Performance consistency score of ${analysis.performanceProfile.consistencyScore.toFixed(
          2
        )} indicates variable loading times`,
        impact:
          "Low - Inconsistent performance creates unpredictable user experience",
        evidence: {
          consistencyScore: analysis.performanceProfile.consistencyScore,
          loadTimeVariation: analysis.performanceProfile.loadTimeVariation,
        },
        recommendation:
          "Investigate and fix sources of performance variability",
      });
    }

    // Slow step execution issues
    if (analysis.performanceProfile.stepAnalysis?.slowSteps > 3) {
      analysis.issues.push({
        id: `performance-slow-steps-${Date.now()}`,
        severity: "minor",
        type: "slow_test_steps",
        title: "Slow Test Step Execution",
        description: `${analysis.performanceProfile.stepAnalysis.slowSteps} test steps executed slower than average`,
        impact: "Low - Slow test steps may indicate performance bottlenecks",
        evidence: {
          slowSteps: analysis.performanceProfile.stepAnalysis.slowSteps,
          averageStepTime:
            analysis.performanceProfile.stepAnalysis.averageStepTime,
          slowStepDetails:
            analysis.performanceProfile.stepAnalysis.slowStepDetails,
        },
        recommendation:
          "Optimize slow operations or add appropriate wait strategies",
      });
    }
  }

  /**
   * Generate performance recommendations
   */
  generateRecommendations(analysis) {
    const vitals = analysis.summary.coreWebVitals;
    const timing = analysis.summary.timingMetrics;

    // Core Web Vitals optimization
    if (vitals.fcp > 1500 || vitals.lcp > 2000) {
      analysis.recommendations.push({
        type: "core_web_vitals",
        priority: "high",
        title: "Optimize Core Web Vitals",
        description:
          "Implement performance optimizations to improve FCP, LCP, and overall loading experience",
        impact: "Significantly improves user experience and SEO rankings",
      });
    }

    // Resource optimization
    if (vitals.ttfb > 400) {
      analysis.recommendations.push({
        type: "server_optimization",
        priority: "medium",
        title: "Optimize Server Response Time",
        description:
          "Implement server-side caching, database optimization, or CDN to reduce TTFB",
        impact: "Improves initial loading performance",
      });
    }

    // Layout stability
    if (vitals.cls > 0.05) {
      analysis.recommendations.push({
        type: "layout_stability",
        priority: "medium",
        title: "Improve Layout Stability",
        description:
          "Reserve space for dynamic content and avoid layout shifts",
        impact:
          "Prevents unexpected layout changes and improves user experience",
      });
    }

    // General performance recommendations
    if (timing.averageLoadTime > 3000) {
      analysis.recommendations.push({
        type: "general_performance",
        priority: "medium",
        title: "Implement Performance Best Practices",
        description:
          "Optimize images, minify resources, enable compression, and implement lazy loading",
        impact: "Comprehensive performance improvement across all metrics",
      });
    }

    // Monitoring recommendations
    analysis.recommendations.push({
      type: "performance_monitoring",
      priority: "low",
      title: "Implement Performance Monitoring",
      description:
        "Set up Real User Monitoring (RUM) to track performance in production",
      impact: "Enables proactive performance issue detection and optimization",
    });

    // Progressive enhancement
    if (vitals.fcp > 2000) {
      analysis.recommendations.push({
        type: "progressive_enhancement",
        priority: "medium",
        title: "Implement Progressive Loading",
        description:
          "Use progressive enhancement techniques to show content faster",
        impact:
          "Improves perceived performance even with slower actual load times",
      });
    }
  }

  /**
   * Analyze Lighthouse results for performance issues
   */
  analyzeLighthouseResults(analysis) {
    const lighthouse = analysis.summary.lighthouse;

    // Performance score issues
    if (lighthouse.performanceScore < this.threshold.performanceScore) {
      analysis.issues.push({
        id: `performance-lighthouse-score-${Date.now()}`,
        severity:
          lighthouse.performanceScore < 50
            ? "critical"
            : lighthouse.performanceScore < 75
            ? "major"
            : "minor",
        type: "low_lighthouse_score",
        title: "Low Lighthouse Performance Score",
        description: `Lighthouse performance score of ${lighthouse.performanceScore} is below threshold of ${this.threshold.performanceScore}`,
        impact: "High - Low Lighthouse scores indicate poor user experience",
        evidence: {
          score: lighthouse.performanceScore,
          threshold: this.threshold.performanceScore,
          metrics: lighthouse,
        },
        recommendation:
          "Review Lighthouse audit recommendations and optimize critical performance metrics",
      });
    }

    // Real FCP issues
    if (lighthouse.fcp.value > this.threshold.fcpMs) {
      analysis.issues.push({
        id: `performance-lighthouse-fcp-${Date.now()}`,
        severity:
          lighthouse.fcp.value > this.threshold.fcpMs * 2
            ? "critical"
            : "major",
        type: "slow_first_contentful_paint_real",
        title: "Slow First Contentful Paint (Lighthouse)",
        description: `Real FCP of ${lighthouse.fcp.displayValue} exceeds threshold of ${this.threshold.fcpMs}ms`,
        impact: "High - Slow FCP impacts perceived loading performance",
        evidence: {
          value: lighthouse.fcp.value,
          threshold: this.threshold.fcpMs,
          score: lighthouse.fcp.score,
          displayValue: lighthouse.fcp.displayValue,
        },
        recommendation:
          "Optimize critical rendering path and reduce render-blocking resources",
      });
    }

    // Real LCP issues
    if (lighthouse.lcp.value > this.threshold.lcpMs) {
      analysis.issues.push({
        id: `performance-lighthouse-lcp-${Date.now()}`,
        severity:
          lighthouse.lcp.value > this.threshold.lcpMs * 2
            ? "critical"
            : "major",
        type: "slow_largest_contentful_paint_real",
        title: "Slow Largest Contentful Paint (Lighthouse)",
        description: `Real LCP of ${lighthouse.lcp.displayValue} exceeds threshold of ${this.threshold.lcpMs}ms`,
        impact:
          "High - Slow LCP indicates poor loading performance for main content",
        evidence: {
          value: lighthouse.lcp.value,
          threshold: this.threshold.lcpMs,
          score: lighthouse.lcp.score,
          displayValue: lighthouse.lcp.displayValue,
        },
        recommendation:
          "Optimize images, fonts, and critical resources for faster loading",
      });
    }

    // Real CLS issues
    if (lighthouse.cls.value > this.threshold.clsScore) {
      analysis.issues.push({
        id: `performance-lighthouse-cls-${Date.now()}`,
        severity:
          lighthouse.cls.value > this.threshold.clsScore * 2
            ? "major"
            : "minor",
        type: "high_cumulative_layout_shift_real",
        title: "High Cumulative Layout Shift (Lighthouse)",
        description: `Real CLS score of ${lighthouse.cls.displayValue} exceeds threshold of ${this.threshold.clsScore}`,
        impact: "Medium - Layout shifts create poor user experience",
        evidence: {
          value: lighthouse.cls.value,
          threshold: this.threshold.clsScore,
          score: lighthouse.cls.score,
          displayValue: lighthouse.cls.displayValue,
        },
        recommendation:
          "Ensure elements have reserved space and avoid inserting content above existing elements",
      });
    }
  }

  /**
   * Analyze CDP metrics for advanced performance insights
   */
  analyzeCDPMetrics(analysis) {
    if (!analysis.cdpMetrics) return;

    const { timing, memory } = analysis.cdpMetrics;

    // Memory usage analysis
    if (memory && memory.used) {
      const memoryUsageMB = memory.used / (1024 * 1024);

      if (memoryUsageMB > this.threshold.memoryUsageMB) {
        analysis.issues.push({
          id: `performance-high-memory-${Date.now()}`,
          severity:
            memoryUsageMB > this.threshold.memoryUsageMB * 2
              ? "major"
              : "minor",
          type: "high_memory_usage",
          title: "High Memory Usage",
          description: `Memory usage of ${memoryUsageMB.toFixed(
            2
          )}MB exceeds threshold of ${this.threshold.memoryUsageMB}MB`,
          impact:
            "Medium - High memory usage can cause performance issues and crashes",
          evidence: {
            used: memoryUsageMB,
            total: memory.total / (1024 * 1024),
            limit: memory.limit / (1024 * 1024),
            threshold: this.threshold.memoryUsageMB,
          },
          recommendation:
            "Optimize memory usage by reducing DOM nodes, cleaning up event listeners, and managing object references",
        });
      }

      // Memory leak detection
      if (memory.used > memory.total * 0.8) {
        analysis.issues.push({
          id: `performance-memory-leak-${Date.now()}`,
          severity: "major",
          type: "potential_memory_leak",
          title: "Potential Memory Leak",
          description: `Memory usage is ${(
            (memory.used / memory.total) *
            100
          ).toFixed(1)}% of total heap`,
          impact: "High - Memory leaks can cause application crashes",
          evidence: {
            usage: (memory.used / memory.total) * 100,
            used: memory.used,
            total: memory.total,
          },
          recommendation:
            "Investigate potential memory leaks and optimize memory management",
        });
      }
    }

    // Long tasks analysis
    if (analysis.longTasks && analysis.longTasks.length > 0) {
      analysis.issues.push({
        id: `performance-long-tasks-${Date.now()}`,
        severity: analysis.longTasks.length > 5 ? "major" : "minor",
        type: "long_tasks_detected",
        title: "Long Tasks Detected",
        description: `Found ${analysis.longTasks.length} long tasks that may block the main thread`,
        impact:
          "Medium - Long tasks can cause poor user experience and janky interactions",
        evidence: {
          taskCount: analysis.longTasks.length,
          tasks: analysis.longTasks.slice(0, 3), // Show first 3 tasks
        },
        recommendation:
          "Break up long-running JavaScript tasks and optimize code execution",
      });
    }

    // Performance timing analysis
    if (timing) {
      // DOM nodes analysis
      if (timing.domNodes && timing.domNodes > 1500) {
        analysis.issues.push({
          id: `performance-dom-complexity-${Date.now()}`,
          severity: timing.domNodes > 3000 ? "major" : "minor",
          type: "high_dom_complexity",
          title: "High DOM Complexity",
          description: `Page has ${timing.domNodes} DOM nodes, which may impact performance`,
          impact:
            "Medium - Complex DOM structures can slow down rendering and interactions",
          evidence: {
            domNodes: timing.domNodes,
            threshold: 1500,
          },
          recommendation:
            "Reduce DOM complexity and consider virtual scrolling for large lists",
        });
      }

      // Layout and style recalculations
      if (timing.layoutCount && timing.layoutCount > 10) {
        analysis.issues.push({
          id: `performance-layout-thrashing-${Date.now()}`,
          severity: "minor",
          type: "layout_thrashing",
          title: "Excessive Layout Recalculations",
          description: `Page triggered ${timing.layoutCount} layout recalculations`,
          impact: "Medium - Excessive layouts can cause performance issues",
          evidence: {
            layoutCount: timing.layoutCount,
            threshold: 10,
          },
          recommendation:
            "Optimize CSS and JavaScript to reduce layout thrashing",
        });
      }
    }
  }

  /**
   * Enhanced performance budget compliance analysis
   */
  analyzePerformanceBudget(analysis) {
    if (!analysis.summary.budgetCompliance) return;

    const failedBudgets = Object.entries(
      analysis.summary.budgetCompliance
    ).filter(([, budget]) => !budget.passed);

    if (failedBudgets.length > 0) {
      for (const [metric, budget] of failedBudgets) {
        analysis.issues.push({
          id: `performance-budget-${metric}-${Date.now()}`,
          severity:
            Math.abs(budget.difference) > budget.threshold * 0.5
              ? "major"
              : "minor",
          type: "performance_budget_violation",
          title: `Performance Budget Violation: ${metric.toUpperCase()}`,
          description: `${metric.toUpperCase()} of ${
            budget.value
          } violates budget of ${budget.threshold}`,
          impact:
            "Medium - Performance budget violations indicate degraded user experience",
          evidence: {
            metric,
            actual: budget.value,
            budget: budget.threshold,
            difference: budget.difference,
          },
          recommendation: `Optimize ${metric} to meet performance budget requirements`,
        });
      }
    }
  }

  /**
   * Update detection thresholds
   */
  updateThresholds(newThresholds) {
    this.threshold = { ...this.threshold, ...newThresholds };
  }

  /**
   * Get detector configuration
   */
  getConfiguration() {
    return {
      threshold: this.threshold,
      metrics: [
        "first_contentful_paint",
        "largest_contentful_paint",
        "first_input_delay",
        "cumulative_layout_shift",
        "time_to_first_byte",
        "dom_complete_time",
        "load_event_time",
      ],
      capabilities: [
        "core_web_vitals_analysis",
        "timing_performance_analysis",
        "step_execution_analysis",
        "performance_consistency_analysis",
      ],
    };
  }
}
