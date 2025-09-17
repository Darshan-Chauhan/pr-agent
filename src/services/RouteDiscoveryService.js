import chalk from "chalk";

/**
 * Intelligent route discovery service that navigates through the application
 * to discover available routes and their relationships
 */
export class RouteDiscoveryService {
  constructor(page) {
    this.page = page;
    this.discoveredRoutes = new Map();
    this.navigationPaths = [];
    this.currentDepth = 0;
    this.maxDepth = 3;
  }

  /**
   * Discover routes starting from the base page
   * @param {string} baseUrl - Starting URL
   * @param {array} targetComponents - Components we're looking for
   * @returns {array} - Discovered routes with navigation paths
   */
  async discoverRoutes(baseUrl, targetComponents = []) {
    console.log(chalk.cyan("🗺️  Starting intelligent route discovery..."));

    try {
      // Step 1: Navigate to base page
      await this.page.goto(baseUrl, { waitUntil: "networkidle" });
      await this.page.waitForSelector("body", { timeout: 10000 });

      // Step 2: Analyze the landing page
      const landingPageInfo = await this.analyzeLandingPage();

      // Step 3: Find and navigate to projects (if it's a project-based app)
      const projectRoutes = await this.discoverProjectRoutes();

      // Step 4: For each project, discover internal navigation
      const navigationRoutes = await this.discoverNavigationRoutes(
        targetComponents
      );

      // Step 5: Build complete route map
      const routeMap = this.buildRouteMap(
        landingPageInfo,
        projectRoutes,
        navigationRoutes
      );

      console.log(
        chalk.green(
          `✅ Route discovery complete: ${routeMap.length} routes found`
        )
      );
      return routeMap;
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Route discovery failed: ${error.message}`));
      return this.getFallbackRoutes(baseUrl);
    }
  }

  /**
   * Analyze the landing page for navigation patterns
   */
  async analyzeLandingPage() {
    console.log(chalk.blue("🔍 Analyzing landing page..."));

    const landingPageInfo = {
      url: this.page.url(),
      hasProjects: false,
      navigationElements: [],
      projectLinks: [],
    };

    // Look for project-related elements
    const projectIndicators = [
      'a[href*="project"]',
      'a[href*="Project"]',
      '[data-testid*="project"]',
      'button[aria-label*="project" i]',
      "text=/project/i",
      ".project-card",
      ".project-item",
      'tr[data-testid*="project"]',
    ];

    for (const selector of projectIndicators) {
      try {
        const elements = await this.page.$$(selector);
        if (elements.length > 0) {
          console.log(
            chalk.gray(
              `  Found ${elements.length} project elements with: ${selector}`
            )
          );
          landingPageInfo.hasProjects = true;

          // Extract project links
          for (const element of elements.slice(0, 3)) {
            // Limit to first 3
            const href = await element.getAttribute("href");
            const text = await element.textContent();
            if (href) {
              landingPageInfo.projectLinks.push({
                href: href,
                text: text?.trim(),
                selector: selector,
              });
            }
          }
        }
      } catch (error) {
        // Silent fail for individual selectors
      }
    }

    // Look for main navigation - prioritizing specific sidebar navigation
    const navSelectors = [
      // Specific sidebar navigation (highest priority)
      '[data-test="side-bar-navigation-primary"] a',
      '[data-testid="side-bar-navigation-primary"] a',
      // Sidebar navigation (most likely in your app)
      ".sidebar a",
      "aside a",
      ".left-sidebar a",
      ".app-sidebar a",
      "div[class*='sidebar'] a",
      "div[class*='nav'] a",
      "nav:first-of-type a",
      "ul li a",
      "nav ul a",
      ".nav-list a",
      // Generic navigation
      "nav a",
      '[role="navigation"] a',
      ".main-nav a",
      '[data-testid*="nav"] a',
      '[data-test*="nav"] a',
    ];

    for (const selector of navSelectors) {
      try {
        const navElements = await this.page.$$(selector);
        for (const element of navElements.slice(0, 5)) {
          // Limit to first 5
          const href = await element.getAttribute("href");
          const text = await element.textContent();
          if (href && text) {
            landingPageInfo.navigationElements.push({
              href: href,
              text: text.trim(),
              selector: selector,
            });
          }
        }
      } catch (error) {
        // Silent fail for individual selectors
      }
    }

    return landingPageInfo;
  }

  /**
   * Discover project routes by following project links
   */
  async discoverProjectRoutes() {
    console.log(chalk.blue("🏗️  Discovering project routes..."));

    const projectRoutes = [];

    // Try to find and click on the first available project
    const projectSelectors = [
      'a[href*="/projects/"]',
      'tr[data-testid*="project"] a',
      ".project-card a",
      ".project-item a",
      '[data-testid*="project-link"]',
    ];

    for (const selector of projectSelectors) {
      try {
        const projectLink = await this.page.$(selector);
        if (projectLink) {
          const href = await projectLink.getAttribute("href");
          const text = await projectLink.textContent();

          console.log(chalk.gray(`  Navigating to project: ${href}`));

          // Navigate to project
          await projectLink.click();
          await this.page.waitForLoadState("networkidle");

          const projectUrl = this.page.url();
          projectRoutes.push({
            url: projectUrl,
            name: text?.trim() || "Project",
            type: "project",
            navigationPath: [
              {
                action: "click",
                selector: selector,
                description: `Navigate to project: ${text}`,
              },
            ],
          });

          console.log(chalk.green(`  ✅ Found project route: ${projectUrl}`));
          break; // Use the first working project
        }
      } catch (error) {
        console.log(chalk.gray(`  Could not navigate via: ${selector}`));
        continue;
      }
    }

    return projectRoutes;
  }

  /**
   * Discover navigation routes within the current context
   */
  async discoverNavigationRoutes(targetComponents = []) {
    console.log(chalk.blue("🧭 Discovering navigation routes..."));

    const navigationRoutes = [];

    // Look for sidebar/navigation elements - targeting specific sidebar structure
    const navSelectors = [
      // Specific sidebar navigation (highest priority)
      '[data-test="side-bar-navigation-primary"] a',
      '[data-testid="side-bar-navigation-primary"] a',
      // Generic sidebar patterns
      ".sidebar a",
      '[data-testid*="sidebar"] a',
      ".navigation a",
      '[role="navigation"] a',
      ".menu a",
      ".nav-menu a",
      "nav.side-nav a",
      // Left sidebar specific selectors
      "aside a",
      ".left-sidebar a",
      ".app-sidebar a",
      '[data-testid*="nav"] a',
      '[data-test*="nav"] a',
      // Generic sidebar navigation patterns
      "nav:first-of-type a",
      "div[class*='sidebar'] a",
      "div[class*='nav'] a",
      // Look for navigation lists
      "ul li a",
      "nav ul a",
      ".nav-list a",
    ];

    for (const selector of navSelectors) {
      try {
        const navElements = await this.page.$$(selector);
        console.log(
          chalk.gray(
            `  Found ${navElements.length} navigation elements with: ${selector}`
          )
        );

        for (const navElement of navElements) {
          try {
            const href = await navElement.getAttribute("href");
            const text = await navElement.textContent();
            const isVisible = await navElement.isVisible();

            if (href && text && isVisible) {
              const navText = text.trim().toLowerCase();

              // Check if this navigation item is relevant to our target components
              const isRelevant = this.isNavigationRelevant(
                navText,
                targetComponents
              );

              if (isRelevant) {
                console.log(
                  chalk.gray(`    🎯 Relevant navigation found: ${text.trim()}`)
                );

                // Navigate to this route
                try {
                  await navElement.click();
                  await this.page.waitForLoadState("networkidle");

                  const routeUrl = this.page.url();
                  navigationRoutes.push({
                    url: routeUrl,
                    name: text.trim(),
                    type: "navigation",
                    relevantComponents: this.getRelevantComponents(
                      navText,
                      targetComponents
                    ),
                    navigationPath: [
                      {
                        action: "click",
                        selector: selector,
                        description: `Navigate to ${text.trim()}`,
                      },
                    ],
                  });

                  console.log(chalk.green(`    ✅ Added route: ${routeUrl}`));

                  // Brief pause to let page settle
                  await this.page.waitForTimeout(1000);
                } catch (navError) {
                  console.log(
                    chalk.gray(`    Could not navigate to: ${text.trim()}`)
                  );
                }
              }
            }
          } catch (elementError) {
            // Skip problematic elements
            continue;
          }
        }

        // If we found navigation elements with this selector, break (don't try other selectors)
        if (navElements.length > 0) {
          break;
        }
      } catch (selectorError) {
        console.log(chalk.gray(`  Selector failed: ${selector}`));
        continue;
      }
    }

    return navigationRoutes;
  }

  /**
   * Check if navigation item is relevant to target components
   */
  isNavigationRelevant(navText, targetComponents) {
    if (targetComponents.length === 0) {
      return true; // If no specific targets, explore all
    }

    const relevantKeywords = [
      "report",
      "reports",
      "test",
      "run",
      "runs",
      "dashboard",
      "summary",
      "detail",
      "chart",
      "table",
      "analysis",
      "results",
    ];

    // Check if nav text contains relevant keywords
    const hasRelevantKeyword = relevantKeywords.some((keyword) =>
      navText.includes(keyword)
    );

    // Check if any target components relate to this nav item
    const hasRelatedComponent = targetComponents.some((component) => {
      const componentName = component.name?.toLowerCase() || "";
      return (
        (navText.includes("report") && componentName.includes("report")) ||
        (navText.includes("test") && componentName.includes("test")) ||
        (navText.includes("chart") && componentName.includes("chart")) ||
        (navText.includes("table") && componentName.includes("table"))
      );
    });

    return hasRelevantKeyword || hasRelatedComponent;
  }

  /**
   * Get components that are relevant to a navigation item
   */
  getRelevantComponents(navText, targetComponents) {
    return targetComponents.filter((component) => {
      const componentName = component.name?.toLowerCase() || "";
      return (
        (navText.includes("report") && componentName.includes("report")) ||
        (navText.includes("test") && componentName.includes("test")) ||
        (navText.includes("chart") && componentName.includes("chart")) ||
        (navText.includes("table") && componentName.includes("table")) ||
        (navText.includes("summary") && componentName.includes("summary")) ||
        (navText.includes("detail") && componentName.includes("detail"))
      );
    });
  }

  /**
   * Build comprehensive route map from discovered information
   */
  buildRouteMap(landingPageInfo, projectRoutes, navigationRoutes) {
    const routeMap = [];

    // Add landing page
    routeMap.push({
      path: "/",
      name: "Home",
      url: landingPageInfo.url,
      type: "landing",
      navigationPath: [],
      confidence: "high",
    });

    // Add project routes
    for (const projectRoute of projectRoutes) {
      routeMap.push({
        path: this.extractPath(projectRoute.url),
        name: projectRoute.name,
        url: projectRoute.url,
        type: "project",
        navigationPath: projectRoute.navigationPath,
        confidence: "high",
      });
    }

    // Add navigation routes
    for (const navRoute of navigationRoutes) {
      routeMap.push({
        path: this.extractPath(navRoute.url),
        name: navRoute.name,
        url: navRoute.url,
        type: "feature",
        navigationPath: navRoute.navigationPath,
        relevantComponents: navRoute.relevantComponents || [],
        confidence: "medium",
      });
    }

    return routeMap;
  }

  /**
   * Extract path from full URL
   */
  extractPath(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch (error) {
      return url;
    }
  }

  /**
   * Get fallback routes if discovery fails
   */
  getFallbackRoutes(baseUrl) {
    console.log(chalk.yellow("🔄 Using fallback routes..."));

    return [
      {
        path: "/",
        name: "Home",
        url: baseUrl,
        type: "fallback",
        navigationPath: [],
        confidence: "low",
      },
    ];
  }
}
