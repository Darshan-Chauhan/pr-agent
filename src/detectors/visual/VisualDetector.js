import chalk from "chalk";
import fs from "fs/promises";
import path from "path";

/**
 * Detects visual regression issues, layout shifts, and rendering problems
 */
export class VisualDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || {
      clsThreshold: 0.1, // Cumulative Layout Shift
      renderTimeMs: 3000,
      viewportConsistency: 0.95,
    };
  }

  /**
   * Analyze visual aspects from execution results
   * @param {object} executionResults - Results from PlaywrightRunner
   * @returns {object} - Visual analysis results
   */
  async analyze(executionResults) {
    console.log(chalk.blue("👁️  Analyzing visual rendering..."));

    const analysis = {
      detector: "visual",
      timestamp: new Date().toISOString(),
      summary: {
        totalScreenshots: 0,
        renderIssues: 0,
        layoutShifts: 0,
        viewportTests: 0,
        estimatedCLS: 0,
      },
      issues: [],
      recommendations: [],
      screenshots: [],
      renderingMetrics: {},
      layoutAnalysis: {},
    };

    // Collect all visual artifacts from execution steps
    for (const step of executionResults.steps) {
      if (step.artifacts) {
        for (const artifact of step.artifacts) {
          if (artifact.type === "screenshot") {
            analysis.screenshots.push({
              ...artifact,
              stepId: step.stepId,
              stepDescription: step.description,
              stepType: step.type,
            });
            analysis.summary.totalScreenshots++;
          }
        }
      }

      // Analyze performance data for visual metrics
      if (step.data && step.data.performance) {
        this.analyzeVisualPerformance(step.data.performance, analysis);
      }
    }

    // Analyze screenshot sequences for visual consistency
    await this.analyzeScreenshotSequence(analysis);

    // Detect viewport consistency issues
    this.analyzeViewportConsistency(executionResults, analysis);

    // Generate issues based on analysis
    this.generateIssues(analysis);

    // Generate recommendations
    this.generateRecommendations(analysis);

    console.log(
      chalk.green(
        `✅ Visual analysis completed: ${analysis.issues.length} issues found`
      )
    );

    return analysis;
  }

  /**
   * Analyze visual performance metrics
   */
  analyzeVisualPerformance(performance, analysis) {
    // Estimate Cumulative Layout Shift (CLS) from performance data
    if (performance.loadTime && performance.domContentLoaded) {
      // Simplified CLS estimation based on timing differences
      const timingVariation = Math.abs(
        performance.loadTime - performance.domContentLoaded
      );
      const estimatedCLS = Math.min((timingVariation / 1000) * 0.1, 1.0);

      analysis.summary.estimatedCLS = Math.max(
        analysis.summary.estimatedCLS,
        estimatedCLS
      );
    }

    // Check render timing
    if (
      performance.domComplete &&
      performance.domComplete > this.threshold.renderTimeMs
    ) {
      analysis.summary.renderIssues++;
    }

    // Store detailed metrics
    analysis.renderingMetrics = {
      ...analysis.renderingMetrics,
      lastLoadTime: performance.loadTime,
      lastDomComplete: performance.domComplete,
      lastTTFB: performance.ttfb,
    };
  }

  /**
   * Analyze screenshot sequence for visual issues
   */
  async analyzeScreenshotSequence(analysis) {
    if (analysis.screenshots.length < 2) {
      return; // Need at least 2 screenshots for comparison
    }

    // Analyze screenshots for consistency patterns
    for (let i = 1; i < analysis.screenshots.length; i++) {
      const prev = analysis.screenshots[i - 1];
      const curr = analysis.screenshots[i];

      // Check for potential layout shifts between similar steps
      if (this.areRelatedSteps(prev, curr)) {
        const potentialShift = await this.detectPotentialLayoutShift(
          prev,
          curr
        );
        if (potentialShift) {
          analysis.summary.layoutShifts++;
          analysis.layoutAnalysis[`shift_${i}`] = potentialShift;
        }
      }
    }
  }

  /**
   * Check if two screenshot steps are related (same type or sequential navigation)
   */
  areRelatedSteps(step1, step2) {
    // Same step types might show layout shifts
    if (step1.stepType === step2.stepType) return true;

    // Sequential navigation steps
    if (step1.stepType === "navigate" && step2.stepType === "wait") return true;
    if (step1.stepType === "wait" && step2.stepType === "screenshot")
      return true;

    return false;
  }

  /**
   * Detect potential layout shift between screenshots
   */
  async detectPotentialLayoutShift(screenshot1, screenshot2) {
    try {
      // Basic file size comparison as a proxy for visual changes
      const stats1 = await fs.stat(screenshot1.path);
      const stats2 = await fs.stat(screenshot2.path);

      const sizeDifference = Math.abs(stats1.size - stats2.size) / stats1.size;

      // If significant size difference, might indicate layout change
      if (sizeDifference > 0.1) {
        return {
          type: "potential_layout_shift",
          sizeDifference,
          screenshot1: screenshot1.filename,
          screenshot2: screenshot2.filename,
          step1: screenshot1.stepDescription,
          step2: screenshot2.stepDescription,
        };
      }
    } catch (error) {
      console.log(
        chalk.gray(`Could not analyze screenshots: ${error.message}`)
      );
    }

    return null;
  }

  /**
   * Analyze viewport consistency across different screen sizes
   */
  analyzeViewportConsistency(executionResults, analysis) {
    const resizeSteps = executionResults.steps.filter(
      (step) => step.action === "resize"
    );

    analysis.summary.viewportTests = resizeSteps.length;

    // Check if resize tests were performed
    if (resizeSteps.length === 0) {
      analysis.issues.push({
        id: `visual-no-viewport-tests-${Date.now()}`,
        severity: "minor",
        type: "missing_viewport_tests",
        title: "No Responsive Design Testing",
        description:
          "No viewport resize tests were performed to check responsive design",
        impact: "Low - Cannot verify responsive design compatibility",
        evidence: {
          resizeSteps: 0,
        },
        recommendation:
          "Add viewport resize tests to ensure responsive design compatibility",
      });
    }

    // Analyze resize step outcomes
    for (const resizeStep of resizeSteps) {
      if (resizeStep.status === "failed") {
        analysis.issues.push({
          id: `visual-resize-failed-${Date.now()}`,
          severity: "major",
          type: "resize_failure",
          title: "Viewport Resize Failed",
          description: `Viewport resize to ${resizeStep.data?.width}x${resizeStep.data?.height} failed`,
          impact: "Medium - Responsive design may not work properly",
          evidence: {
            targetWidth: resizeStep.data?.width,
            targetHeight: resizeStep.data?.height,
            error: resizeStep.error,
          },
          recommendation: "Investigate and fix responsive design issues",
        });
      }
    }
  }

  /**
   * Generate issues based on analysis
   */
  generateIssues(analysis) {
    // High CLS issue
    if (analysis.summary.estimatedCLS > this.threshold.clsThreshold) {
      analysis.issues.push({
        id: `visual-high-cls-${Date.now()}`,
        severity: "major",
        type: "high_cumulative_layout_shift",
        title: "High Cumulative Layout Shift Detected",
        description: `Estimated CLS of ${analysis.summary.estimatedCLS.toFixed(
          3
        )} exceeds threshold of ${this.threshold.clsThreshold}`,
        impact:
          "High - Layout shifts create poor user experience and can cause accidental clicks",
        evidence: {
          estimatedCLS: analysis.summary.estimatedCLS,
          threshold: this.threshold.clsThreshold,
        },
        recommendation:
          "Optimize layout stability by reserving space for dynamic content",
      });
    }

    // Render performance issues
    if (analysis.summary.renderIssues > 0) {
      analysis.issues.push({
        id: `visual-slow-render-${Date.now()}`,
        severity: "minor",
        type: "slow_rendering",
        title: "Slow Visual Rendering Detected",
        description: `Found ${analysis.summary.renderIssues} instances of slow rendering exceeding ${this.threshold.renderTimeMs}ms`,
        impact:
          "Medium - Slow rendering affects perceived performance and user experience",
        evidence: {
          slowRenderInstances: analysis.summary.renderIssues,
          threshold: this.threshold.renderTimeMs,
          lastDomComplete: analysis.renderingMetrics.lastDomComplete,
        },
        recommendation:
          "Optimize rendering performance by reducing DOM complexity and optimizing CSS",
      });
    }

    // Layout shift issues
    if (analysis.summary.layoutShifts > 0) {
      analysis.issues.push({
        id: `visual-layout-shifts-${Date.now()}`,
        severity: "minor",
        type: "layout_shifts",
        title: "Potential Layout Shifts Detected",
        description: `Detected ${analysis.summary.layoutShifts} potential layout shifts between screenshots`,
        impact: "Medium - Layout shifts can cause poor user experience",
        evidence: {
          layoutShifts: analysis.summary.layoutShifts,
          analysis: analysis.layoutAnalysis,
        },
        recommendation:
          "Review layout stability and ensure consistent element positioning",
      });
    }

    // Insufficient visual testing
    if (analysis.summary.totalScreenshots < 5) {
      analysis.issues.push({
        id: `visual-insufficient-coverage-${Date.now()}`,
        severity: "minor",
        type: "insufficient_visual_testing",
        title: "Limited Visual Testing Coverage",
        description: `Only ${analysis.summary.totalScreenshots} screenshots captured during testing`,
        impact: "Low - May miss visual issues in untested areas",
        evidence: {
          screenshotCount: analysis.summary.totalScreenshots,
          recommended: 10,
        },
        recommendation:
          "Increase visual testing coverage by capturing more screenshots",
      });
    }
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(analysis) {
    // Layout stability recommendations
    if (analysis.summary.estimatedCLS > 0.05) {
      analysis.recommendations.push({
        type: "layout_stability",
        priority: "high",
        title: "Improve Layout Stability",
        description:
          "Reserve space for dynamic content and avoid inserting content above existing elements",
        impact:
          "Significantly improves user experience and Core Web Vitals scores",
      });
    }

    // Visual testing recommendations
    if (analysis.summary.viewportTests === 0) {
      analysis.recommendations.push({
        type: "responsive_testing",
        priority: "medium",
        title: "Add Responsive Design Testing",
        description:
          "Test the application across different viewport sizes to ensure responsive design",
        impact: "Ensures compatibility across devices and screen sizes",
      });
    }

    // Performance recommendations
    if (analysis.renderingMetrics.lastDomComplete > 2000) {
      analysis.recommendations.push({
        type: "rendering_performance",
        priority: "medium",
        title: "Optimize Rendering Performance",
        description:
          "Reduce DOM complexity, optimize CSS, and minimize layout recalculations",
        impact: "Improves perceived performance and user satisfaction",
      });
    }

    // Visual regression testing
    if (analysis.screenshots.length > 0) {
      analysis.recommendations.push({
        type: "visual_regression",
        priority: "low",
        title: "Implement Visual Regression Testing",
        description:
          "Use captured screenshots as baseline for automated visual regression testing",
        impact: "Prevents visual bugs from reaching production",
      });
    }

    // Accessibility recommendations
    analysis.recommendations.push({
      type: "visual_accessibility",
      priority: "medium",
      title: "Consider Visual Accessibility",
      description:
        "Ensure sufficient color contrast, readable fonts, and proper spacing for accessibility",
      impact: "Improves accessibility and usability for all users",
    });
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
      capabilities: [
        "layout_shift_detection",
        "render_performance_analysis",
        "viewport_consistency_testing",
        "screenshot_comparison",
      ],
    };
  }
}
