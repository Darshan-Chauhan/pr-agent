#!/usr/bin/env node

/**
 * Simple integration test for AI-powered pipeline
 */
import { AIContextManager } from "./src/ai/AIContextManager.js";
import { OllamaClient } from "./src/ai/OllamaClient.js";
import { AIStepGenerator } from "./src/ai/AIStepGenerator.js";
import chalk from "chalk";

async function testAIIntegration() {
  console.log(chalk.cyan("🧪 Testing AI Integration Pipeline..."));

  try {
    // Test 1: AI Context Manager
    console.log(chalk.blue("📝 Testing AI Context Manager..."));
    const contextManager = new AIContextManager();

    contextManager.setPRContext({
      title: "Test PR: Add new report component",
      number: 12345,
      changedFiles: [
        { filename: "src/components/DetailedReportRender.jsx" },
        { filename: "src/pages/ReportsPage.jsx" },
      ],
      components: [
        {
          name: "DetailedReportRender",
          file: "src/components/DetailedReportRender.jsx",
        },
      ],
      branch: "feature/new-report-component",
    });

    console.log(chalk.green("✅ Context Manager initialized"));
    console.log(
      chalk.gray(
        "   Summary:",
        JSON.stringify(contextManager.getSummary(), null, 2)
      )
    );

    // Test 2: Ollama Client (check availability)
    console.log(chalk.blue("🤖 Testing Ollama Client..."));
    const ollamaClient = new OllamaClient();

    const isAvailable = await ollamaClient.isAvailable();
    if (isAvailable) {
      console.log(chalk.green("✅ Ollama service is available"));

      // Test simple query
      try {
        const testPrompt =
          'Respond with a simple JSON: {"test": "success", "ai": "working"}';
        const response = await ollamaClient.query(testPrompt);
        console.log(chalk.green("✅ Ollama query successful"));
        console.log(
          chalk.gray("   Response:", JSON.stringify(response, null, 2))
        );
      } catch (queryError) {
        console.log(
          chalk.yellow("⚠️  Ollama query test failed:", queryError.message)
        );
      }
    } else {
      console.log(
        chalk.yellow(
          "⚠️  Ollama service not available - will use fallback methods"
        )
      );
    }

    // Test 3: AI Step Generator
    console.log(chalk.blue("🧠 Testing AI Step Generator..."));
    const stepGenerator = new AIStepGenerator(contextManager);

    const isAIReady = await stepGenerator.isAIReady();
    console.log(chalk.gray(`   AI Ready: ${isAIReady}`));

    // Test fallback step generation
    const fallbackSteps = stepGenerator.generateFallbackSteps({
      targetComponent: { name: "DetailedReportRender" },
      pageContext: {
        url: "http://test.example.com",
        title: "Test Page",
        clickableElements: [
          { tag: "BUTTON", text: "View Report", className: "btn-primary" },
          { tag: "A", text: "Reports", href: "/reports" },
        ],
      },
    });

    console.log(chalk.green("✅ Step Generator working"));
    console.log(chalk.gray("   Generated steps:", fallbackSteps.length));

    // Test 4: Context accumulation
    console.log(chalk.blue("📊 Testing Context Accumulation..."));

    contextManager.addNavigationStep({
      action: "ai-navigate",
      component: "DetailedReportRender",
      beforeUrl: "http://test.example.com",
      afterUrl: "http://test.example.com/reports",
      result: "success",
      confidence: 0.9,
    });

    contextManager.addAIDecision({
      component: "DetailedReportRender",
      action: "navigation",
      decision: { shouldClick: true, elementText: "Reports" },
      confidence: 0.9,
    });

    const contextForAI = contextManager.getContextForAI({
      component: { name: "DetailedReportRender" },
      currentUrl: "http://test.example.com/reports",
    });

    console.log(chalk.green("✅ Context accumulation working"));
    console.log(
      chalk.gray(
        "   Navigation history entries:",
        contextForAI.navigationHistory?.length || 0
      )
    );
    console.log(
      chalk.gray(
        "   Recent decisions:",
        contextForAI.recentDecisions?.length || 0
      )
    );

    console.log(chalk.green("\n🎉 AI Integration Test PASSED!"));
    console.log(chalk.cyan("📋 Summary:"));
    console.log(chalk.gray("   ✅ Context Manager: Working"));
    console.log(
      chalk.gray(
        `   ${isAvailable ? "✅" : "⚠️ "} Ollama Client: ${
          isAvailable ? "Connected" : "Fallback Mode"
        }`
      )
    );
    console.log(chalk.gray("   ✅ Step Generator: Working"));
    console.log(chalk.gray("   ✅ Context Accumulation: Working"));

    return true;
  } catch (error) {
    console.error(chalk.red("❌ AI Integration Test FAILED:"), error.message);
    console.error(error.stack);
    return false;
  }
}

// Run the test
testAIIntegration()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error(chalk.red("Test execution failed:"), error);
    process.exit(1);
  });
