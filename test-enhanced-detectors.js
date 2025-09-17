#!/usr/bin/env node

/**
 * Test enhanced detectors with performance libraries
 */
import { PlaywrightRunner } from "./src/automation/PlaywrightRunner.js";
import { PerformanceDetector } from "./src/detectors/performance/PerformanceDetector.js";
import { ConsoleDetector } from "./src/detectors/console/ConsoleDetector.js";
import { NetworkDetector } from "./src/detectors/network/NetworkDetector.js";
import { VisualDetector } from "./src/detectors/visual/VisualDetector.js";
import chalk from "chalk";

async function testEnhancedDetectors() {
  console.log(
    chalk.cyan("🧪 Testing Enhanced Detectors with Performance Libraries...")
  );

  const runner = new PlaywrightRunner({
    headless: true,
    timeout: 30000,
    artifactsDir: "test-artifacts",
    // Enable all performance monitoring
    lighthouseEnabled: true,
    cdpEnabled: true,
    webVitalsEnabled: true,
    pixelmatchEnabled: true,
    sharpEnabled: true,
  });

  try {
    // Create a simple test plan
    const testPlan = {
      id: "enhanced-detector-test",
      steps: [
        {
          id: "nav-1",
          type: "action",
          action: "navigate",
          url: "https://example.com",
          description: "Navigate to example.com",
          timeout: 10000,
        },
        {
          id: "wait-1",
          type: "action",
          action: "wait",
          duration: 2000,
          description: "Wait for page to load",
        },
        {
          id: "screenshot-1",
          type: "artifact",
          action: "screenshot",
          description: "Take screenshot for visual analysis",
        },
      ],
    };

    console.log(chalk.blue("🚀 Executing test plan..."));
    const executionResults = await runner.executePlan(testPlan);

    console.log(
      chalk.green(
        `✅ Test plan executed: ${executionResults.successfulSteps}/${executionResults.totalSteps} steps successful`
      )
    );

    // Test each enhanced detector
    console.log(chalk.blue("🔍 Testing Enhanced Performance Detector..."));
    const performanceDetector = new PerformanceDetector({
      lighthouseEnabled: true,
      webVitalsEnabled: true,
      cdpEnabled: true,
    });
    const performanceResults = await performanceDetector.analyze(
      executionResults
    );
    console.log(
      chalk.green(
        `✅ Performance analysis completed: ${performanceResults.issues.length} issues found`
      )
    );

    if (performanceResults.lighthouseResults) {
      console.log(
        chalk.gray(
          `   Lighthouse Score: ${performanceResults.lighthouseResults.performanceScore}/100`
        )
      );
    }
    if (performanceResults.webVitalsData) {
      console.log(
        chalk.gray(
          `   Web Vitals: LCP=${performanceResults.webVitalsData.lcp}ms, FID=${performanceResults.webVitalsData.fid}ms`
        )
      );
    }

    console.log(chalk.blue("🔍 Testing Enhanced Console Detector..."));
    const consoleDetector = new ConsoleDetector({
      cdpEnabled: true,
      accessibilityEnabled: true,
      memoryMonitoringEnabled: true,
    });
    const consoleResults = await consoleDetector.analyze(executionResults);
    console.log(
      chalk.green(
        `✅ Console analysis completed: ${consoleResults.issues.length} issues found`
      )
    );

    if (consoleResults.memoryAnalysis) {
      console.log(
        chalk.gray(
          `   Memory Usage: ${consoleResults.memoryAnalysis.usedJSHeapSize} bytes`
        )
      );
    }

    console.log(chalk.blue("🔍 Testing Enhanced Network Detector..."));
    const networkDetector = new NetworkDetector({
      cdpEnabled: true,
      securityAnalysisEnabled: true,
      resourceOptimizationEnabled: true,
    });
    const networkResults = await networkDetector.analyze(executionResults);
    console.log(
      chalk.green(
        `✅ Network analysis completed: ${networkResults.issues.length} issues found`
      )
    );

    console.log(
      chalk.gray(`   Network Requests: ${networkResults.summary.totalRequests}`)
    );
    if (networkResults.securityAnalysis) {
      console.log(
        chalk.gray(
          `   Security Issues: ${
            networkResults.securityAnalysis.insecureConnections || 0
          }`
        )
      );
    }

    console.log(chalk.blue("🔍 Testing Enhanced Visual Detector..."));
    const visualDetector = new VisualDetector({
      visualRegressionEnabled: false, // Skip for test since no baseline
      accessibilityEnabled: true,
      advancedScreenshots: true,
      realLayoutShiftDetection: true,
    });
    const visualResults = await visualDetector.analyze(executionResults);
    console.log(
      chalk.green(
        `✅ Visual analysis completed: ${visualResults.issues.length} issues found`
      )
    );

    if (visualResults.realLayoutShiftData) {
      console.log(
        chalk.gray(
          `   Layout Shifts: ${visualResults.realLayoutShiftData.length}`
        )
      );
    }

    // Summary
    console.log(chalk.cyan("\n📊 Enhanced Detectors Test Summary:"));
    console.log(
      chalk.white(`   Performance Issues: ${performanceResults.issues.length}`)
    );
    console.log(
      chalk.white(`   Console Issues: ${consoleResults.issues.length}`)
    );
    console.log(
      chalk.white(`   Network Issues: ${networkResults.issues.length}`)
    );
    console.log(
      chalk.white(`   Visual Issues: ${visualResults.issues.length}`)
    );

    const totalIssues =
      performanceResults.issues.length +
      consoleResults.issues.length +
      networkResults.issues.length +
      visualResults.issues.length;

    console.log(
      chalk.green(
        `\n✅ All enhanced detectors working! Total issues detected: ${totalIssues}`
      )
    );

    return {
      success: true,
      results: {
        performance: performanceResults,
        console: consoleResults,
        network: networkResults,
        visual: visualResults,
      },
    };
  } catch (error) {
    console.error(
      chalk.red("❌ Enhanced detectors test failed:"),
      error.message
    );
    console.error(chalk.gray(error.stack));
    return {
      success: false,
      error: error.message,
    };
  }
}

// Run the test
testEnhancedDetectors()
  .then((result) => {
    if (result.success) {
      console.log(
        chalk.green("\n🎉 Enhanced detectors test completed successfully!")
      );
      process.exit(0);
    } else {
      console.log(chalk.red("\n💥 Enhanced detectors test failed!"));
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error(chalk.red("💥 Test execution failed:"), error.message);
    process.exit(1);
  });
