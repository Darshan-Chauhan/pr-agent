import chalk from "chalk";

/**
 * Detects performance issues based on Core Web Vitals and browser metrics
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
    };
  }

  /**
   * Analyze performance metrics from execution results
   * @param {object} executionResults - Results from PlaywrightRunner
   * @returns {object} - Performance analysis results
   */
  async analyze(executionResults) {
    console.log(chalk.blue("⚡ Analyzing performance metrics..."));

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
      },
      issues: [],
      recommendations: [],
      performanceProfile: {},
      stepPerformance: [],
    };

    // Collect all performance data from execution steps
    const performanceData = [];

    for (const step of executionResults.steps) {
      // Check step-level performance data
      if (step.data && step.data.performance) {
        performanceData.push({
          ...step.data.performance,
          stepId: step.stepId,
          stepDescription: step.description,
          stepType: step.type,
          executionTime: step.executionTimeMs,
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
              artifactType: "performance",
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

    // Analyze collected performance data
    if (performanceData.length > 0) {
      this.analyzeCoreWebVitals(performanceData, analysis);
      this.analyzeTimingMetrics(performanceData, analysis);
      this.analyzeStepPerformance(analysis);
    }

    // Generate issues based on analysis
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
