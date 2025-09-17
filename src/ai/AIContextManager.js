import chalk from "chalk";

/**
 * Central AI knowledge repository that accumulates context across navigation
 */
export class AIContextManager {
  constructor() {
    this.prContext = null;
    this.navigationHistory = [];
    this.pageContexts = new Map(); // URL -> page context
    this.aiDecisions = [];
    this.discoveredRoutes = [];
    this.componentMappings = new Map(); // component name -> route info
    this.sessionStartTime = Date.now();
    this.interactionPatterns = [];
  }

  /**
   * Initialize with PR context
   * @param {object} prContext - PR details and changes
   */
  setPRContext(prContext) {
    this.prContext = {
      ...prContext,
      timestamp: new Date().toISOString(),
    };
    console.log(
      chalk.cyan(`🧠 AI Context initialized with PR: ${prContext.title}`)
    );
  }

  /**
   * Add navigation step to history with AI decision context
   * @param {object} navigationStep - Navigation step details
   */
  addNavigationStep(navigationStep) {
    const step = {
      ...navigationStep,
      timestamp: new Date().toISOString(),
      sessionTime: Date.now() - this.sessionStartTime,
    };

    this.navigationHistory.push(step);

    // Keep only last 20 steps to prevent memory bloat
    if (this.navigationHistory.length > 20) {
      this.navigationHistory = this.navigationHistory.slice(-20);
    }

    console.log(
      chalk.gray(`  📝 Added navigation step: ${step.action} → ${step.result}`)
    );
  }

  /**
   * Store page context for future reference
   * @param {string} url - Page URL
   * @param {object} pageContext - Page context data
   */
  addPageContext(url, pageContext) {
    const context = {
      ...pageContext,
      timestamp: new Date().toISOString(),
      visitCount: (this.pageContexts.get(url)?.visitCount || 0) + 1,
    };

    this.pageContexts.set(url, context);

    // Keep only last 10 page contexts
    if (this.pageContexts.size > 10) {
      const oldestKey = this.pageContexts.keys().next().value;
      this.pageContexts.delete(oldestKey);
    }

    console.log(chalk.gray(`  🗃️  Stored page context for: ${url}`));
  }

  /**
   * Record AI decision for learning and fallback
   * @param {object} aiDecision - AI decision details
   */
  addAIDecision(aiDecision) {
    const decision = {
      ...aiDecision,
      timestamp: new Date().toISOString(),
      sessionTime: Date.now() - this.sessionStartTime,
    };

    this.aiDecisions.push(decision);

    // Keep only last 15 decisions
    if (this.aiDecisions.length > 15) {
      this.aiDecisions = this.aiDecisions.slice(-15);
    }

    console.log(
      chalk.gray(
        `  🎯 Recorded AI decision: ${decision.action} (confidence: ${decision.confidence})`
      )
    );
  }

  /**
   * Add discovered route information
   * @param {object} routeInfo - Discovered route details
   */
  addDiscoveredRoute(routeInfo) {
    const route = {
      ...routeInfo,
      timestamp: new Date().toISOString(),
      discoveredBy: "ai-navigation",
    };

    this.discoveredRoutes.push(route);
    console.log(
      chalk.gray(`  🛣️  Discovered route: ${route.name} → ${route.url}`)
    );

    // Update component mappings if components are associated
    if (route.relevantComponents) {
      route.relevantComponents.forEach((component) => {
        this.componentMappings.set(component.name, {
          route: route,
          confidence: component.confidence || 0.8,
          method: "ai-discovery",
        });
      });
    }
  }

  /**
   * Get contextual information for AI decision making
   * @param {object} options - Query options
   * @returns {object} - Relevant context for AI
   */
  getContextForAI(options = {}) {
    const { component, currentUrl, includeHistory = true } = options;

    const context = {
      prContext: this.prContext,
      currentUrl,
      targetComponent: component,
    };

    // Add navigation history if requested
    if (includeHistory) {
      context.navigationHistory = this.navigationHistory.slice(-5); // Last 5 steps
    }

    // Add relevant page contexts
    context.currentPageContext = this.pageContexts.get(currentUrl);

    // Add similar page contexts (same domain/app)
    if (currentUrl) {
      const baseDomain = new URL(currentUrl).origin;
      context.similarPages = Array.from(this.pageContexts.entries())
        .filter(([url, ctx]) => url.startsWith(baseDomain))
        .slice(-3)
        .map(([url, ctx]) => ({ url, ...ctx }));
    }

    // Add component-specific information
    if (component) {
      const mapping = this.componentMappings.get(component.name);
      if (mapping) {
        context.knownMapping = mapping;
      }

      // Find similar components from history
      context.similarComponents = this.findSimilarComponents(component.name);
    }

    // Add recent AI decisions for learning
    context.recentDecisions = this.aiDecisions.slice(-3);

    return context;
  }

  /**
   * Find components with similar names or patterns
   * @param {string} componentName - Target component name
   * @returns {array} - Similar component mappings
   */
  findSimilarComponents(componentName) {
    const similarities = [];
    const targetLower = componentName.toLowerCase();

    this.componentMappings.forEach((mapping, name) => {
      const nameLower = name.toLowerCase();

      // Check for partial matches
      if (nameLower.includes(targetLower) || targetLower.includes(nameLower)) {
        similarities.push({
          component: name,
          mapping: mapping,
          similarityType: "partial-name-match",
        });
      }

      // Check for pattern matches (same prefix/suffix)
      const targetWords = targetLower.split(/(?=[A-Z])|[\s-_]/);
      const nameWords = nameLower.split(/(?=[A-Z])|[\s-_]/);

      const commonWords = targetWords.filter((word) =>
        nameWords.some((nWord) => nWord.includes(word) || word.includes(nWord))
      );

      if (commonWords.length > 0) {
        similarities.push({
          component: name,
          mapping: mapping,
          similarityType: "pattern-match",
          commonWords: commonWords,
        });
      }
    });

    return similarities.slice(0, 3); // Return top 3 similarities
  }

  /**
   * Record interaction pattern for learning
   * @param {object} pattern - Interaction pattern details
   */
  addInteractionPattern(pattern) {
    const interaction = {
      ...pattern,
      timestamp: new Date().toISOString(),
      sessionTime: Date.now() - this.sessionStartTime,
    };

    this.interactionPatterns.push(interaction);

    // Keep only last 25 patterns
    if (this.interactionPatterns.length > 25) {
      this.interactionPatterns = this.interactionPatterns.slice(-25);
    }

    console.log(
      chalk.gray(`  🔄 Recorded interaction pattern: ${pattern.type}`)
    );
  }

  /**
   * Get successful patterns for similar scenarios
   * @param {object} criteria - Pattern matching criteria
   * @returns {array} - Matching successful patterns
   */
  getSuccessfulPatterns(criteria) {
    return this.interactionPatterns
      .filter((pattern) => {
        // Only successful patterns
        if (pattern.success !== true) return false;

        // Match component type if specified
        if (criteria.componentType) {
          const patternType = pattern.componentType?.toLowerCase();
          const targetType = criteria.componentType.toLowerCase();
          if (
            patternType &&
            !patternType.includes(targetType) &&
            !targetType.includes(patternType)
          ) {
            return false;
          }
        }

        // Match interaction type if specified
        if (
          criteria.interactionType &&
          pattern.interactionType !== criteria.interactionType
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) // Most recent first
      .slice(0, 5); // Top 5 matches
  }

  /**
   * Clear context (for testing or reset)
   */
  clear() {
    this.navigationHistory = [];
    this.pageContexts.clear();
    this.aiDecisions = [];
    this.discoveredRoutes = [];
    this.componentMappings.clear();
    this.interactionPatterns = [];
    this.sessionStartTime = Date.now();
    console.log(chalk.cyan("🧠 AI Context cleared"));
  }

  /**
   * Get context summary for debugging
   * @returns {object} - Context summary
   */
  getSummary() {
    return {
      prTitle: this.prContext?.title || "No PR Context",
      navigationSteps: this.navigationHistory.length,
      pagesVisited: this.pageContexts.size,
      aiDecisions: this.aiDecisions.length,
      routesDiscovered: this.discoveredRoutes.length,
      componentMappings: this.componentMappings.size,
      interactionPatterns: this.interactionPatterns.length,
      sessionDuration: Date.now() - this.sessionStartTime,
    };
  }

  /**
   * Export context for persistence (future enhancement)
   * @returns {object} - Serializable context data
   */
  export() {
    return {
      prContext: this.prContext,
      navigationHistory: this.navigationHistory,
      pageContexts: Array.from(this.pageContexts.entries()),
      aiDecisions: this.aiDecisions,
      discoveredRoutes: this.discoveredRoutes,
      componentMappings: Array.from(this.componentMappings.entries()),
      interactionPatterns: this.interactionPatterns,
      sessionStartTime: this.sessionStartTime,
    };
  }

  /**
   * Import context from persistence (future enhancement)
   * @param {object} data - Context data to import
   */
  import(data) {
    this.prContext = data.prContext;
    this.navigationHistory = data.navigationHistory || [];
    this.pageContexts = new Map(data.pageContexts || []);
    this.aiDecisions = data.aiDecisions || [];
    this.discoveredRoutes = data.discoveredRoutes || [];
    this.componentMappings = new Map(data.componentMappings || []);
    this.interactionPatterns = data.interactionPatterns || [];
    this.sessionStartTime = data.sessionStartTime || Date.now();

    console.log(chalk.cyan("🧠 AI Context imported from persistence"));
  }
}
