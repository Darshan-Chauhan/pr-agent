import axios from "axios";
import fetch from "node-fetch";
import chalk from "chalk";

/**
 * Uses LLM to infer exploration scope from PR changes
 */
export class ScopeInferenceService {
  constructor() {
    this.ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
    this.model = process.env.OLLAMA_MODEL || "gemma3:4b";
    this.timeout = parseInt(process.env.OLLAMA_TIMEOUT) || 30000;
  }

  /**
   * Infer exploration scope from PR data
   * @param {object} options - PR data and repository info
   * @returns {object} - Exploration scope
   */
  async inferScope(options) {
    const { prDetails, prDiff, repository } = options;

    console.log(chalk.cyan("🧠 Analyzing PR changes with LLM..."));

    try {
      // Check if Ollama is available and use it, otherwise fallback to rules
      const isOllamaAvailable = await this.checkOllamaAvailability();

      if (isOllamaAvailable) {
        return await this.inferWithOllama(prDetails, prDiff, repository);
      } else {
        console.log(
          chalk.yellow("⚠️  Ollama not available, using fallback rules")
        );
        return this.inferWithFallbackRules(prDetails, prDiff, repository);
      }
    } catch (error) {
      console.log(
        chalk.yellow(
          `⚠️  LLM inference failed (${error.message}), using fallback rules`
        )
      );
      return this.inferWithFallbackRules(prDetails, prDiff, repository);
    }
  }

  /**
   * Check if Ollama is available
   */
  async checkOllamaAvailability() {
    try {
      const response = await axios.get(`${this.ollamaUrl}/api/tags`, {
        timeout: 5000,
      });

      const models = response.data.models || [];
      const hasModel = models.some((m) =>
        m.name.includes(this.model.split(":")[0])
      );

      if (!hasModel) {
        console.log(
          chalk.yellow(
            `⚠️  Model ${this.model} not found. Available models: ${models
              .map((m) => m.name)
              .join(", ")}`
          )
        );
        // Try to use the first available model
        if (models.length > 0) {
          this.model = models[0].name;
          console.log(
            chalk.cyan(`🔄 Switching to available model: ${this.model}`)
          );
        }
      }

      return true;
    } catch (error) {
      console.log(
        chalk.gray(
          `Ollama not available at ${this.ollamaUrl}: ${error.message}`
        )
      );
      return false;
    }
  }

  /**
   * Infer scope using Ollama with streaming
   */
  async inferWithOllama(prDetails, prDiff, repository) {
    const prompt = this.buildScopeInferencePrompt(
      prDetails,
      prDiff,
      repository
    );

    console.log(
      chalk.gray(`Using Ollama model: ${this.model} at ${this.ollamaUrl}`)
    );
    console.log(chalk.cyan("🤔 AI is thinking..."));

    const content = await this.streamOllamaResponse({
      model: this.model,
      prompt: prompt,
      options: {
        temperature: 0.1,
        top_k: 10,
        top_p: 0.3,
      },
    });

    console.log(); // New line after streaming
    return this.parseLLMResponse(content);
  }

  /**
   * Stream Ollama response with real-time display
   */
  async streamOllamaResponse(requestData) {
    const response = await fetch(`${this.ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...requestData,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    let fullContent = "";

    // Stream the response line by line
    for await (const chunk of response.body) {
      const lines = chunk.toString().trim().split("\n");

      for (const line of lines) {
        if (!line) continue;

        try {
          const data = JSON.parse(line);

          if (data.response) {
            // Display the streaming text in real-time with subtle styling
            process.stdout.write(chalk.gray(data.response));
            fullContent += data.response;
          }

          if (data.done) {
            break;
          }
        } catch (parseError) {
          // Skip malformed JSON lines
          continue;
        }
      }
    }

    return fullContent;
  }

  /**
   * Build prompt for scope inference
   */
  buildScopeInferencePrompt(prDetails, prDiff, repository) {
    const changedFiles = prDiff.files.map((f) => f.filename).join("\n");
    const patches = prDiff.files
      .slice(0, 5)
      .map(
        (f) =>
          `File: ${f.filename}\nStatus: ${f.status}\nPatch:\n${
            f.patch?.slice(0, 1000) || "No patch available"
          }`
      )
      .join("\n\n");

    return `Analyze this GitHub PR to determine what parts of the web application should be tested:

**PR Details:**
- Repository: ${repository}
- Title: ${prDetails.title}
- Author: ${prDetails.author}
- Description: ${prDetails.body?.slice(0, 500) || "No description"}

**Changed Files:**
${changedFiles}

**Code Changes (first 5 files):**
${patches}

Based on these changes, determine:
1. **Routes** that should be tested (URL paths like /dashboard, /settings)
2. **Components** that were modified and need testing
3. **Actions** users should perform (click, type, navigate)

Return ONLY a JSON object in this exact format:
{
  "routes": [
    {
      "path": "/dashboard",
      "name": "Dashboard",
      "rootSelector": "[data-testid='dashboard']",
      "actions": [
        {"type": "click", "selector": "[data-testid='refresh-btn']", "description": "Refresh dashboard"}
      ]
    }
  ],
  "components": [
    {
      "name": "UserProfile",
      "selector": "[data-testid='user-profile']",
      "interactions": [
        {"action": "click", "selector": "[data-testid='edit-btn']", "description": "Edit profile"}
      ]
    }
  ],
  "keyFeatures": ["user-management", "dashboard-widgets"],
  "riskLevel": "medium"
}`;
  }

  /**
   * Parse LLM response and validate
   */
  parseLLMResponse(content) {
    try {
      // Extract JSON from response (handle cases where LLM adds extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in LLM response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!parsed.routes) parsed.routes = [];
      if (!parsed.components) parsed.components = [];
      if (!parsed.keyFeatures) parsed.keyFeatures = [];
      if (!parsed.riskLevel) parsed.riskLevel = "medium";

      console.log(
        chalk.green(
          `✅ LLM identified ${parsed.routes.length} routes, ${parsed.components.length} components`
        )
      );

      return parsed;
    } catch (error) {
      throw new Error(`Failed to parse LLM response: ${error.message}`);
    }
  }

  /**
   * Fallback rules when LLM is not available
   */
  inferWithFallbackRules(prDetails, prDiff, repository) {
    console.log(chalk.cyan("🔍 Using fallback rules for scope inference..."));

    const scope = {
      routes: [],
      components: [],
      keyFeatures: [],
      riskLevel: "low",
    };

    // First, extract routes from file analysis
    const extractedRoutes = this.extractRoutesFromFiles(prDiff.files);
    scope.routes = extractedRoutes;

    // Analyze changed files for patterns
    for (const file of prDiff.files) {
      const filename = file.filename.toLowerCase();

      // Enhanced component detection patterns
      if (this.isComponentFile(filename)) {
        const componentInfo = this.extractComponentInfo(file);
        if (componentInfo) {
          scope.components.push(componentInfo);
        }
      }

      // Risk assessment
      if (
        file.status === "added" ||
        filename.includes("delete") ||
        filename.includes("remove")
      ) {
        scope.riskLevel = "high";
      } else if (
        scope.riskLevel !== "high" &&
        (filename.includes("api") || filename.includes("service"))
      ) {
        scope.riskLevel = "medium";
      }
    }

    // Default routes if none detected
    if (scope.routes.length === 0) {
      scope.routes = [
        {
          path: "/",
          name: "Home",
          rootSelector: 'main, [data-testid="app"], body',
          actions: [
            {
              type: "wait",
              selector: "body",
              description: "Wait for page load",
            },
          ],
        },
      ];
    }

    console.log(
      chalk.green(
        `✅ Fallback rules identified ${scope.routes.length} routes, ${scope.components.length} components`
      )
    );

    return scope;
  }

  /**
   * Extract route name from file path
   */
  extractRouteNameFromPath(filePath) {
    const parts = filePath.split("/");
    const filename = parts[parts.length - 1];
    const name = filename.split(".")[0];

    // Clean up common patterns
    return (
      name
        .replace(/route|page|screen|component/gi, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase() || "unknown"
    );
  }

  /**
   * Extract component name from file path
   */
  extractComponentNameFromPath(filePath) {
    const parts = filePath.split("/");
    const filename = parts[parts.length - 1];
    const name = filename.split(".")[0];

    // Clean up and capitalize
    return (
      name
        .replace(/component|modal|form/gi, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .replace(/^./, (str) => str.toUpperCase()) || "UnknownComponent"
    );
  }

  /**
   * Extract routes from changed files using multiple detection strategies
   */
  extractRoutesFromFiles(files) {
    const routes = [];
    const routeMap = new Map(); // To avoid duplicates

    for (const file of files) {
      // Strategy 1: Analyze file paths for route patterns
      const pathRoutes = this.extractRoutesFromFilePath(file.filename);
      pathRoutes.forEach((route) => {
        if (!routeMap.has(route.path)) {
          routeMap.set(route.path, route);
          routes.push(route);
        }
      });

      // Strategy 2: Analyze file content for route definitions (if available)
      if (file.patch) {
        const contentRoutes = this.extractRoutesFromContent(
          file.patch,
          file.filename
        );
        contentRoutes.forEach((route) => {
          if (!routeMap.has(route.path)) {
            routeMap.set(route.path, route);
            routes.push(route);
          }
        });
      }
    }

    // Strategy 3: Apply component-to-route mapping
    const componentRoutes = this.getRoutesForKnownPatterns(files);
    componentRoutes.forEach((route) => {
      if (!routeMap.has(route.path)) {
        routeMap.set(route.path, route);
        routes.push(route);
      }
    });

    return routes.length > 0 ? routes : this.getDefaultRoutes();
  }

  /**
   * Extract routes from file path analysis
   */
  extractRoutesFromFilePath(filePath) {
    const routes = [];
    const pathLower = filePath.toLowerCase();

    // Pattern matching for different route structures
    const routePatterns = [
      // Test Management patterns
      {
        pattern: /reports?/i,
        route: { path: "/projects/*/reports", name: "Reports" },
      },
      {
        pattern: /test.*run/i,
        route: { path: "/projects/*/test-runs", name: "Test Runs" },
      },
      {
        pattern: /dashboard/i,
        route: { path: "/dashboard", name: "Dashboard" },
      },
      { pattern: /projects?/i, route: { path: "/projects", name: "Projects" } },
      { pattern: /settings?/i, route: { path: "/settings", name: "Settings" } },

      // Extract from path structure (apps/app-name suggests routes)
      { pattern: /apps\/([^\/]+)/i, route: null }, // Will be handled specially
    ];

    for (const { pattern, route } of routePatterns) {
      if (pattern.test(pathLower) && route) {
        routes.push({
          path: route.path,
          name: route.name,
          rootSelector: `main, [data-testid="app"], [data-testid="${route.name.toLowerCase()}"]`,
          confidence: "medium",
          source: "file-path",
        });
      }
    }

    // Special handling for app structure
    const appMatch = filePath.match(/apps\/([^\/]+)/i);
    if (appMatch) {
      const appName = appMatch[1];
      // Add app-specific routes
      routes.push({
        path: "/",
        name: `${appName} Home`,
        rootSelector: 'main, [data-testid="app"], body',
        confidence: "high",
        source: "app-detection",
      });
    }

    return routes;
  }

  /**
   * Extract routes from file content (patch analysis)
   */
  extractRoutesFromContent(patch, filename) {
    const routes = [];

    // Look for React Router patterns
    const routePatterns = [
      /Route.*path=["']([^"']+)["']/gi,
      /path:\s*["']([^"']+)["']/gi,
      /route.*["']([^"']+)["']/gi,
      /navigate.*["']([^"']+)["']/gi,
    ];

    for (const pattern of routePatterns) {
      let match;
      while ((match = pattern.exec(patch)) !== null) {
        const path = match[1];
        if (path && path !== "*" && !path.includes("undefined")) {
          routes.push({
            path: path,
            name: this.pathToName(path),
            rootSelector: `main, [data-testid="app"], body`,
            confidence: "high",
            source: "content-analysis",
          });
        }
      }
    }

    return routes;
  }

  /**
   * Get routes based on known component patterns
   */
  getRoutesForKnownPatterns(files) {
    const routes = [];

    // Component-to-route mapping based on common patterns
    const componentRouteMapping = {
      TestRunDetailedReport: ["/projects/*/reports/*", "/test-runs/*/details"],
      TestRunSummaryReport: [
        "/projects/*/reports/summary",
        "/test-runs/*/summary",
      ],
      RenderReportByType: ["/projects/*/reports", "/reports"],
      TestRunDetailedCharts: [
        "/projects/*/reports/*/charts",
        "/test-runs/*/charts",
      ],
      TestRunDetailedTables: [
        "/projects/*/reports/*/tables",
        "/test-runs/*/tables",
      ],
      ProjectDashboard: ["/projects/*", "/dashboard"],
      UserSettings: ["/settings", "/profile"],
    };

    // Check if any changed files contain these components
    for (const file of files) {
      const filename = file.filename;

      for (const [componentName, routePaths] of Object.entries(
        componentRouteMapping
      )) {
        if (filename.includes(componentName)) {
          for (const routePath of routePaths) {
            routes.push({
              path: routePath,
              name: this.pathToName(routePath),
              rootSelector: `main, [data-testid="app"], body`,
              confidence: "medium",
              source: "component-mapping",
              componentName: componentName,
            });
          }
        }
      }
    }

    return routes;
  }

  /**
   * Check if file is a component file
   */
  isComponentFile(filename) {
    return (
      filename.includes("component") ||
      filename.includes("modal") ||
      filename.includes("form") ||
      filename.endsWith(".jsx") ||
      filename.endsWith(".tsx") ||
      /[A-Z][a-zA-Z]*\.js/.test(filename)
    ); // PascalCase files
  }

  /**
   * Extract enhanced component information
   */
  extractComponentInfo(file) {
    const componentName = this.extractComponentNameFromPath(file.filename);

    // Determine likely routes for this component
    const likelyRoutes = this.getRoutesForComponent(
      componentName,
      file.filename
    );

    return {
      name: componentName,
      selector: `[data-testid="${componentName.toLowerCase()}"]`,
      likelyRoutes: likelyRoutes,
      interactions: [
        {
          action: "click",
          selector: "button",
          description: `Test ${componentName} interactions`,
        },
      ],
      source: "file-analysis",
    };
  }

  /**
   * Get likely routes where a component might be used
   */
  getRoutesForComponent(componentName, filePath) {
    const routes = [];
    const nameLower = componentName.toLowerCase();

    // Pattern-based route prediction
    if (nameLower.includes("report")) {
      routes.push("/projects/*/reports", "/reports");
    }
    if (nameLower.includes("testrun") || nameLower.includes("test-run")) {
      routes.push("/projects/*/test-runs", "/test-runs");
    }
    if (nameLower.includes("dashboard")) {
      routes.push("/dashboard", "/");
    }
    if (nameLower.includes("chart") || nameLower.includes("graph")) {
      routes.push("/projects/*/reports/*/charts", "/analytics");
    }
    if (nameLower.includes("table") || nameLower.includes("list")) {
      routes.push("/projects/*/reports/*/tables", "/data");
    }

    // Extract from file path structure
    const pathParts = filePath.split("/");
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i].toLowerCase();
      if (part !== "src" && part !== "components" && part !== "features") {
        routes.push(`/${part}`);
      }
    }

    return routes.length > 0 ? routes : ["/"];
  }

  /**
   * Convert path to human-readable name
   */
  pathToName(path) {
    return (
      path
        .replace(/^\/+|\/+$/g, "") // Remove leading/trailing slashes
        .replace(/[\/\*]/g, " ") // Replace slashes and wildcards with spaces
        .replace(/\b\w/g, (l) => l.toUpperCase()) // Capitalize words
        .trim() || "Home"
    );
  }

  /**
   * Get default routes if no routes detected
   */
  getDefaultRoutes() {
    return [
      {
        path: "/",
        name: "Home",
        rootSelector: 'main, [data-testid="app"], body',
        confidence: "low",
        source: "default",
      },
    ];
  }
}
