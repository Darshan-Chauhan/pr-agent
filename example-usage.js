#!/usr/bin/env node

/**
 * Example Usage of PR-Aware Exploration Agent
 *
 * This demonstrates how the system connects GitHub PR changes
 * to local applications for automated testing.
 *
 * Features streaming AI responses using Ollama (gemma3:4b model)
 */

import { PRAgent } from "./src/core/PRAgent.js";
import { AppResolver } from "./src/services/AppResolver.js";
import { ScopeInferenceService } from "./src/llm/ScopeInferenceService.js";
import { ReportGenerator } from "./src/llm/ReportGenerator.js";
import { DetectorManager } from "./src/detectors/DetectorManager.js";
import chalk from "chalk";

/**
 * Progress tracker for real-time updates (demo version)
 */
class ProgressTracker {
  constructor() {
    this.steps = [];
    this.currentStep = 0;
    this.startTime = Date.now();
  }

  addStep(name, description) {
    this.steps.push({
      name,
      description,
      status: "pending",
      startTime: null,
      endTime: null,
    });
  }

  startStep(index) {
    if (this.steps[index]) {
      this.steps[index].status = "running";
      this.steps[index].startTime = Date.now();
      this.currentStep = index;
      this.displayProgress();
    }
  }

  completeStep(index, success = true) {
    if (this.steps[index]) {
      this.steps[index].status = success ? "completed" : "failed";
      this.steps[index].endTime = Date.now();
    }
  }

  displayProgress() {
    const currentStep = this.steps[this.currentStep];
    if (currentStep && currentStep.status === "running") {
      const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(1);
      const completed = this.steps.filter(
        (s) => s.status === "completed"
      ).length;
      const progress = ((completed / this.steps.length) * 100).toFixed(1);

      console.log(
        chalk.yellow(
          `🔄 ${currentStep.name}... (${progress}% complete, ${totalTime}s)`
        )
      );
    }
  }
}

/**
 * Enhanced Configuration Manager
 */
class ConfigurationManager {
  static checkEnvironment() {
    const checks = {
      "GitHub Token": !!process.env.GITHUB_TOKEN,
      "Ollama Available": false, // Will check dynamically
      "Node.js Version": process.version >= "v18",
      "Required Dependencies": true, // Simplified check
    };

    console.log(chalk.cyan("🔧 Environment Check:"));
    console.log(chalk.gray("─".repeat(40)));

    Object.entries(checks).forEach(([check, passed]) => {
      const icon = passed ? "✅" : "❌";
      const color = passed ? chalk.green : chalk.red;
      console.log(color(`${icon} ${check}`));
    });

    if (!checks["GitHub Token"]) {
      console.log(
        chalk.yellow(
          "\n💡 Set GITHUB_TOKEN environment variable for PR operations"
        )
      );
    }

    return Object.values(checks).every(Boolean);
  }

  static displayRecommendations() {
    console.log(chalk.cyan("\n🚀 Performance Recommendations:"));
    console.log(chalk.gray("─".repeat(40)));

    const recommendations = [
      "Set GITHUB_TOKEN for PR commenting",
      "Ensure Ollama is running: ollama serve",
      "Configure WEBHOOK_URL for notifications",
      "Increase MAX_STEPS for thorough testing",
      "Use --headed mode for visual debugging",
    ];

    recommendations.forEach((rec, i) => {
      console.log(chalk.blue(`${i + 1}. ${rec}`));
    });
  }

  static showPerformanceMetrics() {
    const metrics = {
      "Memory Usage": `${Math.round(
        process.memoryUsage().heapUsed / 1024 / 1024
      )}MB`,
      "Node.js Version": process.version,
      Platform: process.platform,
      "CPU Architecture": process.arch,
      Uptime: `${Math.round(process.uptime())}s`,
    };

    console.log(chalk.cyan("\n⚡ Performance Metrics:"));
    console.log(chalk.gray("─".repeat(40)));

    Object.entries(metrics).forEach(([metric, value]) => {
      console.log(chalk.blue(`📊 ${metric}: ${chalk.white(value)}`));
    });
  }
}

console.log(chalk.blue.bold("🤖 PR-Aware Exploration Agent - Example Usage\n"));

async function demonstrateEnhancedFeatures() {
  console.log(chalk.cyan("🌟 Step 0: Enhanced Features Showcase"));

  // Environment check
  console.log(chalk.blue("\n🔍 Environment Status:"));
  ConfigurationManager.checkEnvironment();

  // Progress tracker demo
  console.log(chalk.blue("\n📊 Progress Tracking Demo:"));
  const mockProgress = new ProgressTracker();
  mockProgress.addStep("Environment Check", "Validating system requirements");
  mockProgress.addStep("PR Analysis", "Fetching and analyzing PR data");
  mockProgress.addStep("App Detection", "Resolving target application");
  mockProgress.addStep("Testing", "Running comprehensive tests");
  mockProgress.addStep("Report Generation", "Creating AI-powered insights");

  for (let i = 0; i < mockProgress.steps.length; i++) {
    mockProgress.startStep(i);
    await new Promise((resolve) => setTimeout(resolve, 800)); // Simulate work
    mockProgress.completeStep(i);
  }

  console.log(chalk.green("\n✅ All enhanced features ready!"));

  // Performance metrics and recommendations
  ConfigurationManager.showPerformanceMetrics();
  ConfigurationManager.displayRecommendations();
  console.log();
}

async function demonstrateDetectorFindings() {
  console.log(
    chalk.cyan("🔍 Step 1.5: Enhanced Detector Display & GitHub Comments")
  );

  // Mock detector findings to demonstrate the new display
  const mockDetectorResults = {
    console: {
      issues: [
        {
          severity: "error",
          message:
            "Uncaught TypeError: Cannot read property 'length' of undefined",
          location: "/dashboard",
          details: { line: 42, file: "analytics.js" },
          suggestion: "Add null check before accessing array properties",
        },
        {
          severity: "warning",
          message: "Deprecated API usage in chart component",
          location: "/dashboard",
          details: { api: "legacy-chart-api-v1" },
          suggestion: "Migrate to chart-api-v2 for better performance",
        },
      ],
      recommendations: ["Fix critical JavaScript errors before deployment"],
    },
    network: {
      issues: [
        {
          severity: "major",
          message: "API endpoint returning 404 for user data",
          location: "GET /api/users/current",
          details: { status: 404, responseTime: "2.3s" },
          suggestion: "Verify API endpoint exists and has proper routing",
        },
      ],
      recommendations: ["Check API server configuration"],
    },
    performance: {
      issues: [
        {
          severity: "warning",
          message: "Large bundle size detected",
          location: "/dashboard",
          details: { bundleSize: "2.1MB", threshold: "1MB" },
          suggestion: "Consider code splitting to reduce initial bundle size",
        },
      ],
      recommendations: ["Optimize bundle size for better loading performance"],
    },
    visual: {
      issues: [],
      recommendations: [],
    },
  };

  // Create a detector manager for demonstration
  const detectorManager = new DetectorManager({
    enableGitHubComments: false, // Disable actual GitHub comments for demo
    prDetails: {
      repository: "browserstack/frontend",
      number: "1234",
      title: "Demo PR for detector showcase",
      author: "demo-user",
    },
  });

  console.log(chalk.blue("🎭 Simulating detector analysis results:\n"));

  // Display each detector's findings with enhanced formatting
  for (const [detectorName, result] of Object.entries(mockDetectorResults)) {
    console.log(chalk.cyan(`🔍 Running ${detectorName} detector...`));
    detectorManager.displayDetectorFindings(detectorName, result);

    if (result.issues.length > 0) {
      console.log(
        chalk.yellow(
          `💬 Would post comment to GitHub PR (${result.issues.length} findings)`
        )
      );
    }
    console.log(
      chalk.green(
        `✅ ${detectorName} detector completed: ${result.issues.length} issues found\n`
      )
    );
  }

  console.log(
    chalk.green("✅ Enhanced detector display demonstration completed!")
  );
}

async function demonstrateFlow() {
  try {
    // 0. Enhanced features showcase
    await demonstrateEnhancedFeatures();

    // 1. Show available apps
    console.log(chalk.cyan("📱 Step 1: Available Applications"));
    const appResolver = new AppResolver();
    await appResolver.listAvailableApps();
    console.log();

    // 1.5. Demonstrate detector findings display
    await demonstrateDetectorFindings();
    console.log();

    // 2. Simulate PR analysis
    console.log(chalk.cyan("📋 Step 2: PR Analysis Flow"));

    // Example PR data (this would come from GitHub API)
    const mockPRDetails = {
      number: 1234,
      title: "Add new dashboard analytics component",
      author: "developer-name",
      repository: { owner: "browserstack", name: "frontend" },
    };

    const mockChangedFiles = [
      {
        filename: "apps/quality-dashboard/src/components/Analytics.jsx",
        status: "added",
        changes: 156,
      },
      {
        filename: "apps/quality-dashboard/src/pages/Dashboard.jsx",
        status: "modified",
        changes: 45,
      },
      {
        filename: "packages/design-stack/modules/Chart/Chart.jsx",
        status: "modified",
        changes: 23,
      },
    ];

    console.log(chalk.gray("Changed files in PR:"));
    mockChangedFiles.forEach((file) => {
      console.log(
        chalk.gray(
          `  📄 ${file.filename} (${file.status}, ${file.changes} changes)`
        )
      );
    });
    console.log();

    // 3. Resolve target application
    console.log(chalk.cyan("🎯 Step 3: App Resolution"));
    const targetApp = await appResolver.resolveTargetApp(
      mockPRDetails,
      mockChangedFiles
    );

    if (targetApp) {
      console.log(chalk.green(`✅ Resolved to: ${targetApp.name}`));
      console.log(chalk.blue(`🔗 URL: ${targetApp.localApp.baseUrl}`));
      console.log(
        chalk.blue(
          `📊 Confidence: ${(targetApp.resolution.confidence * 100).toFixed(
            1
          )}%`
        )
      );
      console.log();

      // 4. Check if app is running
      console.log(chalk.cyan("🔍 Step 4: App Availability Check"));
      const isAvailable = await appResolver.verifyAppAvailability(targetApp);

      if (isAvailable) {
        console.log(chalk.green("✅ App is running and ready for testing"));
      } else {
        console.log(chalk.yellow("⚠️  App is not running"));
        console.log(
          chalk.blue(`💡 Start command: ${targetApp.localApp.startCommand}`)
        );
      }
      console.log();

      // 5. Show what would be tested
      console.log(chalk.cyan("🧪 Step 5: Test Plan Preview"));
      console.log(chalk.blue("Routes to test:"));
      targetApp.testConfig.routes.forEach((route) => {
        const critical = route.critical
          ? chalk.red("[CRITICAL]")
          : chalk.gray("[OPTIONAL]");
        console.log(
          chalk.gray(`  📄 ${route.path} - ${route.name} ${critical}`)
        );
      });

      if (targetApp.testConfig.components) {
        console.log(chalk.blue("Components to test:"));
        targetApp.testConfig.components.forEach((component) => {
          console.log(
            chalk.gray(`  🧩 ${component.name} (${component.selector})`)
          );
        });
      }
      console.log();

      // 6. AI Streaming Demo (if Ollama is available)
      console.log(chalk.cyan("🤖 Step 6: AI Streaming Demo"));

      try {
        // Test if Ollama is available
        const { ScopeInferenceService } = await import(
          "./src/llm/ScopeInferenceService.js"
        );
        const scopeService = new ScopeInferenceService();
        const isAvailable = await scopeService.checkOllamaAvailability();

        if (isAvailable) {
          console.log(
            chalk.green("✅ Ollama is available - testing streaming...")
          );
          console.log(chalk.blue("🔮 AI Analysis (streaming):"));
          console.log(chalk.gray("─".repeat(50)));

          // Quick scope inference to demonstrate streaming
          const mockScope = await scopeService.inferScope({
            prDetails: mockPRDetails,
            prDiff: { files: mockChangedFiles },
            repository: `${mockPRDetails.repository.owner}/${mockPRDetails.repository.name}`,
          });

          console.log(chalk.gray("─".repeat(50)));
          console.log(chalk.green("✅ Streaming analysis completed!"));

          // Bonus: Test report generation streaming too
          console.log(chalk.blue("\n📋 AI Report Generation (streaming):"));
          console.log(chalk.gray("─".repeat(50)));

          const reportGenerator = new ReportGenerator();
          const mockReport = await reportGenerator.generateReport({
            prDetails: mockPRDetails,
            explorationScope: mockScope,
            explorationPlan: { routes: [], components: [] },
            executionResults: { success: true, duration: 5000 },
            detectedIssues: [
              {
                type: "console",
                severity: "warning",
                message: "Deprecated API usage",
                location: "/dashboard",
              },
            ],
          });

          console.log(chalk.gray("─".repeat(50)));
          console.log(chalk.green("✅ Report streaming completed!"));
        } else {
          console.log(
            chalk.yellow("⚠️  Ollama not available - skipping streaming demo")
          );
          console.log(chalk.gray("Start Ollama with: ollama serve"));
        }
      } catch (error) {
        console.log(
          chalk.yellow(`⚠️  Streaming demo failed: ${error.message}`)
        );
      }
      console.log();

      // 7. Full execution example (dry run)
      console.log(chalk.cyan("🚀 Step 7: Full Execution Example (Dry Run)"));

      const prAgent = new PRAgent({
        prNumber: mockPRDetails.number,
        repository: `${mockPRDetails.repository.owner}/${mockPRDetails.repository.name}`,
        dryRun: true,
        verbose: false,
      });

      // Simulate the execution (this would normally fetch from GitHub)
      prAgent.prDetails = mockPRDetails;
      prAgent.prDiff = { files: mockChangedFiles };
      prAgent.targetApp = targetApp;
      prAgent.options.appUrl = targetApp.localApp.baseUrl;

      console.log(
        chalk.green("✅ Dry run completed - execution plan generated")
      );
      console.log();
    } else {
      console.log(chalk.yellow("⚠️  Could not resolve target application"));
    }

    // 8. Manual override example
    console.log(chalk.cyan("🔧 Step 8: Manual App Override"));
    console.log(chalk.gray("You can also manually specify an app or URL:"));
    console.log(chalk.blue("  npm run dev -- --pr 1234 --app qei-dashboard"));
    console.log(
      chalk.blue("  npm run dev -- --pr 1234 --app-url http://localhost:3001")
    );
    console.log();
  } catch (error) {
    console.error(chalk.red("❌ Demo failed:"), error.message);
  }
}

async function showRealUsage() {
  console.log(chalk.cyan.bold("📖 Real Usage Examples:\n"));

  console.log(chalk.blue("1. Automatic app detection from PR:"));
  console.log(chalk.gray("   npm run dev -- --pr 1234"));
  console.log(
    chalk.gray("   → Analyzes PR files and auto-detects target app\n")
  );

  console.log(chalk.blue("2. Manual app specification:"));
  console.log(chalk.gray("   npm run dev -- --pr 1234 --app qei-dashboard"));
  console.log(chalk.gray("   → Forces testing of specific configured app\n"));

  console.log(chalk.blue("3. Custom URL testing:"));
  console.log(
    chalk.gray("   npm run dev -- --pr 1234 --app-url http://localhost:3001")
  );
  console.log(chalk.gray("   → Tests any running application at given URL\n"));

  console.log(chalk.blue("4. Dry run (plan only):"));
  console.log(chalk.gray("   npm run dry -- --pr 1234"));
  console.log(
    chalk.gray("   → Shows what would be tested without execution\n")
  );

  console.log(chalk.blue("5. Interactive mode:"));
  console.log(chalk.gray("   npm run dev"));
  console.log(chalk.gray("   → Prompts for PR URL/number and options\n"));
}

// Run the demonstration
console.log(chalk.yellow("🎭 Running demonstration...\n"));
await demonstrateFlow();

console.log(chalk.yellow.bold("📚 Usage Guide:"));
await showRealUsage();

console.log(chalk.green.bold("🎉 Demo completed! Ready to test real PRs."));
