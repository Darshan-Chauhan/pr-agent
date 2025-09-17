import chalk from "chalk";
import { OllamaClient } from "./OllamaClient.js";

/**
 * AI-powered step generation service that creates dynamic exploration steps
 */
export class AIStepGenerator {
  constructor(contextManager, options = {}) {
    this.contextManager = contextManager;
    this.ollamaClient = new OllamaClient(options.ollama);
    this.maxStepsPerGeneration = options.maxSteps || 5;
    this.confidenceThreshold = options.confidenceThreshold || 0.6;
  }

  /**
   * Generate intelligent exploration steps based on current context
   * @param {object} options - Step generation options
   * @returns {Promise<array>} - Generated steps
   */
  async generateSteps(options = {}) {
    const {
      currentUrl,
      targetComponent,
      pageContext,
      navigationHistory,
      stepType = "exploration",
      maxSteps = this.maxStepsPerGeneration,
    } = options;

    console.log(
      chalk.cyan(
        `🧠 AI generating ${stepType} steps for ${
          targetComponent?.name || "current page"
        }...`
      )
    );

    try {
      const aiContext = this.contextManager.getContextForAI({
        component: targetComponent,
        currentUrl,
        includeHistory: true,
      });

      const steps = await this.generateStepsWithAI(
        stepType,
        aiContext,
        pageContext,
        navigationHistory,
        maxSteps
      );

      console.log(
        chalk.green(`✅ AI generated ${steps.length} intelligent steps`)
      );
      return steps;
    } catch (error) {
      console.log(
        chalk.yellow(`⚠️  AI step generation failed: ${error.message}`)
      );
      return this.generateFallbackSteps(options);
    }
  }

  /**
   * Generate steps using AI analysis
   * @param {string} stepType - Type of steps to generate
   * @param {object} aiContext - AI context from context manager
   * @param {object} pageContext - Current page context
   * @param {array} navigationHistory - Navigation history
   * @param {number} maxSteps - Maximum steps to generate
   * @returns {Promise<array>} - AI-generated steps
   */
  async generateStepsWithAI(
    stepType,
    aiContext,
    pageContext,
    navigationHistory,
    maxSteps
  ) {
    const prompt = this.buildStepGenerationPrompt(
      stepType,
      aiContext,
      pageContext,
      navigationHistory,
      maxSteps
    );

    const aiResponse = await this.ollamaClient.query(prompt, {
      temperature: 0.2, // Low temperature for consistent step generation
      num_predict: 800, // Allow longer responses for detailed steps
    });

    if (aiResponse.success && aiResponse.data.steps) {
      const generatedSteps = this.processAIGeneratedSteps(
        aiResponse.data.steps,
        aiContext
      );

      // Record successful step generation pattern
      this.contextManager.addInteractionPattern({
        type: "step-generation",
        stepType,
        success: true,
        stepsGenerated: generatedSteps.length,
        confidence: aiResponse.data.confidence,
        componentType: aiContext.targetComponent?.name || "unknown",
      });

      return generatedSteps;
    }

    throw new Error("AI failed to generate valid steps");
  }

  /**
   * Process AI-generated steps and enhance with context
   * @param {array} aiSteps - Steps from AI
   * @param {object} aiContext - AI context
   * @returns {array} - Processed steps
   */
  processAIGeneratedSteps(aiSteps, aiContext) {
    const processedSteps = [];
    let stepId = 1;

    for (const aiStep of aiSteps) {
      // Skip low-confidence steps
      if (aiStep.confidence && aiStep.confidence < this.confidenceThreshold) {
        console.log(
          chalk.gray(
            `  ⚠️  Skipping low confidence step: ${aiStep.description}`
          )
        );
        continue;
      }

      const step = {
        id: `ai-step-${Date.now()}-${stepId}`,
        type: "ai-generated",
        action: this.normalizeAction(aiStep.action),
        description: aiStep.description,
        selector: aiStep.selector,
        value: aiStep.value,
        timeout: aiStep.timeout || 5000,
        optional: aiStep.optional || false,
        waitAfter: aiStep.waitAfter || 1000,
        artifacts: this.determineArtifacts(aiStep),
        metadata: {
          aiReasoning: aiStep.reasoning,
          aiConfidence: aiStep.confidence,
          aiPriority: aiStep.priority,
          expectedOutcome: aiStep.expectedOutcome,
          generatedBy: "ai-step-generator",
          component: aiContext.targetComponent?.name,
        },
      };

      processedSteps.push(step);
      stepId++;
    }

    return processedSteps;
  }

  /**
   * Normalize AI action names to system-supported actions
   * @param {string} aiAction - Action name from AI
   * @returns {string} - Normalized action name
   */
  normalizeAction(aiAction) {
    const actionMap = {
      click: "click",
      type: "type",
      input: "type",
      wait: "wait",
      screenshot: "screenshot",
      scroll: "scroll",
      hover: "hover",
      "test-interaction": "test-dynamic-interactions",
      "test-interactions": "test-dynamic-interactions",
      "discover-component": "discover-component",
      navigate: "navigate",
      "ai-navigate": "ai-navigate", // New AI action
      "ai-discover": "ai-discover", // New AI action
      "ai-test": "ai-test", // New AI action
    };

    return actionMap[aiAction.toLowerCase()] || aiAction;
  }

  /**
   * Determine what artifacts to capture for a step
   * @param {object} aiStep - AI-generated step
   * @returns {array} - Artifact types to capture
   */
  determineArtifacts(aiStep) {
    const artifacts = [];

    // Always capture screenshots for visual verification
    if (aiStep.action === "click" || aiStep.action === "navigate") {
      artifacts.push("screenshot");
    }

    // Capture performance for navigation steps
    if (aiStep.action === "navigate" || aiStep.action === "ai-navigate") {
      artifacts.push("performance");
    }

    // Capture DOM for component discovery
    if (
      aiStep.action === "discover-component" ||
      aiStep.action === "ai-discover"
    ) {
      artifacts.push("dom");
    }

    // Capture console for interaction testing
    if (aiStep.action.includes("test") || aiStep.action === "ai-test") {
      artifacts.push("console");
    }

    return artifacts;
  }

  /**
   * Build comprehensive step generation prompt
   * @param {string} stepType - Type of steps to generate
   * @param {object} aiContext - AI context
   * @param {object} pageContext - Page context
   * @param {array} navigationHistory - Navigation history
   * @param {number} maxSteps - Maximum steps to generate
   * @returns {string} - Formatted prompt
   */
  buildStepGenerationPrompt(
    stepType,
    aiContext,
    pageContext,
    navigationHistory,
    maxSteps
  ) {
    const prInfo = aiContext.prContext
      ? `
PR Changes Context:
- Title: ${aiContext.prContext.title}
- Changed Files: ${
          aiContext.prContext.changedFiles?.map((f) => f.filename).join(", ") ||
          "None"
        }
- Changed Components: ${
          aiContext.prContext.components?.map((c) => c.name).join(", ") ||
          "None"
        }
- Branch: ${aiContext.prContext.branch || "unknown"}
`
      : "";

    const historyInfo =
      navigationHistory?.length > 0
        ? `
Recent Navigation History:
${navigationHistory
  .slice(-5)
  .map(
    (step, i) =>
      `${i + 1}. ${step.action} → ${step.status || step.result} (${
        step.description
      })`
  )
  .join("\n")}
`
        : "";

    const componentInfo = aiContext.targetComponent
      ? `
Target Component: ${aiContext.targetComponent.name}
Component File: ${aiContext.targetComponent.file || "Unknown"}
Component Type: ${this.ollamaClient.getComponentTypeHint(
          aiContext.targetComponent.name
        )}
`
      : "";

    const successPatternsInfo = aiContext.targetComponent
      ? this.getSuccessfulPatternsPrompt(aiContext.targetComponent)
      : "";

    return `You are an intelligent test step generator. Generate the next ${maxSteps} testing steps based on the current context and PR changes.

${prInfo}
${componentInfo}
${historyInfo}
${successPatternsInfo}

Current Page Context:
- URL: ${aiContext.currentUrl || pageContext?.url || "unknown"}
- Title: ${pageContext?.title || "Unknown"}
- Available Interactive Elements:
${
  pageContext?.clickableElements
    ?.slice(0, 15)
    .map(
      (el, i) =>
        `  ${i + 1}. ${el.tag} - "${el.text}" (class: ${el.className}, id: ${
          el.id
        }, data-testid: ${el.dataTestId})`
    )
    .join("\n") || "  No elements available"
}

Step Generation Type: ${stepType}

Task: Generate ${maxSteps} intelligent next steps focusing on:
1. Component-specific interactions related to PR changes
2. Critical user workflows that might be affected
3. Edge cases and error scenarios
4. Regression testing for changed functionality
5. Performance and accessibility validation

Available Actions:
- click: Click on elements (buttons, links, etc.)
- type: Enter text in input fields
- wait: Wait for elements or conditions
- screenshot: Capture visual state
- scroll: Scroll page or elements
- hover: Hover over elements
- ai-navigate: AI-powered navigation decision
- ai-discover: AI-powered component discovery
- ai-test: AI-powered interaction testing

Respond in JSON format:
{
  "steps": [
    {
      "action": "click|type|wait|screenshot|scroll|hover|ai-navigate|ai-discover|ai-test",
      "description": "Clear, actionable description of what this step does",
      "selector": "CSS selector (required for click, type, hover actions)",
      "value": "text value (required for type actions)",
      "timeout": 5000,
      "optional": true/false,
      "waitAfter": 1000,
      "reasoning": "Detailed explanation of why this step is important for testing",
      "priority": "high|medium|low",
      "confidence": 0.0-1.0,
      "expectedOutcome": "What should happen when this step executes",
      "component": "component name if this step tests specific component"
    }
  ],
  "reasoning": "Overall strategy and reasoning for this sequence of steps",
  "confidence": 0.0-1.0,
  "testingObjective": "What these steps are designed to validate or test"
}

Prioritize:
- High-impact interactions related to PR changes
- Common user workflows
- Error boundary testing
- Performance-critical operations
- Accessibility compliance`;
  }

  /**
   * Get successful patterns prompt section
   * @param {object} component - Target component
   * @returns {string} - Successful patterns section
   */
  getSuccessfulPatternsPrompt(component) {
    const patterns = this.contextManager.getSuccessfulPatterns({
      componentType: this.ollamaClient.getComponentTypeHint(component.name),
      interactionType: "navigation",
    });

    if (patterns.length === 0) {
      return "";
    }

    return `
Successful Patterns from Previous Sessions:
${patterns
  .map(
    (pattern, i) =>
      `${i + 1}. ${pattern.type}: ${pattern.description} (success rate: ${
        pattern.successRate || "unknown"
      })`
  )
  .join("\n")}
`;
  }

  /**
   * Generate fallback steps when AI fails
   * @param {object} options - Original options
   * @returns {array} - Fallback steps
   */
  generateFallbackSteps(options) {
    console.log(chalk.gray("  🔄 Generating fallback steps..."));

    const { currentUrl, targetComponent, pageContext } = options;
    const fallbackSteps = [];

    // Basic screenshot step
    fallbackSteps.push({
      id: `fallback-screenshot-${Date.now()}`,
      type: "fallback",
      action: "screenshot",
      description: `Take screenshot of ${
        targetComponent?.name || "current page"
      }`,
      artifacts: ["screenshot"],
      optional: true,
      metadata: {
        generatedBy: "fallback-generator",
        reason: "ai-generation-failed",
      },
    });

    // Basic interaction testing if elements are available
    if (pageContext?.clickableElements?.length > 0) {
      fallbackSteps.push({
        id: `fallback-test-${Date.now()}`,
        type: "fallback",
        action: "test-dynamic-interactions",
        description: `Test interactions for ${
          targetComponent?.name || "page elements"
        }`,
        component: targetComponent,
        optional: true,
        artifacts: ["console", "screenshot"],
        metadata: {
          generatedBy: "fallback-generator",
          reason: "ai-generation-failed",
        },
      });
    }

    // Component discovery if we have a target component
    if (targetComponent) {
      fallbackSteps.push({
        id: `fallback-discover-${Date.now()}`,
        type: "fallback",
        action: "discover-component",
        description: `Discover ${targetComponent.name} component`,
        component: targetComponent,
        optional: true,
        artifacts: ["dom"],
        metadata: {
          generatedBy: "fallback-generator",
          reason: "ai-generation-failed",
        },
      });
    }

    console.log(
      chalk.gray(`  Generated ${fallbackSteps.length} fallback steps`)
    );
    return fallbackSteps;
  }

  /**
   * Generate component-specific testing steps
   * @param {object} component - Component to generate steps for
   * @param {object} pageContext - Current page context
   * @returns {Promise<array>} - Component-specific steps
   */
  async generateComponentSteps(component, pageContext) {
    console.log(
      chalk.blue(
        `🎯 Generating component-specific steps for: ${component.name}`
      )
    );

    const componentPrompt = `Generate specific testing steps for the "${
      component.name
    }" component.

Component Details:
- Name: ${component.name}
- File: ${component.file || "Unknown"}
- Type: ${this.ollamaClient.getComponentTypeHint(component.name)}

Current Page Context:
- URL: ${pageContext.url}
- Title: ${pageContext.title}

Generate 3-5 steps that specifically test this component's functionality, focusing on:
1. Component rendering and visibility
2. User interactions specific to this component
3. Data flow and state changes
4. Error handling within the component
5. Performance characteristics

Respond in JSON format with steps array following the same format as previous examples.`;

    try {
      const response = await this.ollamaClient.query(componentPrompt);
      if (response.success && response.data.steps) {
        return this.processAIGeneratedSteps(response.data.steps, {
          targetComponent: component,
        });
      }
    } catch (error) {
      console.log(
        chalk.yellow(
          `  ⚠️  Component-specific step generation failed: ${error.message}`
        )
      );
    }

    return this.generateFallbackSteps({
      targetComponent: component,
      pageContext,
    });
  }

  /**
   * Generate workflow-based testing steps
   * @param {string} workflow - Workflow type (e.g., "user-registration", "report-generation")
   * @param {object} context - Workflow context
   * @returns {Promise<array>} - Workflow steps
   */
  async generateWorkflowSteps(workflow, context) {
    console.log(chalk.blue(`🔄 Generating workflow steps for: ${workflow}`));

    const workflowPrompt = `Generate testing steps for the "${workflow}" user workflow.

Workflow Context:
${Object.entries(context)
  .map(([key, value]) => `- ${key}: ${value}`)
  .join("\n")}

Generate a sequence of steps that tests the complete user workflow from start to finish, including:
1. Initial setup/navigation steps
2. Main workflow actions
3. Verification steps
4. Error scenarios and edge cases
5. Cleanup/reset steps

Focus on realistic user behavior and common failure points.

Respond in JSON format with a comprehensive steps array.`;

    try {
      const response = await this.ollamaClient.query(workflowPrompt);
      if (response.success && response.data.steps) {
        return this.processAIGeneratedSteps(response.data.steps, context);
      }
    } catch (error) {
      console.log(
        chalk.yellow(`  ⚠️  Workflow step generation failed: ${error.message}`)
      );
    }

    return [];
  }

  /**
   * Check if AI service is ready for step generation
   * @returns {Promise<boolean>} - AI readiness status
   */
  async isAIReady() {
    try {
      return await this.ollamaClient.isAvailable();
    } catch (error) {
      return false;
    }
  }
}
