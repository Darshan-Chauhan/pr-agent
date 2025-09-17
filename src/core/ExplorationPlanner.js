import chalk from "chalk";

/**
 * Generates intelligent exploration plans using AI-powered route discovery and step generation
 */
export class ExplorationPlanner {
  constructor() {
    this.maxSteps = parseInt(process.env.MAX_STEPS) || 20;
    this.maxDuration = parseInt(process.env.MAX_DURATION_MINUTES) || 5;
    this.useAI = process.env.DISABLE_AI !== "true"; // AI enabled by default
  }

  /**
   * Generate exploration plan from scope with intelligent navigation
   * @param {object} options - Planning options
   * @returns {object} - Exploration plan
   */
  async generatePlan(options) {
    const { scope, appUrl, maxSteps, prDetails } = options;

    console.log(chalk.cyan("📋 Generating exploration plan..."));

    const plan = {
      id: `plan-${Date.now()}`,
      timestamp: new Date().toISOString(),
      appUrl,
      maxSteps: maxSteps || this.maxSteps,
      scope,
      prDetails: {
        number: prDetails.number,
        title: prDetails.title,
        author: prDetails.author,
      },
      steps: [],
    };

    // Phase 1: Initial navigation and discovery
    let stepId = this.addInitialNavigationSteps(plan.steps, appUrl);

    // Phase 1.5: Navigate to existing project for exploration
    stepId = this.addProjectNavigationStep(plan.steps, stepId);

    // Phase 2: AI-powered route discovery (if AI enabled)
    if (this.useAI) {
      stepId = this.addAIRouteDiscoverySteps(plan.steps, stepId, scope);
      // AI will generate remaining steps dynamically after route discovery
    } else {
      stepId = this.addRouteDiscoverySteps(plan.steps, stepId, scope);
      // Phase 3: Fallback component exploration
      stepId = this.addComponentExplorationSteps(plan.steps, stepId, scope);
      // Phase 4: Fallback interaction testing
      stepId = this.addInteractionTestingSteps(
        plan.steps,
        stepId,
        scope,
        maxSteps
      );
    }

    console.log(chalk.green(`✅ Plan generated: ${plan.steps.length} steps`));

    return plan;
  }

  /**
   * Add initial navigation and app loading steps
   */
  addInitialNavigationSteps(steps, appUrl) {
    let stepId = 1;

    // Step 1: Navigate to application
    steps.push({
      id: stepId++,
      type: "navigate",
      action: "navigate",
      url: appUrl,
      description: "Navigate to application home page",
      timeout: 30000,
    });

    // Step 2: Wait for app to load
    steps.push({
      id: stepId++,
      type: "wait",
      action: "wait",
      selector: "body",
      description: "Wait for application to load",
      timeout: 10000,
    });

    return stepId;
  }

  /**
   * Add project navigation step to get into a project context
   */
  addProjectNavigationStep(steps, stepId) {
    steps.push({
      id: stepId++,
      type: "navigate-to-project",
      action: "navigate-to-project",
      description: "Navigate to existing project for testing",
      timeout: 15000,
      strategy: "find-existing-project",
    });

    return stepId;
  }

  /**
   * Add AI-powered route discovery steps
   */
  addAIRouteDiscoverySteps(steps, stepId, scope) {
    // Step 3: AI-powered comprehensive route discovery
    steps.push({
      id: stepId++,
      type: "ai-discovery",
      action: "ai-route-discovery",
      description: "AI-powered route discovery and navigation mapping",
      timeout: 30000,
      targetComponents:
        scope.detectedIssues
          ?.filter((issue) => issue.type === "component")
          ?.map((issue) => issue.component) || [],
      baseUrl: null, // Will use current URL
      artifacts: ["screenshot", "performance"],
    });

    return stepId;
  }

  /**
   * Add intelligent route discovery steps (fallback)
   */
  addRouteDiscoverySteps(steps, stepId, scope) {
    // Step 3: Analyze landing page for navigation patterns
    steps.push({
      id: stepId++,
      type: "discover-navigation",
      action: "discover",
      description: "Analyze page for navigation elements and project links",
      timeout: 5000,
      strategy: "landing-page-analysis",
    });

    // Step 4: Navigate to projects (if project-based app detected)
    steps.push({
      id: stepId++,
      type: "navigate-to-projects",
      action: "navigate-to-projects",
      description: "Navigate to projects section",
      timeout: 15000,
      strategy: "project-discovery",
      selectors: [
        'a[href*="project"]',
        'tr[data-testid*="project"] a',
        ".project-card a",
        '[data-testid*="project-link"]',
      ],
    });

    // Step 5: Discover sidebar navigation
    steps.push({
      id: stepId++,
      type: "discover-sidebar",
      action: "discover",
      description: "Analyze sidebar/navigation for relevant routes",
      timeout: 5000,
      strategy: "sidebar-analysis",
      targetComponents: scope.components || [],
    });

    return stepId;
  }

  /**
   * Add AI-enhanced component exploration steps
   */
  addAIComponentExplorationSteps(steps, stepId, scope) {
    const components = scope.components || [];

    for (const component of components) {
      // AI-powered navigation to component route
      steps.push({
        id: stepId++,
        type: "ai-navigation",
        action: "ai-navigate",
        description: `AI navigate to ${component.name} component`,
        timeout: 20000,
        component: component,
        target: component,
        artifacts: ["screenshot", "performance"],
      });

      // AI-powered component discovery and analysis
      steps.push({
        id: stepId++,
        type: "ai-component-discovery",
        action: "ai-discover",
        description: `AI discover and analyze ${component.name}`,
        timeout: 15000,
        component: component,
        target: component,
        artifacts: ["screenshot", "dom"],
      });

      // AI-powered interaction testing
      steps.push({
        id: stepId++,
        type: "ai-interaction-testing",
        action: "ai-test",
        description: `AI test interactions for ${component.name}`,
        timeout: 20000,
        component: component,
        target: component,
        artifacts: ["screenshot", "console", "performance"],
      });

      // AI-generated dynamic steps based on component analysis
      steps.push({
        id: stepId++,
        type: "ai-dynamic-steps",
        action: "ai-generate-steps",
        description: `AI generate component-specific test steps for ${component.name}`,
        timeout: 30000,
        component: component,
        target: component,
        stepType: "component-specific",
        maxSteps: 3,
        executeImmediately: true,
        artifacts: ["screenshot"],
      });
    }

    return stepId;
  }

  /**
   * Add dynamic component exploration steps (fallback)
   */
  addComponentExplorationSteps(steps, stepId, scope) {
    const components = scope.components || [];

    // Instead of hardcoding component selectors, let's explore dynamically
    for (const component of components) {
      // Navigate to relevant route for this component
      steps.push({
        id: stepId++,
        type: "navigate-for-component",
        action: "navigate-for-component",
        description: `Navigate to route containing ${component.name}`,
        timeout: 15000,
        component: component,
        strategy: "component-route-mapping",
      });

      // Dynamically discover component on page instead of hardcoded selector
      steps.push({
        id: stepId++,
        type: "discover-component",
        action: "discover",
        description: `Discover ${component.name} component on page`,
        timeout: 10000,
        component: component,
        strategy: "dynamic-component-discovery",
      });

      // Take screenshot after discovering component
      steps.push({
        id: stepId++,
        type: "screenshot",
        action: "screenshot",
        description: `Capture page state for ${component.name}`,
        context: component.name,
      });

      // Test dynamic interactions based on what's actually found
      steps.push({
        id: stepId++,
        type: "test-dynamic-interactions",
        action: "test",
        description: `Test interactions related to ${component.name}`,
        timeout: 10000,
        component: component,
        strategy: "dynamic-interaction-testing",
      });
    }

    return stepId;
  }

  /**
   * Add AI-powered dynamic testing steps
   */
  addAIDynamicTestingSteps(steps, stepId, scope, maxSteps) {
    const remainingSteps = maxSteps - steps.length;

    if (remainingSteps > 3) {
      // AI-powered workflow testing based on PR changes
      steps.push({
        id: stepId++,
        type: "ai-workflow-testing",
        action: "ai-generate-steps",
        description: "AI generate workflow-based testing steps",
        timeout: 30000,
        stepType: "workflow-testing",
        maxSteps: Math.min(remainingSteps - 2, 5),
        executeImmediately: true,
        artifacts: ["screenshot", "performance", "console"],
      });

      // AI-powered edge case detection and testing
      steps.push({
        id: stepId++,
        type: "ai-edge-case-testing",
        action: "ai-generate-steps",
        description: "AI generate edge case testing steps",
        timeout: 25000,
        stepType: "edge-case-testing",
        maxSteps: Math.min(remainingSteps - 1, 3),
        executeImmediately: true,
        artifacts: ["screenshot", "console"],
      });

      // Final comprehensive AI analysis
      steps.push({
        id: stepId++,
        type: "ai-final-analysis",
        action: "ai-test",
        description: "AI comprehensive final analysis and testing",
        timeout: 20000,
        artifacts: ["screenshot", "performance", "dom", "console"],
      });
    }

    return stepId;
  }

  /**
   * Add interaction testing and edge case steps (fallback)
   */
  addInteractionTestingSteps(steps, stepId, scope, maxSteps) {
    // Add general interaction testing for discovered routes
    const remainingSteps = maxSteps - steps.length;

    if (remainingSteps > 2) {
      // Test common UI patterns
      steps.push({
        id: stepId++,
        type: "test-interactions",
        action: "test",
        description: "Test common UI interactions",
        timeout: 10000,
        patterns: ["buttons", "links", "forms", "dropdowns"],
      });

      // Final state capture
      steps.push({
        id: stepId++,
        type: "screenshot",
        action: "screenshot",
        description: "Final application state capture",
      });
    }

    return stepId;
  }
}
