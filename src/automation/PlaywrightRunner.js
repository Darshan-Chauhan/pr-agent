import { chromium } from "playwright";
import chalk from "chalk";
import path from "path";
import fs from "fs/promises";
import axios from "axios";
import { RouteDiscoveryService } from "../services/RouteDiscoveryService.js";
import { AIContextManager } from "../ai/AIContextManager.js";
import { AIRouteDiscovery } from "../ai/AIRouteDiscovery.js";
import { AIStepGenerator } from "../ai/AIStepGenerator.js";
import { OllamaClient } from "../ai/OllamaClient.js";
import PerformanceUtils from "../utils/PerformanceUtils.js";
import VisualUtils from "../utils/VisualUtils.js";

/**
 * Executes exploration plans using Playwright browser automation
 */
export class PlaywrightRunner {
  constructor(options = {}) {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.artifactsDir = options.artifactsDir || "artifacts";
    // Set configuration based on environment or defaults
    this.headless =
      process.env.HEADLESS === "true" || options.headless === true; // Default to visible mode for debugging
    this.timeout = options.timeout || 30000;
    this.viewport = options.viewport || { width: 1920, height: 1080 };

    // Execution state
    this.executionLog = [];
    this.startTime = null;
    this.stepResults = [];
    this.artifacts = [];

    // AI-powered navigation and context
    this.ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
    this.model = process.env.OLLAMA_MODEL || "gemma3:4b";
    this.prContext = null; // Will store PR details for AI context

    // Initialize AI services
    this.aiContextManager = new AIContextManager();
    this.aiRouteDiscovery = new AIRouteDiscovery(null, this.aiContextManager, {
      ollama: { ollamaUrl: this.ollamaUrl, model: this.model },
    });
    this.aiStepGenerator = new AIStepGenerator(this.aiContextManager, {
      ollama: { ollamaUrl: this.ollamaUrl, model: this.model },
    });
    this.ollamaClient = new OllamaClient({
      ollamaUrl: this.ollamaUrl,
      model: this.model,
    });

    // Initialize performance monitoring utilities
    this.performanceUtils = new PerformanceUtils({
      lighthouseEnabled: options.lighthouseEnabled !== false,
      cdpEnabled: options.cdpEnabled !== false,
      webVitalsEnabled: options.webVitalsEnabled !== false,
    });

    this.visualUtils = new VisualUtils({
      pixelmatchEnabled: options.pixelmatchEnabled !== false,
      sharpEnabled: options.sharpEnabled !== false,
    });

    // Performance and monitoring state
    this.cdpSession = null;
    this.networkRequests = [];
    this.consoleMessages = [];
    this.performanceEntries = [];
  }

  /**
   * Set PR context for AI-powered navigation
   * @param {object} prContext - PR details and diff
   */
  setPRContext(prContext) {
    this.prContext = prContext;
    this.aiContextManager.setPRContext(prContext);
  }

  /**
   * Execute exploration plan
   * @param {object} plan - Exploration plan to execute
   * @returns {object} - Execution results
   */
  async executePlan(plan) {
    console.log(chalk.cyan("🚀 Starting Playwright execution..."));
    this.startTime = Date.now();

    try {
      await this.setupBrowser();
      await this.setupArtifactsDirectory();

      const results = {
        planId: plan.id,
        startTime: new Date().toISOString(),
        endTime: null,
        totalSteps: plan.steps.length,
        executedSteps: 0,
        successfulSteps: 0,
        failedSteps: 0,
        skippedSteps: 0,
        steps: [],
        artifacts: [],
        errors: [],
        performance: {},
        executionTimeMs: 0,
      };

      // Execute each step
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        console.log(
          chalk.blue(
            `📋 Step ${i + 1}/${plan.steps.length}: ${step.description}`
          )
        );

        const stepResult = await this.executeStep(step, i + 1);
        results.steps.push(stepResult);
        results.executedSteps++;

        if (stepResult.status === "success") {
          results.successfulSteps++;
        } else if (stepResult.status === "failed") {
          results.failedSteps++;
          if (!step.optional) {
            console.log(
              chalk.red(`❌ Critical step failed, stopping execution`)
            );
            break;
          }
        } else if (stepResult.status === "skipped") {
          results.skippedSteps++;
        }

        // Collect artifacts from this step
        if (stepResult.artifacts) {
          results.artifacts.push(...stepResult.artifacts);
        }

        // Add small delay between steps
        await this.sleep(500);
      }

      // Capture final performance metrics
      results.performance = await this.capturePerformanceMetrics();

      // Add enhanced execution data for detectors
      results.url = this.page ? this.page.url() : null;
      results.page = this.page;
      results.cdpSession = this.cdpSession;
      results.networkRequests = [...this.networkRequests];
      results.consoleMessages = [...this.consoleMessages];
      results.performanceEntries = [...this.performanceEntries];
      results.executionLog = [...this.executionLog];

      // Add utility instances for detectors
      results.performanceUtils = this.performanceUtils;
      results.visualUtils = this.visualUtils;

      const endTime = Date.now();
      results.endTime = new Date().toISOString();
      results.executionTimeMs = endTime - this.startTime;

      console.log(
        chalk.green(`✅ Execution completed in ${results.executionTimeMs}ms`)
      );
      console.log(
        chalk.cyan(
          `📊 Results: ${results.successfulSteps} success, ${results.failedSteps} failed, ${results.skippedSteps} skipped`
        )
      );
      console.log(
        chalk.gray(
          `   📊 Enhanced data: ${results.networkRequests.length} network requests, ${results.consoleMessages.length} console messages`
        )
      );

      return results;
    } catch (error) {
      console.error(chalk.red("❌ Execution failed:"), error.message);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Execute a single step
   */
  async executeStep(step, stepNumber) {
    const startTime = Date.now();

    const result = {
      stepId: step.id,
      stepNumber,
      type: step.type,
      action: step.action,
      description: step.description,
      startTime: new Date().toISOString(),
      endTime: null,
      executionTimeMs: 0,
      status: "pending",
      artifacts: [],
      error: null,
      data: {},
    };

    try {
      switch (step.action) {
        case "navigate":
          await this.handleNavigate(step, result);
          break;

        case "wait":
          await this.handleWait(step, result);
          break;

        case "click":
          await this.handleClick(step, result);
          break;

        case "type":
          await this.handleType(step, result);
          break;

        case "select":
          await this.handleSelect(step, result);
          break;

        case "keyboard":
          await this.handleKeyboard(step, result);
          break;

        case "screenshot":
          await this.handleScreenshot(step, result);
          break;

        case "resize":
          await this.handleResize(step, result);
          break;

        case "scroll":
          await this.handleScroll(step, result);
          break;

        case "hover":
          await this.handleHover(step, result);
          break;

        case "capture_state":
          await this.handleCaptureState(step, result);
          break;

        case "check_loading_complete":
          await this.handleCheckLoadingComplete(step, result);
          break;

        case "test_empty_form_submission":
          await this.handleTestEmptyFormSubmission(step, result);
          break;

        case "test_rapid_interactions":
          await this.handleTestRapidInteractions(step, result);
          break;

        case "validate_final_state":
          await this.handleValidateFinalState(step, result);
          break;

        case "capture_performance_summary":
          await this.handleCapturePerformanceSummary(step, result);
          break;

        case "discover":
          await this.handleRouteDiscovery(step, result);
          break;

        case "navigate-to-projects":
          await this.handleNavigateToProjects(step, result);
          break;

        case "navigate-to-project":
          await this.handleNavigateToProject(step, result);
          break;

        case "navigate-for-component":
          await this.handleNavigateForComponent(step, result);
          break;

        case "test":
          await this.handleTestInteractions(step, result);
          break;

        case "discover-component":
          await this.handleDiscoverComponent(step, result);
          break;

        case "test-dynamic-interactions":
          await this.handleTestDynamicInteractions(step, result);
          break;

        case "ai-navigate":
          await this.handleAINavigate(step, result);
          break;

        case "ai-discover":
          await this.handleAIDiscover(step, result);
          break;

        case "ai-test":
          await this.handleAITest(step, result);
          break;

        case "ai-route-discovery":
          await this.handleAIRouteDiscovery(step, result);
          break;

        case "ai-generate-steps":
          await this.handleAIGenerateSteps(step, result);
          break;

        default:
          console.log(
            chalk.yellow(`⚠️  Unknown action: ${step.action}, skipping`)
          );
          result.status = "skipped";
          result.error = `Unknown action: ${step.action}`;
      }

      // Capture step artifacts if specified
      if (step.artifacts && result.status !== "failed") {
        await this.captureStepArtifacts(step, result, stepNumber);
      }

      if (result.status === "pending") {
        result.status = "success";
      }
    } catch (error) {
      console.error(chalk.red(`❌ Step failed: ${error.message}`));
      result.status = step.optional ? "skipped" : "failed";
      result.error = error.message;

      // Take screenshot on error for debugging
      try {
        const errorScreenshot = await this.takeScreenshot(
          `error-step-${stepNumber}`
        );
        if (errorScreenshot) {
          result.artifacts.push(errorScreenshot);
        }
      } catch (screenshotError) {
        console.error(
          chalk.red("Failed to take error screenshot:", screenshotError.message)
        );
      }
    }

    const endTime = Date.now();
    result.endTime = new Date().toISOString();
    result.executionTimeMs = endTime - startTime;

    return result;
  }

  /**
   * Handle navigation step
   */
  async handleNavigate(step, result) {
    console.log(chalk.blue(`🔗 Navigating to: ${step.url}`));

    const response = await this.page.goto(step.url, {
      timeout: step.timeout || this.timeout,
      waitUntil: "domcontentloaded",
    });

    result.data.url = step.url;
    result.data.status = response.status();
    result.data.statusText = response.statusText();

    if (response.status() >= 400) {
      throw new Error(
        `Navigation failed with status ${response.status()}: ${response.statusText()}`
      );
    }
  }

  /**
   * Handle wait step
   */
  async handleWait(step, result) {
    console.log(chalk.blue(`⏳ Waiting for: ${step.selector}`));

    const timeout = step.timeout || 10000;

    try {
      if (step.condition === "visible") {
        await this.page.waitForSelector(step.selector, {
          state: "visible",
          timeout,
        });
      } else if (step.condition === "hidden") {
        await this.page.waitForSelector(step.selector, {
          state: "hidden",
          timeout,
        });
      } else {
        await this.page.waitForSelector(step.selector, { timeout });
      }

      result.data.selector = step.selector;
      result.data.condition = step.condition;
    } catch (error) {
      if (step.optional) {
        console.log(chalk.yellow(`⚠️  Optional wait failed: ${error.message}`));
        result.status = "skipped";
      } else {
        throw error;
      }
    }
  }

  /**
   * Handle click step
   */
  async handleClick(step, result) {
    console.log(chalk.blue(`👆 Clicking: ${step.selector}`));

    // Wait for element to be clickable
    await this.page.waitForSelector(step.selector, {
      state: "visible",
      timeout: step.timeout || 5000,
    });

    const element = await this.page.locator(step.selector).first();
    await element.click({
      timeout: step.timeout || 5000,
    });

    result.data.selector = step.selector;

    // Wait after click if specified
    if (step.waitAfter) {
      await this.sleep(step.waitAfter);
    }
  }

  /**
   * Handle type step
   */
  async handleType(step, result) {
    console.log(chalk.blue(`⌨️  Typing into: ${step.selector}`));

    await this.page.waitForSelector(step.selector, {
      state: "visible",
      timeout: step.timeout || 5000,
    });

    const element = await this.page.locator(step.selector).first();

    // Clear existing content if specified
    if (step.clear !== false) {
      await element.clear();
    }

    await element.type(step.value || "", {
      delay: step.delay || 50,
    });

    result.data.selector = step.selector;
    result.data.value = step.value;
  }

  /**
   * Handle select step
   */
  async handleSelect(step, result) {
    console.log(chalk.blue(`🎯 Selecting: ${step.value} in ${step.selector}`));

    await this.page.waitForSelector(step.selector, {
      state: "visible",
      timeout: step.timeout || 5000,
    });

    await this.page.selectOption(step.selector, step.value);

    result.data.selector = step.selector;
    result.data.value = step.value;
  }

  /**
   * Handle keyboard step
   */
  async handleKeyboard(step, result) {
    console.log(chalk.blue(`⌨️  Pressing key: ${step.key}`));

    await this.page.keyboard.press(step.key);

    result.data.key = step.key;

    // Wait after key press
    await this.sleep(step.waitAfter || 1000);
  }

  /**
   * Handle screenshot step
   */
  async handleScreenshot(step, result) {
    console.log(chalk.blue(`📸 Taking screenshot`));

    const screenshotPath = await this.takeScreenshot(
      step.filename || `screenshot-${Date.now()}`
    );

    if (screenshotPath) {
      result.artifacts.push({
        type: "screenshot",
        path: screenshotPath,
        filename: path.basename(screenshotPath),
      });
    }

    result.data.screenshot = screenshotPath;
  }

  /**
   * Handle resize step
   */
  async handleResize(step, result) {
    console.log(chalk.blue(`📱 Resizing to: ${step.width}x${step.height}`));

    await this.page.setViewportSize({
      width: step.width,
      height: step.height,
    });

    result.data.width = step.width;
    result.data.height = step.height;

    // Wait for resize to settle
    await this.sleep(1000);
  }

  /**
   * Handle scroll step
   */
  async handleScroll(step, result) {
    console.log(chalk.blue(`📜 Scrolling`));

    if (step.selector) {
      const element = await this.page.locator(step.selector);
      await element.scrollIntoViewIfNeeded();
    } else {
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
    }

    result.data.selector = step.selector;
  }

  /**
   * Handle hover step
   */
  async handleHover(step, result) {
    console.log(chalk.blue(`👉 Hovering over: ${step.selector}`));

    await this.page.waitForSelector(step.selector, {
      state: "visible",
      timeout: step.timeout || 5000,
    });

    await this.page.locator(step.selector).first().hover();

    result.data.selector = step.selector;

    // Wait after hover
    await this.sleep(step.waitAfter || 500);
  }

  /**
   * Handle capture state step
   */
  async handleCaptureState(step, result) {
    console.log(chalk.blue(`📊 Capturing page state`));

    const state = {
      url: this.page.url(),
      title: await this.page.title(),
      timestamp: new Date().toISOString(),
      viewport: await this.page.viewportSize(),
    };

    result.data.state = state;
  }

  /**
   * Handle check loading complete step
   */
  async handleCheckLoadingComplete(step, result) {
    console.log(chalk.blue(`🔄 Checking loading indicators`));

    const selectors = step.selectors || [
      '[data-testid="loading"]',
      ".loading",
      ".spinner",
    ];

    for (const selector of selectors) {
      try {
        const isVisible = await this.page.isVisible(selector);
        if (isVisible) {
          // Wait for loading indicator to disappear
          await this.page.waitForSelector(selector, {
            state: "hidden",
            timeout: step.timeout || 10000,
          });
        }
      } catch (error) {
        // Loading indicator might not exist, which is fine
        console.log(chalk.gray(`Loading indicator ${selector} not found`));
      }
    }

    result.data.checkedSelectors = selectors;
  }

  /**
   * Handle test empty form submission step
   */
  async handleTestEmptyFormSubmission(step, result) {
    console.log(chalk.blue(`📝 Testing empty form submission`));

    const forms = await this.page.locator("form").all();
    let testedForms = 0;

    for (const form of forms) {
      try {
        const submitButton = form
          .locator('button[type="submit"], input[type="submit"]')
          .first();

        if (await submitButton.isVisible()) {
          await submitButton.click();
          testedForms++;

          // Wait for potential validation messages
          await this.sleep(1000);
        }
      } catch (error) {
        console.log(
          chalk.gray(`Form submission test failed: ${error.message}`)
        );
      }
    }

    result.data.testedForms = testedForms;
  }

  /**
   * Handle test rapid interactions step
   */
  async handleTestRapidInteractions(step, result) {
    console.log(chalk.blue(`⚡ Testing rapid interactions`));

    const buttons = await this.page.locator("button:not([disabled])").all();
    let clickedButtons = 0;

    for (const button of buttons.slice(0, 5)) {
      // Limit to first 5 buttons
      try {
        if (await button.isVisible()) {
          // Rapid clicks
          await button.click();
          await button.click();
          await button.click();
          clickedButtons++;
        }
      } catch (error) {
        console.log(chalk.gray(`Rapid interaction failed: ${error.message}`));
      }
    }

    result.data.clickedButtons = clickedButtons;
  }

  /**
   * Handle validate final state step
   */
  async handleValidateFinalState(step, result) {
    console.log(chalk.blue(`✅ Validating final state`));

    const validations = {
      consoleErrors: [],
      networkFailures: [],
      pageResponsive: true,
    };

    // Check console errors
    try {
      const consoleMessages = await this.page.evaluate(() => {
        return window.__playwright_console_logs || [];
      });
      validations.consoleErrors = consoleMessages.filter(
        (msg) => msg.type === "error"
      );
    } catch (error) {
      console.log(chalk.gray("Could not check console errors"));
    }

    // Test page responsiveness
    try {
      await this.page.evaluate(() => {
        return document.readyState === "complete";
      });
    } catch (error) {
      validations.pageResponsive = false;
    }

    result.data.validations = validations;
  }

  /**
   * Handle capture performance summary step
   */
  async handleCapturePerformanceSummary(step, result) {
    console.log(chalk.blue(`📈 Capturing performance summary`));

    const performance = await this.capturePerformanceMetrics();
    result.data.performance = performance;
  }

  /**
   * Capture step artifacts
   */
  async captureStepArtifacts(step, result, stepNumber) {
    const stepArtifacts = [];

    for (const artifactType of step.artifacts || []) {
      try {
        let artifact = null;

        switch (artifactType) {
          case "screenshot":
            artifact = await this.takeScreenshot(
              `step-${stepNumber}-${step.action}`
            );
            if (artifact) {
              stepArtifacts.push({
                type: "screenshot",
                path: artifact,
                filename: path.basename(artifact),
              });
            }
            break;

          case "console":
            artifact = await this.captureConsoleLogs();
            if (artifact) {
              stepArtifacts.push({
                type: "console",
                data: artifact,
                count: artifact.length,
              });
            }
            break;

          case "network":
            artifact = await this.captureNetworkActivity();
            if (artifact) {
              stepArtifacts.push({
                type: "network",
                data: artifact,
                count: artifact.requests?.length || 0,
              });
            }
            break;

          case "performance":
            artifact = await this.capturePerformanceMetrics();
            if (artifact) {
              stepArtifacts.push({
                type: "performance",
                data: artifact,
              });
            }
            break;

          case "dom":
            artifact = await this.captureDOM();
            if (artifact) {
              stepArtifacts.push({
                type: "dom",
                path: artifact,
                filename: path.basename(artifact),
              });
            }
            break;
        }
      } catch (error) {
        console.log(
          chalk.gray(`Failed to capture ${artifactType}: ${error.message}`)
        );
      }
    }

    result.artifacts.push(...stepArtifacts);
  }

  /**
   * Setup browser and context
   */
  async setupBrowser() {
    console.log(chalk.cyan("🌐 Setting up browser..."));
    console.log(
      chalk.gray(
        `   Headless mode: ${this.headless ? "ON (hidden)" : "OFF (visible)"}`
      )
    );

    this.browser = await chromium.launch({
      headless: this.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    });

    this.context = await this.browser.newContext({
      viewport: this.viewport,
      recordVideo: {
        dir: path.join(this.artifactsDir, "videos"),
        size: this.viewport,
      },
      recordHar: {
        path: path.join(this.artifactsDir, "network.har"),
      },
    });

    // Enable console logging
    this.context.on("console", (msg) => {
      this.executionLog.push({
        type: "console",
        level: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
    });

    // Enable request tracking
    this.context.on("request", (request) => {
      this.executionLog.push({
        type: "request",
        url: request.url(),
        method: request.method(),
        timestamp: Date.now(),
      });
    });

    // Enable response tracking
    this.context.on("response", (response) => {
      this.executionLog.push({
        type: "response",
        url: response.url(),
        status: response.status(),
        timestamp: Date.now(),
      });
    });

    this.page = await this.context.newPage();

    // Set default timeouts
    this.page.setDefaultTimeout(this.timeout);
    this.page.setDefaultNavigationTimeout(this.timeout);

    // Setup CDP session for enhanced monitoring
    await this.setupCDPSession();

    // Setup enhanced monitoring
    await this.setupEnhancedMonitoring();

    // Connect AI services to the page
    this.aiRouteDiscovery.page = this.page;
  }

  /**
   * Setup artifacts directory
   */
  async setupArtifactsDirectory() {
    try {
      await fs.mkdir(this.artifactsDir, { recursive: true });
      await fs.mkdir(path.join(this.artifactsDir, "screenshots"), {
        recursive: true,
      });
      await fs.mkdir(path.join(this.artifactsDir, "videos"), {
        recursive: true,
      });
      await fs.mkdir(path.join(this.artifactsDir, "dom"), { recursive: true });
    } catch (error) {
      console.error(
        chalk.red("Failed to setup artifacts directory:", error.message)
      );
    }
  }

  /**
   * Take screenshot
   */
  async takeScreenshot(filename) {
    try {
      const screenshotPath = path.join(
        this.artifactsDir,
        "screenshots",
        `${filename}.png`
      );

      await this.page.screenshot({
        path: screenshotPath,
        fullPage: true,
      });

      return screenshotPath;
    } catch (error) {
      console.error(chalk.red("Screenshot failed:", error.message));
      return null;
    }
  }

  /**
   * Capture console logs
   */
  async captureConsoleLogs() {
    return this.executionLog.filter((log) => log.type === "console");
  }

  /**
   * Capture network activity
   */
  async captureNetworkActivity() {
    const requests = this.executionLog.filter((log) => log.type === "request");
    const responses = this.executionLog.filter(
      (log) => log.type === "response"
    );

    return {
      requests,
      responses,
      summary: {
        totalRequests: requests.length,
        successfulResponses: responses.filter((r) => r.status < 400).length,
        failedResponses: responses.filter((r) => r.status >= 400).length,
      },
    };
  }

  /**
   * Capture performance metrics
   */
  async capturePerformanceMetrics() {
    try {
      // Basic navigation metrics (existing functionality)
      const basicMetrics = await this.page.evaluate(() => {
        const perf = performance.getEntriesByType("navigation")[0];
        return {
          loadTime: perf.loadEventEnd - perf.loadEventStart,
          domContentLoaded:
            perf.domContentLoadedEventEnd - perf.domContentLoadedEventStart,
          ttfb: perf.responseStart - perf.requestStart,
          domComplete: perf.domComplete - perf.navigationStart,
          timestamp: Date.now(),
        };
      });

      // Enhanced metrics using PerformanceUtils
      let enhancedMetrics = { ...basicMetrics };

      if (this.cdpSession && this.performanceUtils) {
        try {
          const cdpMetrics = await this.performanceUtils.collectCDPMetrics(
            this.cdpSession
          );
          enhancedMetrics = {
            ...enhancedMetrics,
            ...cdpMetrics,
            enhanced: true,
          };
        } catch (error) {
          console.log(
            chalk.yellow(`Could not collect enhanced metrics: ${error.message}`)
          );
        }
      }

      // Add collected network and console data
      enhancedMetrics.networkRequests = this.networkRequests.length;
      enhancedMetrics.consoleMessages = this.consoleMessages.length;
      enhancedMetrics.performanceEntries = this.performanceEntries.length;

      return enhancedMetrics;
    } catch (error) {
      console.error(chalk.red("Performance capture failed:", error.message));
      return null;
    }
  }

  /**
   * Capture DOM snapshot
   */
  async captureDOM() {
    try {
      const domPath = path.join(
        this.artifactsDir,
        "dom",
        `dom-${Date.now()}.html`
      );

      const content = await this.page.content();
      await fs.writeFile(domPath, content, "utf8");

      return domPath;
    } catch (error) {
      console.error(chalk.red("DOM capture failed:", error.message));
      return null;
    }
  }

  /**
   * Handle intelligent route discovery
   */
  async handleRouteDiscovery(step, result) {
    console.log(chalk.blue(`🗺️  ${step.description}`));

    try {
      const routeDiscovery = new RouteDiscoveryService(this.page);

      if (step.strategy === "landing-page-analysis") {
        const landingPageInfo = await routeDiscovery.analyzeLandingPage();
        result.data.landingPageInfo = landingPageInfo;

        console.log(
          chalk.gray(
            `  Found ${landingPageInfo.projectLinks.length} project links`
          )
        );
        console.log(
          chalk.gray(
            `  Found ${landingPageInfo.navigationElements.length} navigation elements`
          )
        );
      } else if (step.strategy === "sidebar-analysis") {
        const navigationRoutes = await routeDiscovery.discoverNavigationRoutes(
          step.targetComponents
        );
        result.data.navigationRoutes = navigationRoutes;

        console.log(
          chalk.gray(
            `  Discovered ${navigationRoutes.length} navigation routes`
          )
        );

        // Store discovered routes for later steps
        this.discoveredRoutes = navigationRoutes;
      }

      result.status = "success";
    } catch (error) {
      console.error(chalk.red(`Route discovery failed: ${error.message}`));
      result.status = "failed";
      result.error = error.message;
    }
  }

  /**
   * Handle intelligent navigation to projects
   */
  async handleNavigateToProjects(step, result) {
    console.log(chalk.blue(`🏗️  ${step.description}`));

    try {
      // Try each selector until one works
      for (const selector of step.selectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              console.log(chalk.gray(`  Using selector: ${selector}`));

              const href = await element.getAttribute("href");
              const text = await element.textContent();

              await element.click();
              await this.page.waitForLoadState("networkidle");

              result.data.projectUrl = this.page.url();
              result.data.projectName = text?.trim();
              result.data.usedSelector = selector;

              console.log(
                chalk.green(
                  `  ✅ Navigated to project: ${result.data.projectUrl}`
                )
              );
              result.status = "success";
              return;
            }
          }
        } catch (selectorError) {
          console.log(chalk.gray(`  Selector failed: ${selector}`));
          continue;
        }
      }

      // If we get here, no selectors worked
      console.log(
        chalk.yellow(`  ⚠️  No project links found, staying on current page`)
      );
      result.status = "success"; // Not critical failure
      result.data.projectUrl = this.page.url();
    } catch (error) {
      console.error(chalk.red(`Project navigation failed: ${error.message}`));
      result.status = "failed";
      result.error = error.message;
    }
  }

  /**
   * Handle navigation to existing project for testing
   */
  async handleNavigateToProject(step, result) {
    console.log(chalk.blue(`🏗️  ${step.description}`));

    try {
      // Look for existing project links only - strictly avoid "new" project
      const projectSelectors = [
        'a[href="/projects/481877"]', // Specific known project
        'tr[data-testid*="project"] a', // Project table row links
        ".project-card a", // Project card links
        'a[href^="/projects/"][href!="/projects"][href!="/projects/new"]', // Project links but not new
      ];

      for (const selector of projectSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element && (await element.isVisible())) {
            const href = await element.getAttribute("href");

            // Skip if this is a "new" project link
            if (href && href.includes("/new")) {
              console.log(chalk.gray(`  ⚠️  Skipping new project: ${href}`));
              continue;
            }

            console.log(chalk.gray(`  🎯 Found project using: ${selector}`));

            const text = await element.textContent();

            await element.click();
            await this.page.waitForLoadState("networkidle");

            result.data.projectUrl = this.page.url();
            result.data.projectName = text?.trim();
            result.data.usedSelector = selector;

            console.log(
              chalk.green(`  ✅ Entered project: ${result.data.projectUrl}`)
            );
            result.status = "success";
            return;
          }
        } catch (selectorError) {
          continue;
        }
      }

      // Fallback: use URL pattern from settings link if available
      const settingsLink = await this.page.$(
        'a[href*="/projects/"][href*="/settings"]'
      );
      if (settingsLink) {
        const settingsHref = await settingsLink.getAttribute("href");
        const projectId = settingsHref.match(/\/projects\/(\d+)\//)?.[1];
        if (projectId) {
          const baseUrl = new URL(this.page.url()).origin;
          const projectUrl = `${baseUrl}/projects/${projectId}`;
          console.log(chalk.gray(`  🔄 Fallback: navigating to ${projectUrl}`));

          await this.page.goto(projectUrl, { waitUntil: "networkidle" });
          result.data.projectUrl = this.page.url();
          result.data.projectName = `Project ${projectId}`;
          result.status = "success";
          return;
        }
      }

      console.log(
        chalk.yellow(
          `  ⚠️  No existing projects found, staying on projects page`
        )
      );
      result.status = "success"; // Not a critical failure
      result.data.projectUrl = this.page.url();
    } catch (error) {
      console.error(chalk.red(`Project navigation failed: ${error.message}`));
      result.status = "failed";
      result.error = error.message;
    }
  }

  /**
   * Handle component-specific navigation
   */
  async handleNavigateForComponent(step, result) {
    console.log(chalk.blue(`🎯 ${step.description}`));

    try {
      const component = step.component;
      const componentName = component.name.toLowerCase();

      // Try to use discovered routes first
      if (this.discoveredRoutes) {
        for (const route of this.discoveredRoutes) {
          // Enhanced component-to-route matching
          const routeName = route.name.toLowerCase();
          const routeUrl = route.url ? route.url.toLowerCase() : "";

          // Check for direct component name match
          let isMatch = false;

          // Direct component name in route
          if (
            routeName.includes(componentName) ||
            routeUrl.includes(componentName)
          ) {
            isMatch = true;
          }

          // Smart matching for common component patterns
          // All report components go to the reports route
          if (
            (componentName.includes("report") ||
              componentName.includes("render") ||
              componentName.includes("testrun")) &&
            (routeName.includes("report") || routeUrl.includes("report"))
          ) {
            isMatch = true;
          }
          // Test-related components go to test routes
          if (
            componentName.includes("test") &&
            (routeName.includes("test") || routeUrl.includes("test"))
          ) {
            isMatch = true;
          }
          // Chart/Table components are likely part of reports
          if (
            (componentName.includes("chart") ||
              componentName.includes("table")) &&
            (routeName.includes("report") ||
              routeUrl.includes("report") ||
              routeName.includes("chart") ||
              routeUrl.includes("chart") ||
              routeName.includes("table") ||
              routeUrl.includes("table"))
          ) {
            isMatch = true;
          }

          if (
            isMatch ||
            (route.relevantComponents &&
              route.relevantComponents.some((c) =>
                c.name.toLowerCase().includes(componentName)
              ))
          ) {
            console.log(chalk.gray(`  Navigating to route: ${route.name}`));

            // Execute the navigation path for this route
            for (const navStep of route.navigationPath) {
              if (navStep.action === "click") {
                const element = await this.page.$(navStep.selector);
                if (element && (await element.isVisible())) {
                  await element.click();
                  await this.page.waitForLoadState("networkidle");
                  break; // Only need first successful navigation
                }
              }
            }

            result.data.navigatedRoute = route.name;
            result.data.routeUrl = this.page.url();
            result.status = "success";
            return;
          }
        }
      }

      // Fallback: try to find component-specific navigation
      const navPatterns = [
        `a[href*="${componentName}"]`,
        `a[href*="report"]`, // Common for report components
        `a[href*="test"]`, // Common for test components
        `[data-testid*="${componentName}"]`,
        `.${componentName}-nav`,
        `nav a:contains("${componentName}")`,
      ];

      for (const pattern of navPatterns) {
        try {
          const element = await this.page.$(pattern);
          if (element && (await element.isVisible())) {
            console.log(chalk.gray(`  Using navigation pattern: ${pattern}`));
            await element.click();
            await this.page.waitForLoadState("networkidle");

            result.data.navigatedVia = pattern;
            result.data.componentUrl = this.page.url();
            result.status = "success";
            return;
          }
        } catch (patternError) {
          continue;
        }
      }

      // If no specific navigation found, continue with current page
      console.log(
        chalk.yellow(
          `  ⚠️  No specific route found for ${component.name}, continuing on current page`
        )
      );
      result.status = "success";
      result.data.componentUrl = this.page.url();
    } catch (error) {
      console.error(chalk.red(`Component navigation failed: ${error.message}`));
      result.status = "failed";
      result.error = error.message;
    }
  }

  /**
   * Handle general interaction testing
   */
  async handleTestInteractions(step, result) {
    console.log(chalk.blue(`⚡ ${step.description}`));

    try {
      const interactions = [];

      // Test each pattern type
      for (const pattern of step.patterns || ["buttons"]) {
        switch (pattern) {
          case "buttons":
            const buttons = await this.page.$$("button:visible");
            for (const button of buttons.slice(0, 3)) {
              // Test first 3 buttons
              try {
                const text = await button.textContent();
                await button.click();
                await this.page.waitForTimeout(1000);
                interactions.push({
                  type: "button",
                  text: text?.trim(),
                  status: "success",
                });
              } catch (buttonError) {
                interactions.push({
                  type: "button",
                  status: "failed",
                  error: buttonError.message,
                });
              }
            }
            break;

          case "links":
            const links = await this.page.$$("a:visible");
            for (const link of links.slice(0, 2)) {
              // Test first 2 links
              try {
                const href = await link.getAttribute("href");
                const text = await link.textContent();
                if (
                  href &&
                  !href.startsWith("mailto:") &&
                  !href.startsWith("tel:")
                ) {
                  await link.click();
                  await this.page.waitForLoadState("networkidle");
                  interactions.push({
                    type: "link",
                    href,
                    text: text?.trim(),
                    status: "success",
                  });
                }
              } catch (linkError) {
                interactions.push({
                  type: "link",
                  status: "failed",
                  error: linkError.message,
                });
              }
            }
            break;
        }
      }

      result.data.interactions = interactions;
      result.status = "success";
      console.log(
        chalk.green(`  ✅ Tested ${interactions.length} interactions`)
      );
    } catch (error) {
      console.error(chalk.red(`Interaction testing failed: ${error.message}`));
      result.status = "failed";
      result.error = error.message;
    }
  }

  /**
   * Handle dynamic component discovery on the current page
   */
  async handleDiscoverComponent(step, result) {
    console.log(chalk.blue(`🔍 ${step.description}`));

    try {
      const component = step.component;
      const componentName = component.name.toLowerCase();

      // Special handling for reports page with multiple report types
      const currentUrl = this.page.url();
      if (currentUrl.includes("/reports")) {
        console.log(
          chalk.gray(
            "  Detected reports page - looking for specific report type"
          )
        );

        const reportTypeFound = await this.discoverAndSelectReportType(
          component,
          result
        );
        if (reportTypeFound) {
          return;
        }
      }

      // Strategy 1: Look for elements that might contain the component name
      const nameBasedSelectors = [
        `*[class*="${componentName}"]`,
        `*[id*="${componentName}"]`,
        `*[data-testid*="${componentName}"]`,
        `*[data-cy*="${componentName}"]`,
        `*[aria-label*="${componentName}"]`,
      ];

      let foundElement = null;
      let usedSelector = null;

      for (const selector of nameBasedSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element && (await element.isVisible())) {
            foundElement = element;
            usedSelector = selector;
            console.log(chalk.gray(`  Found component via: ${selector}`));
            break;
          }
        } catch (selectorError) {
          continue;
        }
      }

      // Strategy 2: Look for content-based indicators
      if (!foundElement) {
        const contentPatterns = [
          `text="${component.name}"`,
          `text=/${component.name}/i`,
          `text=/report/i`, // For report components
          `text=/test.*run/i`, // For test run components
          `text=/chart/i`, // For chart components
          `text=/table/i`, // For table components
        ];

        for (const pattern of contentPatterns) {
          try {
            const element = await this.page.$(pattern);
            if (element && (await element.isVisible())) {
              foundElement = element;
              usedSelector = pattern;
              console.log(
                chalk.gray(`  Found component via content: ${pattern}`)
              );
              break;
            }
          } catch (patternError) {
            continue;
          }
        }
      }

      // Strategy 3: Look for semantic HTML elements that might contain the component
      if (!foundElement) {
        const semanticSelectors = [
          'main[role="main"]',
          'section[aria-label*="report"]',
          'div[role="tabpanel"]',
          "article",
          ".main-content",
          ".content-area",
          "#main-content",
        ];

        for (const selector of semanticSelectors) {
          try {
            const element = await this.page.$(selector);
            if (element && (await element.isVisible())) {
              // Check if this semantic container has content related to our component
              const textContent = await element.textContent();
              if (
                textContent &&
                textContent.toLowerCase().includes(
                  componentName
                    .split(/(?=[A-Z])/)
                    .join(" ")
                    .toLowerCase()
                )
              ) {
                foundElement = element;
                usedSelector = selector;
                console.log(
                  chalk.gray(`  Found component context via: ${selector}`)
                );
                break;
              }
            }
          } catch (semanticError) {
            continue;
          }
        }
      }

      if (foundElement) {
        // Store the discovered element info for later use
        result.data.discoveredElement = {
          selector: usedSelector,
          componentName: component.name,
          tagName: await foundElement.evaluate((el) => el.tagName),
          classList: await foundElement.evaluate((el) =>
            Array.from(el.classList)
          ),
          id: await foundElement.getAttribute("id"),
          textContent: (await foundElement.textContent())
            ?.trim()
            .substring(0, 100),
        };

        console.log(
          chalk.green(`  ✅ Component discovered: ${component.name}`)
        );
        result.status = "success";
      } else {
        console.log(
          chalk.yellow(
            `  ⚠️  Component ${component.name} not found on current page`
          )
        );
        result.status = "success"; // Not critical failure
        result.data.discoveredElement = null;
      }
    } catch (error) {
      console.error(chalk.red(`Component discovery failed: ${error.message}`));
      result.status = "failed";
      result.error = error.message;
    }
  }

  /**
   * Handle dynamic interaction testing based on discovered elements
   */
  async handleTestDynamicInteractions(step, result) {
    console.log(chalk.blue(`🎯 ${step.description}`));

    try {
      const component = step.component;
      const interactions = [];

      // Find interactive elements related to the component
      const interactiveSelectors = [
        "button:visible",
        "a:visible",
        "input:visible",
        "select:visible",
        '[role="button"]:visible',
        "[tabindex]:visible",
        ".clickable:visible",
      ];

      for (const selector of interactiveSelectors) {
        try {
          const elements = await this.page.$$(selector);

          for (const element of elements.slice(0, 2)) {
            // Test first 2 of each type
            try {
              const tagName = await element.evaluate((el) => el.tagName);
              const text = await element.textContent();
              const type = await element.getAttribute("type");

              // Check if this element is contextually related to our component
              const isRelevant = this.isElementRelevantToComponent(
                text,
                component.name
              );

              if (isRelevant) {
                if (
                  tagName === "BUTTON" ||
                  (tagName === "INPUT" && type === "button")
                ) {
                  await element.click();
                  await this.page.waitForTimeout(1000);

                  interactions.push({
                    type: "button",
                    text: text?.trim(),
                    selector: selector,
                    status: "success",
                  });
                } else if (tagName === "A") {
                  const href = await element.getAttribute("href");
                  if (
                    href &&
                    !href.startsWith("mailto:") &&
                    !href.startsWith("tel:")
                  ) {
                    await element.click();
                    await this.page.waitForLoadState("networkidle");

                    interactions.push({
                      type: "link",
                      text: text?.trim(),
                      href: href,
                      selector: selector,
                      status: "success",
                    });
                  }
                }
              }
            } catch (elementError) {
              interactions.push({
                type: "unknown",
                selector: selector,
                status: "failed",
                error: elementError.message,
              });
            }
          }
        } catch (selectorError) {
          continue;
        }
      }

      result.data.dynamicInteractions = interactions;
      result.status = "success";
      console.log(
        chalk.green(
          `  ✅ Tested ${interactions.length} dynamic interactions for ${component.name}`
        )
      );
    } catch (error) {
      console.error(
        chalk.red(`Dynamic interaction testing failed: ${error.message}`)
      );
      result.status = "failed";
      result.error = error.message;
    }
  }

  /**
   * Check if an element is contextually relevant to a component
   */
  isElementRelevantToComponent(elementText, componentName) {
    if (!elementText) return false;

    const text = elementText.toLowerCase();
    const name = componentName.toLowerCase();

    // Direct match
    if (text.includes(name)) return true;

    // Component type matching
    if (
      name.includes("report") &&
      (text.includes("report") ||
        text.includes("view") ||
        text.includes("show"))
    )
      return true;
    if (
      name.includes("chart") &&
      (text.includes("chart") ||
        text.includes("graph") ||
        text.includes("visual"))
    )
      return true;
    if (
      name.includes("table") &&
      (text.includes("table") || text.includes("data") || text.includes("list"))
    )
      return true;
    if (
      name.includes("test") &&
      (text.includes("test") ||
        text.includes("run") ||
        text.includes("execute"))
    )
      return true;

    // Generic relevant actions
    const relevantActions = [
      "view",
      "show",
      "open",
      "details",
      "summary",
      "expand",
      "collapse",
    ];
    return relevantActions.some((action) => text.includes(action));
  }

  /**
   * AI-powered discovery and selection of specific report type on reports page
   */
  async discoverAndSelectReportType(component, result) {
    const componentName = component.name.toLowerCase();

    console.log(
      chalk.gray(`  🤖 Using AI to find report type matching: ${componentName}`)
    );

    try {
      // First, try AI-powered approach if Ollama is available
      const aiDecision = await this.getAINavigationDecision(component);

      if (aiDecision && aiDecision.shouldClick) {
        console.log(
          chalk.blue(`  🎯 AI recommends clicking: "${aiDecision.elementText}"`)
        );
        console.log(chalk.gray(`  💭 AI reasoning: ${aiDecision.reasoning}`));

        try {
          // Find and click the AI-recommended element
          const element = await this.findElementByAISelector(
            aiDecision.selector,
            aiDecision.elementText
          );

          if (element) {
            await element.click();
            await this.page.waitForLoadState("networkidle");
            await this.page.waitForTimeout(2000);

            result.data.reportTypeSelected = {
              text: aiDecision.elementText,
              selector: aiDecision.selector,
              componentMatched: component.name,
              url: this.page.url(),
              aiDecision: aiDecision,
              method: "AI-powered",
            };

            result.status = "success";
            console.log(
              chalk.green(
                `  ✅ AI successfully navigated to ${component.name} report type`
              )
            );
            return true;
          }
        } catch (clickError) {
          console.log(
            chalk.yellow(
              `  ⚠️  AI-recommended click failed: ${clickError.message}`
            )
          );
        }
      }

      // Fallback to pattern-based approach
      console.log(chalk.gray(`  🔄 Falling back to pattern-based approach`));
      return await this.discoverAndSelectReportTypeFallback(component, result);
    } catch (aiError) {
      console.log(chalk.yellow(`  ⚠️  AI approach failed: ${aiError.message}`));
      return await this.discoverAndSelectReportTypeFallback(component, result);
    }
  }

  /**
   * Get AI-powered navigation decision
   */
  async getAINavigationDecision(component) {
    try {
      // Get current page context
      const pageContext = await this.extractPageContext();

      // Build prompt for AI
      const prompt = this.buildNavigationPrompt(component, pageContext);

      // Query Ollama
      const response = await this.queryOllama(prompt);

      return this.parseAIResponse(response);
    } catch (error) {
      console.log(chalk.gray(`  AI decision failed: ${error.message}`));
      return null;
    }
  }

  /**
   * Extract current page context for AI analysis
   */
  async extractPageContext() {
    try {
      const context = await this.page.evaluate(() => {
        const clickableElements = [];

        // Get all clickable elements
        const buttons = Array.from(
          document.querySelectorAll("button:not([disabled])")
        );
        const links = Array.from(document.querySelectorAll("a[href]"));
        const tabs = Array.from(
          document.querySelectorAll('[role="tab"], .tab')
        );
        const cards = Array.from(
          document.querySelectorAll('[class*="card"], [class*="tile"]')
        );

        [...buttons, ...links, ...tabs, ...cards].forEach((el, index) => {
          if (el.offsetParent !== null) {
            // visible check
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              clickableElements.push({
                index,
                tag: el.tagName,
                text: el.textContent?.trim() || "",
                ariaLabel: el.getAttribute("aria-label") || "",
                href: el.getAttribute("href") || "",
                className: el.className || "",
                id: el.id || "",
                dataTestId:
                  el.getAttribute("data-testid") ||
                  el.getAttribute("data-test") ||
                  "",
                selector:
                  el.tagName +
                  (el.id ? `#${el.id}` : "") +
                  (el.className ? `.${el.className.split(" ")[0]}` : ""),
              });
            }
          }
        });

        return {
          url: window.location.href,
          title: document.title,
          headings: Array.from(document.querySelectorAll("h1, h2, h3"))
            .map((h) => h.textContent?.trim())
            .filter(Boolean),
          clickableElements: clickableElements.slice(0, 20), // Limit for AI processing
          mainContent:
            document
              .querySelector("main, .main-content, .content")
              ?.textContent?.trim()
              .substring(0, 1000) || "",
        };
      });

      return context;
    } catch (error) {
      console.log(
        chalk.gray(`  Failed to extract page context: ${error.message}`)
      );
      return { clickableElements: [], headings: [], mainContent: "" };
    }
  }

  /**
   * Build navigation prompt for AI
   */
  buildNavigationPrompt(component, pageContext) {
    const prInfo = this.prContext
      ? `
PR Changes Context:
- Title: ${this.prContext.title}
- Files Changed: ${this.prContext.changedFiles
          ?.map((f) => f.filename)
          .join(", ")}
- Key Components: ${this.prContext.components?.map((c) => c.name).join(", ")}
`
      : "";

    return `You are an intelligent web navigation assistant. I need to find and click the right element to navigate to a specific component.

${prInfo}

Current Page Context:
- URL: ${pageContext.url}
- Title: ${pageContext.title}
- Main headings: ${pageContext.headings.join(", ")}

Target Component: ${component.name}
Component Type: ${this.getComponentTypeHint(component.name)}

Available Clickable Elements:
${pageContext.clickableElements
  .map(
    (el, i) =>
      `${i + 1}. ${el.tag} - "${el.text}" (class: ${el.className}, id: ${
        el.id
      }, data-testid: ${el.dataTestId})`
  )
  .join("\n")}

Task: Analyze the available elements and determine which one is most likely to lead to the "${
      component.name
    }" component.

Respond in JSON format:
{
  "shouldClick": true/false,
  "elementIndex": number (1-based index from the list above),
  "elementText": "text of the element to click",
  "selector": "CSS selector for the element",
  "reasoning": "brief explanation of why this element was chosen",
  "confidence": 0.0-1.0
}

If no suitable element is found, set shouldClick to false.`;
  }

  /**
   * Get component type hint for better AI understanding
   */
  getComponentTypeHint(componentName) {
    const name = componentName.toLowerCase();
    if (name.includes("report")) return "Report/Dashboard component";
    if (name.includes("chart")) return "Data visualization component";
    if (name.includes("table")) return "Data table component";
    if (name.includes("test")) return "Test execution/results component";
    if (name.includes("detail")) return "Detailed view component";
    if (name.includes("summary")) return "Summary/overview component";
    return "UI component";
  }

  /**
   * Query Ollama with the navigation prompt
   */
  async queryOllama(prompt) {
    const response = await axios.post(
      `${this.ollamaUrl}/api/generate`,
      {
        model: this.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1, // Low temperature for more deterministic responses
          num_predict: 200,
        },
      },
      {
        timeout: 15000,
      }
    );

    return response.data.response;
  }

  /**
   * Parse AI response and extract decision
   */
  parseAIResponse(response) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed;
      }

      // If no JSON found, return null
      return null;
    } catch (error) {
      console.log(
        chalk.gray(`  Failed to parse AI response: ${error.message}`)
      );
      return null;
    }
  }

  /**
   * Find element using AI-recommended selector
   */
  async findElementByAISelector(selector, expectedText) {
    try {
      // First try the exact selector
      let element = await this.page.$(selector);
      if (element && (await element.isVisible())) {
        const text = await element.textContent();
        if (
          text?.includes(expectedText) ||
          expectedText.includes(text?.trim())
        ) {
          return element;
        }
      }

      // Fallback: search by text content
      const elements = await this.page.$$(
        'button, a, [role="tab"], [class*="tab"]'
      );
      for (const el of elements) {
        const text = await el.textContent();
        if (text?.trim().toLowerCase().includes(expectedText.toLowerCase())) {
          return el;
        }
      }

      return null;
    } catch (error) {
      console.log(chalk.gray(`  Element finding failed: ${error.message}`));
      return null;
    }
  }

  /**
   * Fallback pattern-based approach (original logic)
   */
  async discoverAndSelectReportTypeFallback(component, result) {
    const componentName = component.name.toLowerCase();

    // Simplified pattern matching as fallback
    const reportTypeSelectors = [
      '[role="tab"]',
      ".tab",
      ".nav-tabs a",
      'button, a, [role="button"]',
    ];

    for (const selector of reportTypeSelectors) {
      try {
        const elements = await this.page.$$(selector);

        for (const element of elements) {
          const isVisible = await element.isVisible();
          if (!isVisible) continue;

          const text = await element.textContent();
          const elementText = (text || "").toLowerCase();

          // Simple matching logic
          if (
            elementText.includes(componentName) ||
            (componentName.includes("detailed") &&
              elementText.includes("detail")) ||
            (componentName.includes("chart") &&
              elementText.includes("chart")) ||
            (componentName.includes("table") &&
              elementText.includes("table")) ||
            (componentName.includes("summary") &&
              elementText.includes("summary"))
          ) {
            console.log(
              chalk.green(`  ✅ Pattern match found: "${text?.trim()}"`)
            );

            await element.click();
            await this.page.waitForLoadState("networkidle");
            await this.page.waitForTimeout(2000);

            result.data.reportTypeSelected = {
              text: text?.trim(),
              selector: selector,
              componentMatched: component.name,
              url: this.page.url(),
              method: "pattern-based",
            };

            result.status = "success";
            return true;
          }
        }
      } catch (error) {
        continue;
      }
    }

    console.log(
      chalk.yellow(`  ⚠️  No matching report type found for ${component.name}`)
    );
    return false;
  }

  /**
   * Cleanup browser resources
   */
  async cleanup() {
    try {
      // Clean up CDP session
      if (this.cdpSession) {
        try {
          await this.cdpSession.detach();
          console.log(chalk.gray("   ✅ CDP session cleaned up"));
        } catch (error) {
          console.log(
            chalk.yellow(`CDP session cleanup warning: ${error.message}`)
          );
        }
        this.cdpSession = null;
      }

      // Clean up performance utils
      if (this.performanceUtils) {
        try {
          await this.performanceUtils.cleanup();
        } catch (error) {
          console.log(
            chalk.yellow(`Performance utils cleanup warning: ${error.message}`)
          );
        }
      }

      if (this.page) {
        await this.page.close();
      }
      if (this.context) {
        await this.context.close();
      }
      if (this.browser) {
        await this.browser.close();
      }

      // Clear monitoring data
      this.networkRequests = [];
      this.consoleMessages = [];
      this.performanceEntries = [];

      console.log(chalk.gray("   ✅ Browser cleanup completed"));
    } catch (error) {
      console.error(chalk.red("Cleanup failed:", error.message));
    }
  }

  /**
   * Handle AI-powered navigation step
   */
  async handleAINavigate(step, result) {
    console.log(chalk.blue(`🤖 ${step.description}`));

    try {
      const currentContext = await this.extractPageContext();
      this.aiContextManager.addPageContext(this.page.url(), currentContext);

      const component = step.component || step.target;
      if (!component) {
        throw new Error("AI navigation requires target component");
      }

      // Get AI navigation decision
      const aiContext = this.aiContextManager.getContextForAI({
        component,
        currentUrl: this.page.url(),
        includeHistory: true,
      });

      const prompt = this.ollamaClient.buildNavigationPrompt(
        component,
        currentContext,
        aiContext.prContext,
        aiContext.navigationHistory
      );

      const aiResponse = await this.ollamaClient.query(prompt);

      if (aiResponse.success && aiResponse.data.shouldClick) {
        const decision = aiResponse.data;

        // Record AI decision
        this.aiContextManager.addAIDecision({
          component: component.name,
          decision: decision,
          action: "ai-navigation",
          confidence: decision.confidence,
        });

        // Execute navigation
        const element = await this.findElementByAISelector(
          decision.selector,
          decision.elementText
        );

        if (element) {
          const beforeUrl = this.page.url();
          await element.click();
          await this.page.waitForLoadState("networkidle");
          const afterUrl = this.page.url();

          // Record navigation step
          this.aiContextManager.addNavigationStep({
            action: "ai-navigate",
            component: component.name,
            elementText: decision.elementText,
            selector: decision.selector,
            beforeUrl,
            afterUrl,
            result: afterUrl !== beforeUrl ? "success" : "no-change",
            confidence: decision.confidence,
            reasoning: decision.reasoning,
          });

          result.data.aiDecision = decision;
          result.data.navigationSuccess = afterUrl !== beforeUrl;
          result.data.newUrl = afterUrl;

          console.log(chalk.green(`  ✅ AI navigation successful`));
          result.status = "success";
        } else {
          throw new Error(
            `Could not find element for AI decision: ${decision.elementText}`
          );
        }
      } else {
        console.log(
          chalk.yellow(
            `  ⚠️  AI decided not to navigate: ${
              aiResponse.data?.reasoning || "No reasoning provided"
            }`
          )
        );
        result.status = "skipped";
        result.data.aiDecision = aiResponse.data;
      }
    } catch (error) {
      console.error(chalk.red(`AI navigation failed: ${error.message}`));
      result.status = "failed";
      result.error = error.message;
    }
  }

  /**
   * Handle AI-powered component discovery step
   */
  async handleAIDiscover(step, result) {
    console.log(chalk.blue(`🔍 ${step.description}`));

    try {
      const component = step.component || step.target;
      if (!component) {
        throw new Error("AI discovery requires target component");
      }

      const currentContext = await this.extractPageContext();
      this.aiContextManager.addPageContext(this.page.url(), currentContext);

      // Use AI to analyze current page and find component
      const discoveryPrompt = `Analyze this page and determine if the "${
        component.name
      }" component is present and how to interact with it.

Current Page:
- URL: ${this.page.url()}
- Title: ${currentContext.title}
- Available Elements: ${currentContext.clickableElements
        .slice(0, 10)
        .map((el) => `${el.tag} - "${el.text}"`)
        .join(", ")}

Component to Find: ${component.name}
Component Type: ${this.ollamaClient.getComponentTypeHint(component.name)}

Respond in JSON format:
{
  "found": true/false,
  "elements": [
    {"selector": "CSS selector", "text": "element text", "confidence": 0.8, "reasoning": "why this matches"}
  ],
  "interactions": [
    {"action": "click|hover|type", "selector": "CSS selector", "description": "what this interaction does"}
  ],
  "confidence": 0.0-1.0,
  "reasoning": "explanation of findings"
}`;

      const aiResponse = await this.ollamaClient.query(discoveryPrompt);

      if (aiResponse.success && aiResponse.data.found) {
        const discovery = aiResponse.data;

        result.data.aiDiscovery = discovery;
        result.data.foundElements = discovery.elements;
        result.data.suggestedInteractions = discovery.interactions;

        // Record successful discovery
        this.aiContextManager.addInteractionPattern({
          type: "component-discovery",
          component: component.name,
          success: true,
          elements: discovery.elements.length,
          confidence: discovery.confidence,
          interactionType: "ai-discovery",
        });

        console.log(
          chalk.green(
            `  ✅ AI discovered ${component.name}: ${discovery.elements.length} relevant elements`
          )
        );
        result.status = "success";
      } else {
        console.log(
          chalk.yellow(
            `  ⚠️  AI could not find ${component.name}: ${
              aiResponse.data?.reasoning || "No reasoning"
            }`
          )
        );
        result.status = "success"; // Not a failure, just not found
        result.data.aiDiscovery = aiResponse.data;
      }
    } catch (error) {
      console.error(chalk.red(`AI discovery failed: ${error.message}`));
      result.status = "failed";
      result.error = error.message;
    }
  }

  /**
   * Handle AI-powered interaction testing step
   */
  async handleAITest(step, result) {
    console.log(chalk.blue(`⚡ ${step.description}`));

    try {
      const component = step.component || step.target;
      const currentContext = await this.extractPageContext();

      // Generate AI-powered test interactions
      const testSteps = await this.aiStepGenerator.generateSteps({
        currentUrl: this.page.url(),
        targetComponent: component,
        pageContext: currentContext,
        stepType: "interaction-testing",
        maxSteps: 3,
      });

      const interactions = [];

      // Execute AI-generated test steps
      for (const testStep of testSteps) {
        try {
          const stepResult = await this.executeAITestStep(testStep);
          interactions.push({
            step: testStep.description,
            action: testStep.action,
            status: stepResult.success ? "success" : "failed",
            result: stepResult.result,
            confidence: testStep.metadata?.aiConfidence || 0.5,
          });
        } catch (stepError) {
          interactions.push({
            step: testStep.description,
            action: testStep.action,
            status: "failed",
            error: stepError.message,
          });
        }
      }

      result.data.aiInteractions = interactions;
      result.data.totalTests = interactions.length;
      result.data.successfulTests = interactions.filter(
        (i) => i.status === "success"
      ).length;

      // Record testing pattern
      this.aiContextManager.addInteractionPattern({
        type: "ai-testing",
        component: component?.name || "page",
        success: true,
        testsExecuted: interactions.length,
        successRate: result.data.successfulTests / result.data.totalTests,
        interactionType: "ai-test",
      });

      console.log(
        chalk.green(
          `  ✅ AI testing completed: ${result.data.successfulTests}/${result.data.totalTests} successful`
        )
      );
      result.status = "success";
    } catch (error) {
      console.error(chalk.red(`AI testing failed: ${error.message}`));
      result.status = "failed";
      result.error = error.message;
    }
  }

  /**
   * Handle AI-powered route discovery step
   */
  async handleAIRouteDiscovery(step, result) {
    console.log(chalk.blue(`🗺️ ${step.description}`));

    try {
      const targetComponents = step.targetComponents || [];
      const baseUrl = step.baseUrl || this.page.url();

      // Use AI route discovery service
      const discoveryResults = await this.aiRouteDiscovery.discoverRoutes(
        baseUrl,
        targetComponents
      );

      result.data.discoveryResults = discoveryResults;
      result.data.routesFound = discoveryResults.routes.length;
      result.data.aiInsights = discoveryResults.aiInsights;
      result.data.navigationPath = discoveryResults.navigationPath;

      // Store discovered routes in context
      for (const route of discoveryResults.routes) {
        this.aiContextManager.addDiscoveredRoute({
          name: route.route?.name || `Route-${route.component}`,
          url: route.route?.url || this.page.url(),
          navigationPath: route.navigationPath,
          relevantComponents: [
            { name: route.component, confidence: route.confidence },
          ],
          discoveryMethod: route.discoveryMethod,
        });
      }

      console.log(
        chalk.green(
          `  ✅ AI route discovery completed: ${discoveryResults.routes.length} routes found`
        )
      );

      // Generate additional exploration steps based on discovered routes
      if (discoveryResults.routes.length > 0) {
        await this.generateDynamicExplorationSteps(discoveryResults.routes);
      }

      result.status = discoveryResults.success ? "success" : "failed";
    } catch (error) {
      console.error(chalk.red(`AI route discovery failed: ${error.message}`));
      result.status = "failed";
      result.error = error.message;
    }
  }

  /**
   * Handle AI step generation
   */
  async handleAIGenerateSteps(step, result) {
    console.log(chalk.blue(`🧠 ${step.description}`));

    try {
      const component = step.component || step.target;
      const currentContext = await this.extractPageContext();

      const generatedSteps = await this.aiStepGenerator.generateSteps({
        currentUrl: this.page.url(),
        targetComponent: component,
        pageContext: currentContext,
        navigationHistory: this.aiContextManager.navigationHistory,
        stepType: step.stepType || "exploration",
        maxSteps: step.maxSteps || 5,
      });

      result.data.generatedSteps = generatedSteps;
      result.data.stepsCount = generatedSteps.length;
      result.data.aiGenerated = true;

      console.log(
        chalk.green(
          `  ✅ AI generated ${generatedSteps.length} intelligent steps`
        )
      );
      result.status = "success";

      // Optionally execute generated steps immediately
      if (step.executeImmediately) {
        console.log(
          chalk.blue(`  🚀 Executing AI-generated steps immediately...`)
        );
        const executionResults = [];

        for (const genStep of generatedSteps) {
          try {
            const stepResult = await this.executeStep(
              genStep,
              `ai-gen-${genStep.id}`
            );
            executionResults.push(stepResult);
          } catch (execError) {
            executionResults.push({
              stepId: genStep.id,
              status: "failed",
              error: execError.message,
            });
          }
        }

        result.data.executionResults = executionResults;
        result.data.executedSteps = executionResults.length;
      }
    } catch (error) {
      console.error(chalk.red(`AI step generation failed: ${error.message}`));
      result.status = "failed";
      result.error = error.message;
    }
  }

  /**
   * Execute a single AI-generated test step
   * @param {object} testStep - AI-generated test step
   * @returns {Promise<object>} - Execution result
   */
  async executeAITestStep(testStep) {
    try {
      switch (testStep.action) {
        case "click":
          if (testStep.selector) {
            const element = await this.page.$(testStep.selector);
            if (element && (await element.isVisible())) {
              await element.click();
              await this.page.waitForTimeout(1000);
              return { success: true, result: "Element clicked successfully" };
            }
          }
          return {
            success: false,
            result: "Element not found or not clickable",
          };

        case "type":
          if (testStep.selector && testStep.value) {
            const element = await this.page.$(testStep.selector);
            if (element && (await element.isVisible())) {
              await element.clear();
              await element.type(testStep.value);
              return { success: true, result: `Typed: ${testStep.value}` };
            }
          }
          return { success: false, result: "Input element not found" };

        case "hover":
          if (testStep.selector) {
            const element = await this.page.$(testStep.selector);
            if (element && (await element.isVisible())) {
              await element.hover();
              await this.page.waitForTimeout(500);
              return { success: true, result: "Element hovered successfully" };
            }
          }
          return { success: false, result: "Element not found for hover" };

        case "wait":
          if (testStep.selector) {
            await this.page.waitForSelector(testStep.selector, {
              timeout: testStep.timeout || 5000,
            });
            return { success: true, result: "Element appeared as expected" };
          }
          await this.page.waitForTimeout(testStep.timeout || 1000);
          return { success: true, result: "Wait completed" };

        default:
          return {
            success: false,
            result: `Unknown action: ${testStep.action}`,
          };
      }
    } catch (error) {
      return { success: false, result: error.message };
    }
  }

  /**
   * Extract enhanced page context for AI analysis
   * @returns {Promise<object>} - Enhanced page context
   */
  async extractPageContext() {
    try {
      const context = await this.page.evaluate(() => {
        const clickableElements = [];

        // Enhanced element selection for AI analysis
        const selectors = [
          "button:not([disabled])",
          "a[href]",
          'input[type="button"], input[type="submit"]',
          '[role="tab"]',
          '[role="button"]',
          "[data-testid]",
          "[data-test]",
          "[data-cy]",
          ".nav-link",
          ".navigation-item",
          '[class*="nav"]',
          '[class*="menu"]',
          '[class*="button"]',
          '[class*="link"]',
        ];

        selectors.forEach((selector) => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach((el) => {
              if (el.offsetParent !== null) {
                // visible check
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  clickableElements.push({
                    index: clickableElements.length,
                    tag: el.tagName,
                    text: el.textContent?.trim() || "",
                    ariaLabel: el.getAttribute("aria-label") || "",
                    href: el.getAttribute("href") || "",
                    className: el.className || "",
                    id: el.id || "",
                    dataTestId:
                      el.getAttribute("data-testid") ||
                      el.getAttribute("data-test") ||
                      el.getAttribute("data-cy") ||
                      "",
                    selector: selector,
                    position: {
                      x: rect.left,
                      y: rect.top,
                      width: rect.width,
                      height: rect.height,
                    },
                  });
                }
              }
            });
          } catch (selectorError) {
            // Continue with other selectors if one fails
          }
        });

        return {
          url: window.location.href,
          title: document.title,
          headings: Array.from(
            document.querySelectorAll("h1, h2, h3, h4, h5, h6")
          )
            .map((h) => ({
              level: h.tagName.toLowerCase(),
              text: h.textContent?.trim(),
            }))
            .filter((h) => h.text),
          clickableElements: clickableElements.slice(0, 30), // Increased limit for AI
          mainContent: {
            text: (
              document.querySelector(
                "main, .main-content, .content, #main, [role='main']"
              )?.textContent || ""
            )
              .trim()
              .substring(0, 1500),
            hasForm: !!document.querySelector("form"),
            hasTable: !!document.querySelector("table"),
            hasChart: !!document.querySelector(
              "[class*='chart'], [id*='chart'], canvas"
            ),
            hasModal: !!document.querySelector(
              "[class*='modal'], [role='dialog']"
            ),
          },
          navigation: {
            hasProject: !!document.querySelector(
              '[href*="project"], [data-testid*="project"]'
            ),
            hasSidebar: !!document.querySelector(
              'nav, .sidebar, [role="navigation"], [data-test="side-bar-navigation-primary"]'
            ),
            breadcrumbs: Array.from(
              document.querySelectorAll(
                '.breadcrumb a, [aria-label*="breadcrumb"] a'
              )
            )
              .map((a) => a.textContent?.trim())
              .filter(Boolean),
            primaryNav: Array.from(
              document.querySelectorAll(
                '[data-test="side-bar-navigation-primary"] a, nav > a, .nav-primary a'
              )
            )
              .map((a) => ({
                text: a.textContent?.trim(),
                href: a.href,
                dataTest: a.getAttribute("data-test") || "",
              }))
              .slice(0, 10),
          },
          forms: Array.from(document.querySelectorAll("form")).map((form) => ({
            action: form.action,
            method: form.method,
            inputs: Array.from(form.querySelectorAll("input, select, textarea"))
              .length,
          })),
          errors: Array.from(
            document.querySelectorAll('.error, .alert-danger, [class*="error"]')
          )
            .map((el) => el.textContent?.trim())
            .filter(Boolean),
          performance: {
            loadTime: performance.now(),
            readyState: document.readyState,
          },
        };
      });

      return context;
    } catch (error) {
      console.log(
        chalk.gray(
          `  Failed to extract enhanced page context: ${error.message}`
        )
      );
      return {
        clickableElements: [],
        headings: [],
        mainContent: { text: "" },
        navigation: {},
        url: this.page.url(),
        title: "",
      };
    }
  }

  /**
   * Generate dynamic exploration steps based on AI-discovered routes
   */
  async generateDynamicExplorationSteps(discoveredRoutes) {
    console.log(
      chalk.cyan(
        `🔄 Generating dynamic exploration steps for ${discoveredRoutes.length} routes...`
      )
    );

    for (const route of discoveredRoutes.slice(0, 3)) {
      // Limit to 3 routes to avoid too many steps
      const component = route.component || "Unknown";

      // Generate AI-powered navigation and testing steps for each route
      const dynamicSteps = [
        {
          id: `dynamic-nav-${Date.now()}`,
          type: "ai-navigation",
          action: "ai-navigate",
          description: `AI navigate to ${component} route`,
          timeout: 20000,
          component: { name: component },
          target: { name: component },
          artifacts: ["screenshot", "performance"],
        },
        {
          id: `dynamic-discover-${Date.now() + 1}`,
          type: "ai-component-discovery",
          action: "ai-discover",
          description: `AI discover and analyze ${component}`,
          timeout: 15000,
          component: { name: component },
          target: { name: component },
          artifacts: ["screenshot", "dom"],
        },
        {
          id: `dynamic-test-${Date.now() + 2}`,
          type: "ai-interaction-testing",
          action: "ai-test",
          description: `AI test interactions for ${component}`,
          timeout: 20000,
          component: { name: component },
          target: { name: component },
          artifacts: ["screenshot", "console", "performance"],
        },
      ];

      // Add these steps to the current plan for execution
      if (this.currentPlan && this.currentPlan.steps) {
        this.currentPlan.steps.push(...dynamicSteps);
        console.log(
          chalk.gray(`  ➕ Added ${dynamicSteps.length} steps for ${component}`)
        );
      }
    }
  }

  /**
   * Setup CDP session for enhanced monitoring
   */
  async setupCDPSession() {
    try {
      // Try different CDP session creation methods based on Playwright version
      let cdpSession = null;
      
      // Method 1: Browser-level CDP session
      try {
        const browser = this.page.context().browser();
        if (browser && typeof browser.newBrowserCDPSession === 'function') {
          cdpSession = await browser.newBrowserCDPSession();
        }
      } catch (e) {
        // Ignore and try next method
      }
      
      // Method 2: Page-level CDP session  
      if (!cdpSession) {
        try {
          if (typeof this.page.createCDPSession === 'function') {
            cdpSession = await this.page.createCDPSession();
          }
        } catch (e) {
          // Ignore and try next method
        }
      }
      
      // Method 3: Context-level CDP session
      if (!cdpSession) {
        try {
          if (typeof this.context.newCDPSession === 'function') {
            cdpSession = await this.context.newCDPSession(this.page);
          }
        } catch (e) {
          // Ignore - CDP not available
        }
      }

      this.cdpSession = cdpSession;

      // Setup CDP session in PerformanceUtils if available
      if (this.cdpSession && this.performanceUtils.setupCDPSession) {
        await this.performanceUtils.setupCDPSession(this.cdpSession);
        console.log(
          chalk.gray("   ✅ CDP session established for enhanced monitoring")
        );
      } else {
        console.log(
          chalk.gray("   📝 CDP session not available - using Playwright APIs for monitoring")
        );
      }
    } catch (error) {
      console.log(
        chalk.yellow(`Could not setup CDP session: ${error.message}`)
      );
      this.cdpSession = null;
    }
  }

  /**
   * Setup enhanced monitoring for console, network, and performance
   */
  async setupEnhancedMonitoring() {
    // Enhanced console monitoring
    this.page.on("console", (msg) => {
      const consoleEntry = {
        type: "console",
        level: msg.type(),
        text: msg.text(),
        args: msg.args().map((arg) => arg.toString()),
        location: msg.location(),
        timestamp: Date.now(),
      };

      this.consoleMessages.push(consoleEntry);
      this.executionLog.push(consoleEntry);
    });

    // Enhanced request monitoring
    this.page.on("request", (request) => {
      const requestEntry = {
        type: "request",
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        postData: request.postData(),
        resourceType: request.resourceType(),
        timestamp: Date.now(),
      };

      this.networkRequests.push(requestEntry);
      this.executionLog.push({
        type: "request",
        url: request.url(),
        method: request.method(),
        timestamp: Date.now(),
      });
    });

    // Enhanced response monitoring
    this.page.on("response", (response) => {
      const responseEntry = {
        type: "response",
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers(),
        size: response.headers()["content-length"] || 0,
        timing: response.request().timing(),
        timestamp: Date.now(),
      };

      // Update corresponding request with response data
      const requestIndex = this.networkRequests.findIndex(
        (req) => req.url === response.url() && req.type === "request"
      );

      if (requestIndex !== -1) {
        this.networkRequests[requestIndex].response = responseEntry;
      } else {
        this.networkRequests.push(responseEntry);
      }

      this.executionLog.push({
        type: "response",
        url: response.url(),
        status: response.status(),
        timestamp: Date.now(),
      });
    });

    // Performance entry monitoring
    this.page.on("console", async (msg) => {
      if (msg.type() === "log" && msg.text().includes("performance-entry")) {
        try {
          const perfData = JSON.parse(
            msg.text().replace("performance-entry:", "")
          );
          this.performanceEntries.push({
            ...perfData,
            timestamp: Date.now(),
          });
        } catch (error) {
          // Ignore parsing errors for non-performance console messages
        }
      }
    });

    console.log(chalk.gray("   ✅ Enhanced monitoring setup completed"));
  }

  /**
   * Get comprehensive execution data for detectors
   */
  getExecutionData() {
    return {
      page: this.page,
      cdpSession: this.cdpSession,
      networkRequests: this.networkRequests,
      consoleMessages: this.consoleMessages,
      performanceEntries: this.performanceEntries,
      executionLog: this.executionLog,
      artifacts: this.artifacts,
      performanceUtils: this.performanceUtils,
      visualUtils: this.visualUtils,
    };
  }

  /**
   * Sleep utility
   */
  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
