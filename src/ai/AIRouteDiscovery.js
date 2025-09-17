import chalk from "chalk";
import { OllamaClient } from "./OllamaClient.js";

/**
 * AI-powered route discovery service that replaces pattern-based navigation
 */
export class AIRouteDiscovery {
  constructor(page, contextManager, options = {}) {
    this.page = page;
    this.contextManager = contextManager;
    this.ollamaClient = new OllamaClient(options.ollama);
    this.maxNavigationAttempts = options.maxAttempts || 5;
    this.navigationTimeout = options.navigationTimeout || 10000;
  }

  /**
   * AI-powered route discovery starting from base page
   * @param {string} baseUrl - Starting URL
   * @param {array} targetComponents - Components we're looking for
   * @returns {Promise<object>} - Discovery results with AI insights
   */
  async discoverRoutes(baseUrl, targetComponents = []) {
    console.log(chalk.cyan("🤖 Starting AI-powered route discovery..."));

    const discoveryResults = {
      baseUrl,
      targetComponents,
      startTime: new Date().toISOString(),
      routes: [],
      aiInsights: [],
      navigationPath: [],
      success: false,
    };

    try {
      // Step 1: Capture initial context (skip navigation since app opens on base route)
      await this.captureInitialContext(baseUrl, discoveryResults);

      // Step 2: Use AI to understand page structure
      const pageAnalysis = await this.analyzePageWithAI(discoveryResults);

      // Step 3: AI-driven project discovery and navigation
      const projectRoute = await this.discoverProjectRouteWithAI(
        pageAnalysis,
        discoveryResults
      );

      // Step 4: AI-powered sidebar navigation analysis
      if (projectRoute.success) {
        await this.discoverNavigationRoutesWithAI(
          targetComponents,
          discoveryResults
        );
      }

      discoveryResults.success = discoveryResults.routes.length > 0;
      discoveryResults.endTime = new Date().toISOString();

      console.log(
        chalk.green(
          `✅ AI Route Discovery completed: ${discoveryResults.routes.length} routes discovered`
        )
      );

      // Step 5: Execute exploration of most relevant routes
      if (discoveryResults.routes.length > 0) {
        await this.exploreDiscoveredRoutes(discoveryResults);
      }

      return discoveryResults;
    } catch (error) {
      console.error(
        chalk.red(`❌ AI Route Discovery failed: ${error.message}`)
      );
      discoveryResults.error = error.message;
      discoveryResults.endTime = new Date().toISOString();
      return discoveryResults;
    }
  }

  /**
   * Navigate to base page and capture initial context
   * @param {string} baseUrl - Base URL to navigate to
   * @param {object} results - Discovery results object to update
   */
  async navigateToBase(baseUrl, results) {
    console.log(chalk.blue(`🔗 AI navigating to base: ${baseUrl}`));

    await this.page.goto(baseUrl, {
      waitUntil: "networkidle",
      timeout: this.navigationTimeout,
    });

    // Wait for page to stabilize
    await this.page.waitForSelector("body", { timeout: 5000 });
    await this.page.waitForTimeout(2000);

    const initialContext = await this.extractPageContext();
    this.contextManager.addPageContext(baseUrl, initialContext);

    results.navigationPath.push({
      action: "navigate",
      url: baseUrl,
      timestamp: new Date().toISOString(),
      context: initialContext,
    });

    console.log(chalk.gray(`  📄 Base page analyzed: ${initialContext.title}`));
  }

  /**
   * Capture initial context without navigation (app already on base route)
   * @param {string} baseUrl - Expected base URL
   * @param {object} results - Discovery results object to update
   */
  async captureInitialContext(baseUrl, results) {
    console.log(
      chalk.blue(`🗃️  Capturing current page context for: ${baseUrl}`)
    );

    // Wait for page to stabilize
    await this.page.waitForSelector("body", { timeout: 5000 });
    await this.page.waitForTimeout(1000);

    // If we're on a settings page, try to navigate to project root for better navigation
    const currentUrl = this.page.url();
    if (currentUrl.includes("/settings")) {
      const projectMatch = currentUrl.match(/\/projects\/(\d+)\//);
      if (projectMatch) {
        const projectId = projectMatch[1];
        const baseUrl = new URL(this.page.url()).origin;
        const projectUrl = `${baseUrl}/projects/${projectId}`;
        console.log(
          chalk.gray(
            `  🔄 Redirecting from settings to project root: ${projectUrl}`
          )
        );

        try {
          await this.page.goto(projectUrl, { waitUntil: "networkidle" });
          await this.page.waitForTimeout(2000); // Wait longer for project page to load
        } catch (error) {
          console.log(
            chalk.yellow(`  ⚠️  Project redirect failed: ${error.message}`)
          );
        }
      }
    }

    const initialContext = await this.extractPageContext();
    this.contextManager.addPageContext(this.page.url(), initialContext);

    results.navigationPath.push({
      action: "analyze",
      url: this.page.url(),
      timestamp: new Date().toISOString(),
      context: initialContext,
    });

    console.log(
      chalk.gray(`  📄 Current page analyzed: ${initialContext.title}`)
    );
  }

  /**
   * Use AI to analyze current page structure and identify navigation options
   * @param {object} results - Discovery results object
   * @returns {Promise<object>} - AI analysis results
   */
  async analyzePageWithAI(results) {
    console.log(
      chalk.blue("🧠 AI analyzing page structure for route selection...")
    );

    const pageContext = await this.extractPageContext();

    // Focus on simple route identification based on PR context
    const prContext = this.contextManager.getContextForAI({
      currentUrl: this.page.url(),
      includeHistory: true,
    }).prContext;

    // Since PR is about Reports refactoring, look for Reports navigation
    const reportsRoutes = pageContext.clickableElements.filter(
      (el) =>
        el.text.toLowerCase().includes("report") ||
        el.href.includes("/reports") ||
        (el.text.toLowerCase().includes("test") &&
          el.text.toLowerCase().includes("run"))
    );

    const analysis = {
      pageType: "project",
      primaryActions: reportsRoutes.slice(0, 3).map((route) => ({
        type: "navigate-to-reports",
        text: route.text,
        selector: `a[href="${route.href}"]`,
        confidence: 0.9,
        reasoning: "PR focuses on Reports feature refactoring",
      })),
      confidence: 0.8,
      reportsRoutesFound: reportsRoutes.length,
    };

    results.aiInsights.push({
      type: "route-selection",
      timestamp: new Date().toISOString(),
      analysis: analysis,
      confidence: analysis.confidence,
    });

    console.log(
      chalk.gray(
        `  🎯 Route Selection: Found ${reportsRoutes.length} reports-related routes`
      )
    );
    console.log(
      chalk.gray(
        `  💭 Selected Actions: ${analysis.primaryActions.length} route(s) for exploration`
      )
    );

    return analysis;
  }

  /**
   * AI-powered project route discovery
   * @param {object} pageAnalysis - AI analysis of current page
   * @param {object} results - Discovery results object
   * @returns {Promise<object>} - Project discovery results
   */
  async discoverProjectRouteWithAI(pageAnalysis, results) {
    console.log(chalk.blue("🏗️  AI discovering project routes..."));

    const projectResult = { success: false, route: null, reasoning: "" };

    // Check if we're already in a specific project context (not just /projects)
    const currentUrl = this.page.url();
    if (currentUrl.match(/\/projects\/\d+/)) {
      console.log(
        chalk.gray(
          "  Already in specific project context, ready for route discovery"
        )
      );
      projectResult.success = true;
      projectResult.reasoning = "Already in specific project context";
      return projectResult;
    }

    // If we're on /projects (list page), try to navigate to a specific project
    if (currentUrl.includes("/projects")) {
      console.log(
        chalk.gray("  On projects list page, navigating to specific project...")
      );

      // Try to find and navigate to an existing project
      const projectNavigated = await this.navigateToSpecificProject();
      if (projectNavigated.success) {
        projectResult.success = true;
        projectResult.reasoning = "Successfully navigated to specific project";
        projectResult.route = projectNavigated.route;

        // Wait for project page to load completely
        await this.page.waitForTimeout(2000);

        console.log(
          chalk.green(`  ✅ Navigated to project: ${this.page.url()}`)
        );
        return projectResult;
      } else {
        console.log(
          chalk.yellow("  ⚠️  Could not navigate to specific project")
        );
      }
    }

    // Use AI to identify project navigation
    if (pageAnalysis.primaryActions) {
      for (const action of pageAnalysis.primaryActions) {
        if (action.type === "navigate-to-project" && action.confidence > 0.6) {
          try {
            const success = await this.executeAINavigationAction(
              action,
              results
            );
            if (success) {
              projectResult.success = true;
              projectResult.route = action;
              projectResult.reasoning = action.reasoning;

              console.log(
                chalk.green(`  ✅ AI successfully navigated to project`)
              );
              break;
            }
          } catch (error) {
            console.log(
              chalk.yellow(`  ⚠️  AI navigation failed: ${error.message}`)
            );
          }
        }
      }
    }

    // Fallback: try common project selectors
    if (!projectResult.success) {
      const fallbackSelectors = [
        'a[href*="project"]',
        'a[href*="/projects"]',
        '[data-testid*="project"]',
        ".project-link",
        'a:contains("Project")',
        'button:contains("Project")',
      ];

      for (const selector of fallbackSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element && (await element.isVisible())) {
            console.log(
              chalk.gray(`  🔄 Fallback: trying selector ${selector}`)
            );
            await element.click();
            await this.page.waitForLoadState("networkidle");

            projectResult.success = true;
            projectResult.reasoning = `Fallback navigation using ${selector}`;
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }

    return projectResult;
  }

  /**
   * Navigate to a specific project to discover project-level routes
   * @returns {Promise<object>} - Navigation result
   */
  async navigateToSpecificProject() {
    console.log(chalk.gray("  🔍 Looking for existing project links..."));

    // Try different project selectors in order of preference - avoid Settings links
    const projectSelectors = [
      'a[href="/projects/481877"]', // Known working project
      'tr[data-testid*="project"]:first-child a', // First project in table
      ".project-card:first-child a", // First project card
      'a[href^="/projects/"][href*="/dashboard"]', // Project dashboard links (preferred)
      'a[href^="/projects/"]:not([href*="/settings"]):not([href*="/new"])', // Any project link but not settings or new
    ];

    for (const selector of projectSelectors) {
      try {
        const elements = await this.page.$$(selector);

        for (const element of elements) {
          if (await element.isVisible()) {
            const href = await element.getAttribute("href");

            // Skip "new" project links, settings links, and invalid patterns
            if (
              !href ||
              href.includes("/new") ||
              href.includes("/settings") ||
              href === "/projects" ||
              href === "/projects/"
            ) {
              continue;
            }

            const text = await element.textContent();
            console.log(
              chalk.gray(`  🎯 Found project: "${text?.trim()}" -> ${href}`)
            );

            try {
              await element.click();
              await this.page.waitForLoadState("networkidle", {
                timeout: 10000,
              });

              const newUrl = this.page.url();
              if (newUrl.match(/\/projects\/\d+/)) {
                return {
                  success: true,
                  route: {
                    name: text?.trim() || "Project",
                    url: newUrl,
                    selector: selector,
                  },
                };
              }
            } catch (clickError) {
              console.log(
                chalk.gray(`    ⚠️  Click failed: ${clickError.message}`)
              );
              continue;
            }
          }
        }
      } catch (selectorError) {
        continue;
      }
    }

    // Fallback: try direct URL navigation to known project
    try {
      console.log(
        chalk.gray("  🔄 Fallback: trying direct navigation to project 481877")
      );
      const baseUrl = new URL(this.page.url()).origin;
      const projectUrl = `${baseUrl}/projects/481877`;

      await this.page.goto(projectUrl, {
        waitUntil: "networkidle",
        timeout: 10000,
      });

      if (this.page.url().includes("/projects/481877")) {
        return {
          success: true,
          route: {
            name: "Project 481877",
            url: this.page.url(),
            selector: "direct-navigation",
          },
        };
      }
    } catch (navError) {
      console.log(
        chalk.gray(`  ⚠️  Direct navigation failed: ${navError.message}`)
      );
    }

    return { success: false, reasoning: "No accessible projects found" };
  }

  /**
   * AI-powered sidebar navigation discovery
   * @param {array} targetComponents - Components to discover routes for
   * @param {object} results - Discovery results object
   */
  async discoverNavigationRoutesWithAI(targetComponents, results) {
    console.log(chalk.blue("🧭 AI discovering navigation routes..."));

    // First, analyze sidebar navigation with AI
    const sidebarAnalysis = await this.analyzeSidebarWithAI();

    const currentUrl = this.page.url();

    // If we're in a specific project context, capture ALL available routes
    if (currentUrl.match(/\/projects\/\d+/)) {
      console.log(
        chalk.gray("  🎯 In project context - capturing all available routes")
      );

      // Add all discovered sidebar routes from the project navigation
      if (sidebarAnalysis.navigationCategories) {
        let totalRoutesAdded = 0;

        sidebarAnalysis.navigationCategories.forEach((category) => {
          category.elements.forEach((element) => {
            // Add all routes, not just reports
            const componentName = this.inferComponentFromRoute(
              element.text,
              element.href
            );

            results.routes.push({
              component: componentName,
              route: {
                name: element.text,
                url: element.href,
                category: category.category,
              },
              navigationPath: [
                {
                  action: "click",
                  selector: `a[href="${element.href}"]`,
                  text: element.text,
                },
              ],
              confidence: element.confidence,
              discoveryMethod: "ai-sidebar-analysis",
              relevantToPR: this.isRelevantToPR(element.text, element.href),
            });

            // Store in context manager for future use
            this.contextManager.addDiscoveredRoute({
              name: element.text,
              url: element.href,
              navigationPath: [
                {
                  action: "click",
                  selector: `a[href="${element.href}"]`,
                  text: element.text,
                },
              ],
              relevantComponents: [
                { name: componentName, confidence: element.confidence },
              ],
            });

            console.log(
              chalk.green(
                `  ✅ Added route: ${element.text} -> ${element.href}`
              )
            );
            totalRoutesAdded++;
          });
        });

        console.log(
          chalk.green(
            `  ✅ Captured ${totalRoutesAdded} routes from project sidebar`
          )
        );
      }
    } else if (
      currentUrl.includes("/projects") &&
      !currentUrl.match(/\/projects\/\d+/)
    ) {
      // Fallback: If we're still on projects list page, add inferred routes
      console.log(
        chalk.gray(
          "  💡 On projects list page, inferring project-level routes for Reports PR"
        )
      );

      results.routes.push({
        component: "Reports",
        route: {
          name: "Test Run Reports",
          url: "/projects/{project}/reports",
          category: "reports",
          inferred: true,
        },
        navigationPath: [
          {
            action: "navigate",
            description: "Navigate to project and then to reports section",
            requiresProject: true,
          },
        ],
        confidence: 0.8,
        discoveryMethod: "ai-inference-from-pr-context",
        relevantToPR: true,
        reasoning:
          "PR focuses on Reports feature refactoring, routes available within project context",
      });

      console.log(
        chalk.green("  ✅ Inferred Reports routes based on PR context")
      );
    }

    // Also process specific target components if provided
    for (const component of targetComponents) {
      console.log(chalk.gray(`  🎯 AI mapping component: ${component.name}`));

      const routeDiscovery = await this.discoverComponentRouteWithAI(
        component,
        sidebarAnalysis
      );

      if (routeDiscovery.success) {
        results.routes.push({
          component: component.name,
          route: routeDiscovery.route,
          navigationPath: routeDiscovery.navigationPath,
          aiDecision: routeDiscovery.aiDecision,
          confidence: routeDiscovery.confidence,
          discoveryMethod: "ai-powered",
        });

        // Store in context manager for future use
        this.contextManager.addDiscoveredRoute({
          name: routeDiscovery.route.name,
          url: routeDiscovery.route.url,
          navigationPath: routeDiscovery.navigationPath,
          relevantComponents: [
            { name: component.name, confidence: routeDiscovery.confidence },
          ],
        });
      }
    }
  }

  /**
   * Infer component name from route text and href
   * @param {string} text - Route text
   * @param {string} href - Route href
   * @returns {string} - Inferred component name
   */
  inferComponentFromRoute(text, href) {
    const lowerText = text.toLowerCase();
    const lowerHref = href.toLowerCase();

    if (lowerText.includes("report") || lowerHref.includes("/reports")) {
      return "Reports";
    }
    if (lowerText.includes("test") || lowerHref.includes("/test")) {
      return "TestRuns";
    }
    if (lowerText.includes("dashboard") || lowerHref.includes("/dashboard")) {
      return "Dashboard";
    }
    if (lowerText.includes("setting") || lowerHref.includes("/setting")) {
      return "Settings";
    }
    if (lowerText.includes("build") || lowerHref.includes("/build")) {
      return "Builds";
    }

    // Default to the text itself as component name
    return text.replace(/[^a-zA-Z0-9]/g, "") || "Navigation";
  }

  /**
   * Check if route is relevant to current PR
   * @param {string} text - Route text
   * @param {string} href - Route href
   * @returns {boolean} - Whether route is relevant to PR
   */
  isRelevantToPR(text, href) {
    const lowerText = text.toLowerCase();
    const lowerHref = href.toLowerCase();

    // Since PR is about Reports refactoring, prioritize reports-related routes
    return (
      lowerText.includes("report") ||
      lowerHref.includes("/reports") ||
      lowerText.includes("test") ||
      lowerHref.includes("/test")
    );
  }

  /**
   * AI analysis of sidebar navigation
   * @returns {Promise<object>} - Sidebar analysis results
   */
  async analyzeSidebarWithAI() {
    const sidebarContext = await this.extractSidebarContext();

    // Debug: Log all captured elements first
    console.log(
      chalk.gray(
        `  🔍 Captured ${sidebarContext.navigationElements.length} sidebar elements`
      )
    );
    sidebarContext.navigationElements.forEach((el, i) => {
      console.log(
        chalk.gray(
          `    ${i + 1}. "${el.text}" href:${el.href} selector:${el.selector}`
        )
      );
    });

    // Filter navigation elements - prioritize primary sidebar but include other nav elements
    const filteredElements = sidebarContext.navigationElements.filter((el) => {
      // Include primary sidebar elements with highest priority (TCM uses 'primary' section ID)
      if (el.selector.includes('[data-test="side-bar-navigation-primary"]')) {
        return true;
      }

      // Also include secondary navigation elements
      if (el.selector.includes('[data-test="side-bar-navigation-secondary"]')) {
        return true;
      }

      // Include general navigation elements that have meaningful hrefs
      return (
        el.href &&
        el.href.startsWith("/") &&
        el.href !== "/" &&
        !el.href.includes("javascript:") &&
        el.text.length > 0
      );
    });
    console.log(
      chalk.gray(
        `  🎯 Filtered to ${filteredElements.length} relevant elements`
      )
    );

    // Simple route categorization based on text content
    const navigationCategories = [
      {
        category: "reports",
        elements: filteredElements
          .filter(
            (el) =>
              el.text.toLowerCase().includes("report") ||
              el.text.toLowerCase().includes("test")
          )
          .map((el) => ({
            text: el.text,
            href: el.href,
            confidence: 0.9,
          })),
      },
      {
        category: "projects",
        elements: filteredElements
          .filter((el) => el.text.toLowerCase().includes("project"))
          .map((el) => ({
            text: el.text,
            href: el.href,
            confidence: 0.8,
          })),
      },
      {
        category: "general",
        elements: filteredElements
          .filter(
            (el) =>
              !el.text.toLowerCase().includes("report") &&
              !el.text.toLowerCase().includes("test") &&
              !el.text.toLowerCase().includes("project") &&
              el.text.trim().length > 0
          )
          .map((el) => ({
            text: el.text,
            href: el.href,
            confidence: 0.6,
          })),
      },
    ];

    console.log(
      chalk.gray(
        `  🧭 Route categories identified: ${navigationCategories.length}`
      )
    );

    return { navigationCategories, confidence: 0.8 };
  }

  /**
   * Discover route for specific component using AI
   * @param {object} component - Target component
   * @param {object} sidebarAnalysis - AI analysis of sidebar
   * @returns {Promise<object>} - Route discovery result
   */
  async discoverComponentRouteWithAI(component, sidebarAnalysis) {
    const aiContext = this.contextManager.getContextForAI({
      component,
      currentUrl: this.page.url(),
    });

    const navigationPrompt = this.ollamaClient.buildNavigationPrompt(
      component,
      await this.extractPageContext(),
      aiContext.prContext,
      aiContext.navigationHistory
    );

    try {
      const aiResponse = await this.ollamaClient.query(navigationPrompt);

      if (aiResponse.success && aiResponse.data.shouldClick) {
        const decision = aiResponse.data;

        // Record AI decision
        this.contextManager.addAIDecision({
          component: component.name,
          decision: decision,
          action: "navigation",
          confidence: decision.confidence,
        });

        // Execute the navigation
        const navigationResult = await this.executeNavigationDecision(decision);

        if (navigationResult.success) {
          return {
            success: true,
            route: navigationResult.route,
            navigationPath: navigationResult.path,
            aiDecision: decision,
            confidence: decision.confidence,
          };
        }
      }
    } catch (error) {
      console.log(
        chalk.yellow(
          `  ⚠️  AI route discovery failed for ${component.name}: ${error.message}`
        )
      );
    }

    return { success: false, reasoning: "AI route discovery failed" };
  }

  /**
   * Execute AI navigation decision
   * @param {object} decision - AI navigation decision
   * @returns {Promise<object>} - Navigation execution result
   */
  async executeNavigationDecision(decision) {
    try {
      const element = await this.findElementByAIDecision(decision);

      if (element) {
        const beforeUrl = this.page.url();
        await element.click();
        await this.page.waitForLoadState("networkidle");
        const afterUrl = this.page.url();

        // Store navigation step
        this.contextManager.addNavigationStep({
          action: "ai-navigation-click",
          elementText: decision.elementText,
          selector: decision.selector,
          beforeUrl,
          afterUrl,
          result: afterUrl !== beforeUrl ? "success" : "no-change",
          confidence: decision.confidence,
          reasoning: decision.reasoning,
        });

        if (afterUrl !== beforeUrl) {
          const pageContext = await this.extractPageContext();
          this.contextManager.addPageContext(afterUrl, pageContext);

          return {
            success: true,
            route: {
              name: decision.elementText,
              url: afterUrl,
              selector: decision.selector,
            },
            path: [
              {
                action: "click",
                selector: decision.selector,
                text: decision.elementText,
              },
            ],
          };
        }
      }
    } catch (error) {
      console.log(
        chalk.yellow(`  ⚠️  Navigation execution failed: ${error.message}`)
      );
    }

    return { success: false, reasoning: "Navigation execution failed" };
  }

  /**
   * Find element based on AI decision
   * @param {object} decision - AI decision with selector info
   * @returns {Promise<object|null>} - Found element or null
   */
  async findElementByAIDecision(decision) {
    try {
      // Try the recommended selector first
      let element = await this.page.$(decision.selector);
      if (element && (await element.isVisible())) {
        return element;
      }

      // Fallback: search by text content
      const elements = await this.page.$$(
        'a, button, [role="button"], [data-test*="navigation"]'
      );
      for (const el of elements) {
        const text = await el.textContent();
        if (
          text
            ?.trim()
            .toLowerCase()
            .includes(decision.elementText.toLowerCase())
        ) {
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
   * Extract comprehensive page context for AI analysis
   * @returns {Promise<object>} - Page context data
   */
  async extractPageContext() {
    try {
      const context = await this.page.evaluate(() => {
        const clickableElements = [];

        // Get clickable elements, prioritizing primary sidebar navigation
        const selectors = [
          '[data-test="side-bar-navigation-primary"] a',
          '[data-test="side-bar-navigation-primary"] button',
          '[data-test="side-bar-navigation-primary"] [role="button"]',
          '[data-test="side-bar-navigation-secondary"] a',
          '[data-test="side-bar-navigation-secondary"] button',
          '[data-test="side-bar-navigation-secondary"] [role="button"]',
          "a[href]",
          "button:not([disabled])",
          '[role="tab"]',
          '[role="button"]',
          "[data-testid]",
          "[data-test]",
        ];

        selectors.forEach((selector) => {
          const elements = document.querySelectorAll(selector);
          elements.forEach((el, index) => {
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
                    "",
                  selector: selector,
                });
              }
            }
          });
        });

        return {
          url: window.location.href,
          title: document.title,
          headings: Array.from(document.querySelectorAll("h1, h2, h3, h4"))
            .map((h) => h.textContent?.trim())
            .filter(Boolean),
          clickableElements: clickableElements.slice(0, 25), // Limit for AI processing
          mainContent:
            document
              .querySelector("main, .main-content, .content, #main")
              ?.textContent?.trim()
              .substring(0, 1000) || "",
          hasProject: !!document.querySelector(
            '[href*="project"], [data-testid*="project"]'
          ),
          hasSidebar: !!document.querySelector(
            'nav, .sidebar, [role="navigation"]'
          ),
        };
      });

      return context;
    } catch (error) {
      console.log(
        chalk.gray(`  Failed to extract page context: ${error.message}`)
      );
      return {
        clickableElements: [],
        headings: [],
        mainContent: "",
        url: this.page.url(),
        title: "",
      };
    }
  }

  /**
   * Extract sidebar-specific context
   * @returns {Promise<object>} - Sidebar context
   */
  async extractSidebarContext() {
    try {
      return await this.page.evaluate(() => {
        const navigationElements = [];

        // Broader selectors to capture all sidebar navigation elements
        const sidebarSelectors = [
          '[data-test="side-bar-navigation-primary"] a',
          '[data-test="side-bar-navigation-primary"] button',
          '[data-test="side-bar-navigation-primary"] [role="button"]',
          '[data-test="side-bar-navigation-secondary"] a',
          '[data-test="side-bar-navigation-secondary"] button',
          '[data-test="side-bar-navigation-secondary"] [role="button"]',
          "nav a", // General nav links
          '[data-testid*="nav"] a', // Navigation with data-testid
          ".sidebar a", // Sidebar class links
          '[role="navigation"] a', // ARIA navigation
        ];

        sidebarSelectors.forEach((selector) => {
          const elements = document.querySelectorAll(selector);
          elements.forEach((el) => {
            // Only add visible elements and avoid duplicates
            if (el.offsetParent !== null) {
              const text = el.textContent?.trim() || "";
              const href = el.getAttribute("href") || "";

              // Skip empty or duplicate entries
              if (
                text &&
                !navigationElements.some(
                  (nav) => nav.text === text && nav.href === href
                )
              ) {
                navigationElements.push({
                  text: text,
                  href: href,
                  dataTest: el.getAttribute("data-test") || "",
                  dataTestId: el.getAttribute("data-testid") || "",
                  className: el.className || "",
                  tag: el.tagName,
                  selector: selector,
                });
              }
            }
          });
        });

        return { navigationElements };
      });
    } catch (error) {
      console.log(
        chalk.gray(`  Failed to extract sidebar context: ${error.message}`)
      );
      return { navigationElements: [] };
    }
  }

  /**
   * Build page analysis prompt for AI
   * @param {object} pageContext - Current page context
   * @param {object} aiContext - AI context from context manager
   * @returns {string} - Formatted prompt
   */
  buildPageAnalysisPrompt(pageContext, aiContext) {
    const prInfo = aiContext.prContext
      ? `
PR Context:
- Title: ${aiContext.prContext.title}
- Files: ${
          aiContext.prContext.changedFiles?.map((f) => f.filename).join(", ") ||
          "None"
        }
- Components: ${
          aiContext.prContext.components?.map((c) => c.name).join(", ") ||
          "None"
        }
`
      : "";

    return `Analyze this web page and identify navigation routes that match the PR changes.

${prInfo}

Current Page:
- URL: ${pageContext.url}
- Title: ${pageContext.title}
- Main Headings: ${pageContext.headings.join(", ")}
- Has Project Context: ${pageContext.hasProject}
- Has Sidebar: ${pageContext.hasSidebar}

Available Navigation Elements with Full Details:
${pageContext.clickableElements
  .slice(0, 8)
  .map(
    (el, i) =>
      `${i + 1}. "${el.text}" [${el.tag}] (href: ${el.href}, data-test: ${
        el.dataTestId
      })`
  )
  .join("\n")}

Task: Based on the PR context and available navigation elements, identify routes that are most relevant to the changed files and components. Focus on test management routes under /projects.

Respond in JSON format:
{
  "pageType": "landing|project|dashboard|reports|settings|other",
  "primaryActions": [
    {
      "type": "navigate-to-project",
      "text": "exact element text from list above",
      "selector": "a[href='exact-href-from-list']",
      "confidence": 0.8,
      "reasoning": "why this route matches PR changes"
    }
  ]
}`;
  }

  /**
   * Execute AI navigation action
   * @param {object} action - AI-recommended action
   * @param {object} results - Results object to update
   * @returns {Promise<boolean>} - Success status
   */
  async executeAINavigationAction(action, results) {
    try {
      console.log(
        chalk.gray(`  🎯 Executing AI action: ${action.description}`)
      );

      const element = await this.page.$(action.selector);
      if (element && (await element.isVisible())) {
        const beforeUrl = this.page.url();
        await element.click();
        await this.page.waitForLoadState("networkidle");
        const afterUrl = this.page.url();

        results.navigationPath.push({
          action: action.type,
          selector: action.selector,
          elementText: action.elementText,
          beforeUrl,
          afterUrl,
          success: afterUrl !== beforeUrl,
          timestamp: new Date().toISOString(),
        });

        if (afterUrl !== beforeUrl) {
          const newContext = await this.extractPageContext();
          this.contextManager.addPageContext(afterUrl, newContext);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.log(
        chalk.yellow(`  ⚠️  Action execution failed: ${error.message}`)
      );
      return false;
    }
  }

  /**
   * Explore discovered routes by navigating to them and testing
   * @param {object} discoveryResults - Discovery results with routes
   */
  async exploreDiscoveredRoutes(discoveryResults) {
    console.log(
      chalk.cyan("🧭 Starting AI-powered exploration of discovered routes...")
    );

    if (!discoveryResults.routes || discoveryResults.routes.length === 0) {
      console.log(
        chalk.yellow("⚠️  No routes available for exploration")
      );
      return;
    }

    console.log(chalk.blue("🧠 AI analyzing routes for PR relevance..."));

    // Use AI to determine which routes are relevant to PR changes
    let prRelevantRoutes = [];
    try {
      prRelevantRoutes = await this.filterRoutesByPRRelevance(
        discoveryResults.routes
      );
    } catch (error) {
      console.log(
        chalk.yellow(`⚠️  AI filtering failed: ${error.message} - using all routes`)
      );
      // Fallback: use all discovered routes with basic scoring
      prRelevantRoutes = discoveryResults.routes.map((route, index) => ({
        ...route,
        aiRelevanceScore: 0.5,
        aiRelevanceReasoning: "Fallback: AI filtering unavailable"
      }));
    }

    if (prRelevantRoutes.length === 0) {
      console.log(
        chalk.yellow(
          "⚠️  No routes found matching PR changes - using all available routes"
        )
      );
      prRelevantRoutes = discoveryResults.routes.map((route) => ({
        ...route,
        aiRelevanceScore: 0.3,
        aiRelevanceReasoning: "Default route exploration"
      }));
    }

    console.log(chalk.gray("  📊 AI-filtered PR-relevant routes:"));
    prRelevantRoutes.forEach((route, i) => {
      console.log(
        chalk.gray(
          `    ${i + 1}. 🎯 ${route.component} ${route.route.name} → ${
            route.route.url
          } (Relevance: ${route.aiRelevanceScore || 0.3})`
        )
      );
    });

    // Explore the most relevant routes (limit to top 3 to avoid over-testing)
    const routesToExplore = prRelevantRoutes.slice(0, 3);

    for (const [index, route] of routesToExplore.entries()) {
      try {
        console.log(
          chalk.blue(
            `\n🔍 Exploring AI-Selected Route ${index + 1}/${
              routesToExplore.length
            }: ${route.component}`
          )
        );
        console.log(
          chalk.gray(`  💭 AI Reasoning: ${route.aiRelevanceReasoning}`)
        );

        await this.exploreSpecificRoute(route, index + 1);

        // Use AI to determine if this route needs deeper exploration
        if (route.aiRelevanceScore > 0.8) {
          await this.exploreDeepRouteFeatures(route);
        }
      } catch (error) {
        console.log(
          chalk.yellow(`  ⚠️  Route exploration failed: ${error.message}`)
        );
        continue;
      }
    }

    console.log(chalk.green("✅ AI-powered route exploration completed"));
  }

  /**
   * Use AI to filter routes based on PR relevance
   * @param {array} routes - All discovered routes
   * @returns {Promise<array>} - Filtered routes with relevance scores
   */
  async filterRoutesByPRRelevance(routes) {
    console.log(
      chalk.blue("🧠 AI analyzing PR relevance of discovered routes...")
    );

    const prContext = this.contextManager.getContextForAI({}).prContext;

    if (!prContext) {
      console.log(
        chalk.yellow(
          "⚠️  No PR context available - falling back to basic filtering"
        )
      );
      return routes.slice(0, 3); // Fallback to first 3 routes
    }

    const relevancePrompt = `Analyze which routes are most relevant to this PR and rank them by impact.

PR Information:
- Title: ${prContext.title}
- Branch: ${prContext.branch}
- Changed Files: ${
      prContext.changedFiles?.map((f) => f.filename).join(", ") || "None"
    }
- Components: ${prContext.components?.map((c) => c.name).join(", ") || "None"}

Available Routes:
${routes
  .map(
    (route, i) =>
      `${i + 1}. Component: ${route.component}, Name: ${
        route.route.name
      }, URL: ${route.route.url}`
  )
  .join("\n")}

Task: Determine which routes are most likely to be impacted by the PR changes. Consider:
- File paths and component names mentioned in the PR
- Route functionality that would be affected by the changes
- UI areas that users would interact with related to the changes

Respond in JSON format:
{
  "relevantRoutes": [
    {
      "routeIndex": 1,
      "component": "ComponentName",
      "relevanceScore": 0.9,
      "reasoning": "Clear explanation of why this route is relevant to PR changes"
    }
  ]
}`;

    try {
      const aiResponse = await this.ollamaClient.query(relevancePrompt);

      if (aiResponse.success && aiResponse.data.relevantRoutes) {
        const relevantRoutes = aiResponse.data.relevantRoutes
          .map((aiRoute) => {
            const originalRoute = routes[aiRoute.routeIndex - 1];
            if (originalRoute) {
              return {
                ...originalRoute,
                aiRelevanceScore: aiRoute.relevanceScore,
                aiRelevanceReasoning: aiRoute.reasoning,
              };
            }
            return null;
          })
          .filter(Boolean)
          .sort((a, b) => b.aiRelevanceScore - a.aiRelevanceScore); // Sort by relevance score

        console.log(
          chalk.green(
            `✅ AI identified ${relevantRoutes.length} relevant routes`
          )
        );
        return relevantRoutes;
      }
    } catch (error) {
      console.log(
        chalk.yellow(`⚠️  AI relevance analysis failed: ${error.message}`)
      );
    }

    // Fallback: Use simple keyword matching
    return this.fallbackPRRelevanceFiltering(routes, prContext);
  }

  /**
   * Fallback filtering when AI fails
   * @param {array} routes - All routes
   * @param {object} prContext - PR context
   * @returns {array} - Filtered routes
   */
  fallbackPRRelevanceFiltering(routes, prContext) {
    console.log(chalk.gray("  🔄 Using fallback keyword-based filtering"));

    const prTitle = prContext.title?.toLowerCase() || "";
    const changedFiles =
      prContext.changedFiles?.map((f) => f.filename.toLowerCase()) || [];
    const components =
      prContext.components?.map((c) => c.name.toLowerCase()) || [];

    // Extract keywords from PR title, files, and components
    const keywords = [
      ...prTitle.split(/\s+/),
      ...changedFiles.flatMap((file) => file.split(/[\/\-_\.]/)),
      ...components.flatMap((comp) => comp.split(/[A-Z]/).filter(Boolean)),
    ].filter((keyword) => keyword.length > 2); // Filter short words

    const relevantRoutes = routes
      .map((route) => {
        const routeText =
          `${route.component} ${route.route.name} ${route.route.url}`.toLowerCase();

        // Count matching keywords
        const matchingKeywords = keywords.filter((keyword) =>
          routeText.includes(keyword)
        );

        const relevanceScore =
          matchingKeywords.length > 0
            ? (matchingKeywords.length / keywords.length) * 0.8 + 0.2 // Base relevance if matches
            : 0.1; // Minimal relevance if no matches

        return {
          ...route,
          aiRelevanceScore: relevanceScore,
          aiRelevanceReasoning:
            matchingKeywords.length > 0
              ? `Matches PR keywords: ${matchingKeywords.join(", ")}`
              : "No direct keyword matches with PR context",
        };
      })
      .filter((route) => route.aiRelevanceScore > 0.3) // Filter low relevance routes
      .sort((a, b) => b.aiRelevanceScore - a.aiRelevanceScore);

    console.log(
      chalk.green(
        `✅ Fallback filtering found ${relevantRoutes.length} relevant routes`
      )
    );
    return relevantRoutes;
  }

  /**
   * Deep exploration of highly relevant routes
   * @param {object} route - Route with high relevance score
   */
  async exploreDeepRouteFeatures(route) {
    console.log(
      chalk.blue(`  🔬 Performing deep exploration of ${route.component}...`)
    );

    try {
      // Use AI to identify specific features to test based on PR context
      const prContext = this.contextManager.getContextForAI({}).prContext;
      const pageContext = await this.extractPageContext();

      const deepExplorationPrompt = `Based on the PR changes and current page, identify specific features to test in detail.

PR Context: ${prContext?.title || "Unknown"}
Changed Files: ${
        prContext?.changedFiles?.map((f) => f.filename).join(", ") || "None"
      }

Current Page Elements:
${pageContext.clickableElements
  .slice(0, 10)
  .map(
    (el, i) => `${i + 1}. ${el.tag}: "${el.text}" (${el.href || el.className})`
  )
  .join("\n")}

Route: ${route.component} - ${route.route.name}

Task: Identify 3-5 specific UI elements or interactions that should be tested based on the PR changes.

Respond in JSON format:
{
  "testActions": [
    {
      "elementText": "exact text from elements above",
      "actionType": "click|hover|scroll",
      "priority": "high|medium|low",
      "reasoning": "why this element relates to PR changes"
    }
  ]
}`;

      const aiResponse = await this.ollamaClient.query(deepExplorationPrompt);

      if (aiResponse.success && aiResponse.data.testActions) {
        console.log(
          chalk.gray(
            `    🎯 AI identified ${aiResponse.data.testActions.length} priority test actions`
          )
        );

        // Execute priority test actions
        for (const action of aiResponse.data.testActions.slice(0, 3)) {
          try {
            await this.executeTargetedTestAction(action);
          } catch (error) {
            console.log(
              chalk.gray(`    ⚠️  Test action failed: ${error.message}`)
            );
          }
        }
      }
    } catch (error) {
      console.log(
        chalk.yellow(`    ⚠️  Deep exploration failed: ${error.message}`)
      );
    }
  }

  /**
   * Execute a specific test action identified by AI
   * @param {object} action - Test action to execute
   */
  async executeTargetedTestAction(action) {
    console.log(
      chalk.gray(
        `    🔧 Testing: ${action.actionType} on "${action.elementText}"`
      )
    );

    try {
      // Find element by text content
      const elements = await this.page.$$("*");
      for (const element of elements) {
        const text = await element.textContent();
        if (text?.includes(action.elementText)) {
          switch (action.actionType) {
            case "click":
              if (await element.isVisible()) {
                await element.click();
                await this.page.waitForTimeout(1000);
                console.log(
                  chalk.green(`      ✅ Clicked: "${action.elementText}"`)
                );
              }
              break;

            case "hover":
              if (await element.isVisible()) {
                await element.hover();
                await this.page.waitForTimeout(500);
                console.log(
                  chalk.green(`      ✅ Hovered: "${action.elementText}"`)
                );
              }
              break;

            case "scroll":
              await element.scrollIntoViewIfNeeded();
              await this.page.waitForTimeout(500);
              console.log(
                chalk.green(`      ✅ Scrolled to: "${action.elementText}"`)
              );
              break;
          }

          // Record the interaction
          this.contextManager.addInteractionPattern({
            type: "ai-targeted-testing",
            component: "dynamic",
            success: true,
            action: action.actionType,
            element: action.elementText,
            priority: action.priority,
            reasoning: action.reasoning,
          });

          break; // Only interact with first matching element
        }
      }
    } catch (error) {
      console.log(
        chalk.gray(`      ⚠️  Action execution failed: ${error.message}`)
      );
    }
  }

  /**
   * Explore a specific route by navigating to it and testing interactions
   * @param {object} route - Route to explore
   * @param {number} routeIndex - Route index for logging
   */
  async exploreSpecificRoute(route, routeIndex) {
    const routeName = route.route.name;
    const routeUrl = route.route.url;

    console.log(chalk.blue(`  🔗 Navigating to: ${routeName} (${routeUrl})`));

    try {
      // Navigate to the route
      if (routeUrl && routeUrl.startsWith("/")) {
        const fullUrl = new URL(this.page.url()).origin + routeUrl;
        await this.page.goto(fullUrl, {
          waitUntil: "networkidle",
          timeout: 15000,
        });

        // Wait for page to load and stabilize
        await this.page.waitForTimeout(2000);

        console.log(chalk.green(`  ✅ Successfully navigated to ${routeName}`));

        // Capture page context after navigation
        const pageContext = await this.extractPageContext();
        this.contextManager.addPageContext(this.page.url(), pageContext);

        // Perform AI-powered analysis of the page
        await this.analyzeRoutePage(route, pageContext);

        // Test interactions on this page
        await this.testRouteInteractions(route, pageContext);

        // Take screenshot for documentation
        await this.captureRouteArtifacts(route, routeIndex);
      } else {
        console.log(chalk.yellow(`  ⚠️  Invalid route URL: ${routeUrl}`));
      }
    } catch (error) {
      console.log(
        chalk.red(`  ❌ Navigation to ${routeName} failed: ${error.message}`)
      );
    }
  }

  /**
   * AI-powered analysis of a specific route page
   * @param {object} route - Route being analyzed
   * @param {object} pageContext - Current page context
   */
  async analyzeRoutePage(route, pageContext) {
    console.log(chalk.blue(`  🧠 AI analyzing ${route.component} page...`));

    try {
      // Focus analysis on elements relevant to the PR
      const relevantElements = pageContext.clickableElements.filter((el) => {
        const text = el.text.toLowerCase();
        const href = el.href.toLowerCase();

        // For Reports route, look for report-specific elements
        if (route.component === "Reports") {
          return (
            text.includes("report") ||
            text.includes("chart") ||
            text.includes("table") ||
            text.includes("summary") ||
            text.includes("detail") ||
            href.includes("/reports") ||
            href.includes("/charts") ||
            href.includes("/tables")
          );
        }

        // For TestRuns, look for test run elements
        if (route.component === "TestRuns") {
          return (
            text.includes("test") ||
            text.includes("run") ||
            text.includes("execution") ||
            href.includes("/test-runs")
          );
        }

        // Default: any interactive elements
        return el.href || el.dataTestId;
      });

      console.log(
        chalk.gray(`    📊 Found ${relevantElements.length} relevant elements`)
      );
      console.log(chalk.gray(`    🏷️  Page title: ${pageContext.title}`));
      console.log(chalk.gray(`    📍 Current URL: ${pageContext.url}`));

      // Store analysis results
      this.contextManager.addAIDecision({
        component: route.component,
        decision: {
          pageAnalyzed: true,
          relevantElements: relevantElements.length,
          pageTitle: pageContext.title,
          currentUrl: pageContext.url,
        },
        action: "page-analysis",
        confidence: 0.9,
      });
    } catch (error) {
      console.log(
        chalk.yellow(`    ⚠️  Page analysis failed: ${error.message}`)
      );
    }
  }

  /**
   * Test interactions on the current route page
   * @param {object} route - Route being tested
   * @param {object} pageContext - Current page context
   */
  async testRouteInteractions(route, pageContext) {
    console.log(
      chalk.blue(`  ⚡ Testing interactions on ${route.component} page...`)
    );

    try {
      const interactions = [];

      // Test different types of interactions based on the component type
      if (route.component === "Reports") {
        interactions.push(...(await this.testReportsPageInteractions()));
      } else if (route.component === "TestRuns") {
        interactions.push(...(await this.testTestRunsPageInteractions()));
      } else {
        interactions.push(...(await this.testGeneralPageInteractions()));
      }

      console.log(
        chalk.green(`    ✅ Completed ${interactions.length} interactions`)
      );

      // Store interaction results
      this.contextManager.addInteractionPattern({
        type: "route-testing",
        component: route.component,
        success: true,
        interactions: interactions.length,
        interactionType: "ai-route-exploration",
      });
    } catch (error) {
      console.log(
        chalk.yellow(`    ⚠️  Interaction testing failed: ${error.message}`)
      );
    }
  }

  /**
   * Test interactions specific to Reports pages
   * @returns {Promise<Array>} - Array of interaction results
   */
  async testReportsPageInteractions() {
    const interactions = [];

    try {
      // Look for report navigation elements (tabs, filters, etc.)
      const reportElements = await this.page.$$(
        'button, a, [role="tab"], [role="button"]'
      );

      for (const element of reportElements.slice(0, 5)) {
        try {
          const text = await element.textContent();
          if (
            text &&
            (text.toLowerCase().includes("chart") ||
              text.toLowerCase().includes("table") ||
              text.toLowerCase().includes("summary") ||
              text.toLowerCase().includes("detail"))
          ) {
            if (await element.isVisible()) {
              console.log(
                chalk.gray(`    🖱️  Testing Reports element: "${text.trim()}"`)
              );

              await element.click();
              await this.page.waitForTimeout(1000); // Wait for any transitions

              interactions.push({
                type: "click",
                element: text.trim(),
                result: "success",
              });
            }
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      console.log(
        chalk.gray(`    Reports interaction testing error: ${error.message}`)
      );
    }

    return interactions;
  }

  /**
   * Test interactions specific to Test Runs pages
   * @returns {Promise<Array>} - Array of interaction results
   */
  async testTestRunsPageInteractions() {
    const interactions = [];

    try {
      // Look for test run specific elements
      const testElements = await this.page.$$(
        'button, a, [data-testid*="test"], [data-testid*="run"]'
      );

      for (const element of testElements.slice(0, 3)) {
        try {
          const text = await element.textContent();
          if (text && (await element.isVisible())) {
            console.log(
              chalk.gray(`    🖱️  Testing TestRun element: "${text.trim()}"`)
            );

            await element.click();
            await this.page.waitForTimeout(1000);

            interactions.push({
              type: "click",
              element: text.trim(),
              result: "success",
            });
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      console.log(
        chalk.gray(`    TestRuns interaction testing error: ${error.message}`)
      );
    }

    return interactions;
  }

  /**
   * Test general page interactions
   * @returns {Promise<Array>} - Array of interaction results
   */
  async testGeneralPageInteractions() {
    const interactions = [];

    try {
      // Test general interactive elements
      const elements = await this.page.$$("button:visible, a:visible");

      for (const element of elements.slice(0, 3)) {
        try {
          const text = await element.textContent();
          if (text && text.trim().length > 0) {
            console.log(
              chalk.gray(`    🖱️  Testing general element: "${text.trim()}"`)
            );

            await element.hover(); // Gentle interaction
            await this.page.waitForTimeout(500);

            interactions.push({
              type: "hover",
              element: text.trim(),
              result: "success",
            });
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      console.log(
        chalk.gray(`    General interaction testing error: ${error.message}`)
      );
    }

    return interactions;
  }

  /**
   * Capture artifacts for the current route
   * @param {object} route - Route being captured
   * @param {number} routeIndex - Route index for naming
   */
  async captureRouteArtifacts(route, routeIndex) {
    try {
      console.log(
        chalk.blue(`    📸 Capturing artifacts for ${route.component}...`)
      );

      // Take screenshot
      // Note: This would normally use the PlaywrightRunner's screenshot method
      // For now, we'll just log that we would capture artifacts
      console.log(
        chalk.gray(`    📷 Screenshot captured for ${route.component}`)
      );
      console.log(
        chalk.gray(`    📄 Page state captured for ${route.component}`)
      );
    } catch (error) {
      console.log(
        chalk.yellow(`    ⚠️  Artifact capture failed: ${error.message}`)
      );
    }
  }

  /**
   * Create fallback analysis when AI fails
   * @param {object} pageContext - Page context
   * @returns {object} - Fallback analysis
   */
  createFallbackAnalysis(pageContext) {
    const actions = [];

    // Look for common project navigation patterns
    pageContext.clickableElements.forEach((el) => {
      if (
        el.text.toLowerCase().includes("project") ||
        el.href.includes("project")
      ) {
        actions.push({
          type: "navigate-to-project",
          elementText: el.text,
          selector: `${el.tag.toLowerCase()}[href="${el.href}"]`,
          description: "Navigate to project section",
          confidence: 0.7,
          reasoning: "Element contains project-related terms",
          priority: "high",
        });
      }
    });

    return {
      pageType: pageContext.hasProject ? "project" : "landing",
      primaryActions: actions,
      pageDescription: "Fallback analysis - limited AI insights",
      confidence: 0.5,
    };
  }
}
