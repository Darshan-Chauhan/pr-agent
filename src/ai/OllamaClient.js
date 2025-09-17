import axios from "axios";
import chalk from "chalk";

/**
 * Centralized client for Ollama AI API communication
 */
export class OllamaClient {
  constructor(options = {}) {
    this.ollamaUrl =
      options.ollamaUrl || process.env.OLLAMA_URL || "http://127.0.0.1:11434";
    this.model = options.model || process.env.OLLAMA_MODEL || "gemma3:4b";
    this.defaultOptions = {
      temperature: 0.1, // Low temperature for more deterministic responses
      num_predict: 500,
      top_p: 0.9,
      ...options.modelOptions,
    };
    this.timeout = options.timeout || 30000;
  }

  /**
   * Query Ollama with a prompt and get structured response
   * @param {string} prompt - The prompt to send to AI
   * @param {object} options - Override options for this request
   * @returns {Promise<object>} - Parsed AI response
   */
  async query(prompt, options = {}) {
    try {
      console.log(chalk.gray(`  🤖 Querying AI: ${prompt}`));

      const requestOptions = {
        ...this.defaultOptions,
        ...options,
      };

      const response = await axios.post(
        `${this.ollamaUrl}/api/generate`,
        {
          model: this.model,
          prompt: prompt,
          stream: false,
          options: {
            ...requestOptions,
            num_predict: 400, // Balanced response length
            temperature: 0.2, // Low temperature for focused responses
          },
        },
        {
          timeout: this.timeout,
        }
      );

      const aiResponse = response.data.response;
      console.log(chalk.gray(`  🎯 AI Response: ${aiResponse}`));

      return this.parseAIResponse(aiResponse);
    } catch (error) {
      console.log(chalk.yellow(`  ⚠️  AI query failed: ${error.message}`));
      throw new Error(`Ollama query failed: ${error.message}`);
    }
  }

  /**
   * Parse AI response and extract JSON data
   * @param {string} response - Raw AI response
   * @returns {object} - Parsed response object
   */
  parseAIResponse(response) {
    try {
      // Extract JSON from markdown code blocks if present
      const codeBlockMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      let cleanResponse;
      if (codeBlockMatch) {
        cleanResponse = codeBlockMatch[1].trim();
      } else {
        // Remove any remaining markdown markers
        cleanResponse = response.replace(/```json\s*|\s*```/g, "").trim();
      }

      // Find JSON structure - look for outermost braces
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];

        // Find the first complete JSON object by balancing braces
        let braceCount = 0;
        let jsonEnd = -1;
        for (let i = 0; i < jsonStr.length; i++) {
          if (jsonStr[i] === "{") braceCount++;
          if (jsonStr[i] === "}") braceCount--;
          if (braceCount === 0) {
            jsonEnd = i;
            break;
          }
        }

        if (jsonEnd > 0) {
          jsonStr = jsonStr.substring(0, jsonEnd + 1);
        }

        // Handle incomplete arrays - close them properly
        if (jsonStr.includes("[") && !jsonStr.includes("]")) {
          // Count array brackets to balance them
          let arrayDepth =
            (jsonStr.match(/\[/g) || []).length -
            (jsonStr.match(/\]/g) || []).length;
          jsonStr = jsonStr.replace(/,\s*$/, "") + "]".repeat(arrayDepth);
        }

        // Handle incomplete objects in arrays
        if (jsonStr.includes('"primaryActions"') && !jsonStr.includes("}]")) {
          jsonStr = jsonStr.replace(/,?\s*$/, "") + "}]";
        }

        // Try parsing the cleaned JSON
        const parsed = JSON.parse(jsonStr);
        return {
          success: true,
          data: parsed,
          rawResponse: response,
        };
      }

      // If no JSON found, return text analysis
      return {
        success: false,
        data: null,
        rawResponse: response,
        error: "No JSON structure found in response",
      };
    } catch (error) {
      console.log(
        chalk.gray(`  Failed to parse AI response: ${error.message}`)
      );

      // Try alternative parsing strategies for truncated responses
      try {
        // Extract partial data for fallback
        const partialMatch = response.match(
          /\{[^}]*"pageType"\s*:\s*"([^"]+)"/
        );
        if (partialMatch) {
          return {
            success: true,
            data: { pageType: partialMatch[1], primaryActions: [] },
            rawResponse: response,
            partial: true,
          };
        }
      } catch (fallbackError) {
        // Ignore fallback errors
      }

      return {
        success: false,
        data: null,
        rawResponse: response,
        error: `JSON parsing failed: ${error.message}`,
      };
    }
  }

  /**
   * Check if Ollama service is available
   * @returns {Promise<boolean>} - Service availability
   */
  async isAvailable() {
    try {
      const response = await axios.get(`${this.ollamaUrl}/api/tags`, {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      console.log(
        chalk.yellow(`  ⚠️  Ollama service not available: ${error.message}`)
      );
      return false;
    }
  }

  /**
   * Get available models from Ollama
   * @returns {Promise<array>} - List of available models
   */
  async getAvailableModels() {
    try {
      const response = await axios.get(`${this.ollamaUrl}/api/tags`);
      return response.data.models || [];
    } catch (error) {
      console.log(
        chalk.yellow(`  ⚠️  Could not fetch available models: ${error.message}`)
      );
      return [];
    }
  }

  /**
   * Build a structured navigation prompt for AI
   * @param {object} component - Target component
   * @param {object} pageContext - Current page context
   * @param {object} prContext - PR context
   * @param {array} navigationHistory - Previous navigation decisions
   * @returns {string} - Formatted prompt for AI
   */
  buildNavigationPrompt(
    component,
    pageContext,
    prContext = null,
    navigationHistory = []
  ) {
    const prInfo = prContext
      ? `
PR Changes Context:
- Title: ${prContext.title}
- Files Changed: ${prContext.changedFiles?.map((f) => f.filename).join(", ")}
- Key Components: ${prContext.components?.map((c) => c.name).join(", ")}
- Branch: ${prContext.branch}
`
      : "";

    const historyInfo =
      navigationHistory.length > 0
        ? `
Previous Navigation History:
${navigationHistory
  .slice(-3)
  .map(
    (nav, i) =>
      `${i + 1}. ${nav.action} → ${nav.result} (confidence: ${nav.confidence})`
  )
  .join("\n")}
`
        : "";

    return `You are an intelligent web navigation assistant. I need to find and click the right element to navigate to a specific component.

${prInfo}
${historyInfo}

Current Page Context:
- URL: ${pageContext.url}
- Title: ${pageContext.title}
- Main headings: ${pageContext.headings?.join(", ") || "None"}

Target Component: ${component.name}
Component Type: ${this.getComponentTypeHint(component.name)}
Component File: ${component.file || "Unknown"}

Available Clickable Elements:
${
  pageContext.clickableElements
    ?.map(
      (el, i) =>
        `${i + 1}. ${el.tag} - "${el.text}" (class: ${el.className}, id: ${
          el.id
        }, data-testid: ${el.dataTestId})`
    )
    .join("\n") || "No elements found"
}

Task: Analyze the available elements and determine which one is most likely to lead to the "${
      component.name
    }" component.

Consider:
1. Component name similarity to element text
2. Data attributes that might indicate functionality
3. Class names that suggest component relationships
4. Previous navigation patterns from history
5. PR context - what files/components were changed

Respond in JSON format:
{
  "shouldClick": true/false,
  "elementIndex": number (1-based index from the list above, or 0 if none),
  "elementText": "text of the element to click",
  "selector": "CSS selector for the element",
  "reasoning": "detailed explanation of why this element was chosen",
  "confidence": 0.0-1.0,
  "alternativeElements": [
    {"index": number, "text": "text", "reasoning": "why it's an alternative"}
  ],
  "nextSteps": [
    {"action": "action type", "description": "what to do next", "priority": "high/medium/low"}
  ]
}

If no suitable element is found, set shouldClick to false and explain why in reasoning.`;
  }

  /**
   * Get component type hint for better AI understanding
   * @param {string} componentName - Name of the component
   * @returns {string} - Component type description
   */
  getComponentTypeHint(componentName) {
    const name = componentName.toLowerCase();
    if (name.includes("report")) return "Report/Dashboard component";
    if (name.includes("chart")) return "Data visualization component";
    if (name.includes("table")) return "Data table component";
    if (name.includes("test")) return "Test execution/results component";
    if (name.includes("detail")) return "Detailed view component";
    if (name.includes("summary")) return "Summary/overview component";
    if (name.includes("form")) return "Form/Input component";
    if (name.includes("modal")) return "Modal/Dialog component";
    if (name.includes("navigation")) return "Navigation/Menu component";
    if (name.includes("sidebar")) return "Sidebar/Panel component";
    return "UI component";
  }

  /**
   * Build step generation prompt for AI
   * @param {object} context - Current context including page, PR, and component info
   * @returns {string} - Formatted prompt for step generation
   */
  buildStepGenerationPrompt(context) {
    const { pageContext, prContext, component, navigationHistory, currentUrl } =
      context;

    return `You are an intelligent test step generator. Based on the current page context and PR changes, generate the next testing steps.

PR Context:
- Title: ${prContext?.title || "Unknown"}
- Changed Files: ${
      prContext?.changedFiles?.map((f) => f.filename).join(", ") || "None"
    }
- Components: ${prContext?.components?.map((c) => c.name).join(", ") || "None"}

Current Page:
- URL: ${currentUrl}
- Title: ${pageContext?.title || "Unknown"}
- Target Component: ${component?.name || "None"}

Previous Steps Completed:
${
  navigationHistory
    ?.slice(-5)
    .map(
      (step, i) =>
        `${i + 1}. ${step.action} → ${step.status} (${step.description})`
    )
    .join("\n") || "None"
}

Available Interactive Elements:
${
  pageContext?.clickableElements
    ?.slice(0, 10)
    .map((el, i) => `${i + 1}. ${el.tag} - "${el.text}" (${el.className})`)
    .join("\n") || "None"
}

Task: Generate 3-5 intelligent next steps for testing this page, focusing on:
1. Component-specific interactions
2. Edge cases related to PR changes
3. User workflow validation
4. Error scenarios

Respond in JSON format:
{
  "steps": [
    {
      "id": "step-unique-id",
      "action": "click|type|wait|screenshot|test-interaction",
      "description": "Human readable description",
      "selector": "CSS selector if applicable",
      "value": "text value if applicable",
      "timeout": 5000,
      "optional": true/false,
      "reasoning": "why this step is important",
      "priority": "high|medium|low",
      "expectedOutcome": "what should happen"
    }
  ],
  "reasoning": "overall strategy for these steps",
  "confidence": 0.0-1.0
}`;
  }
}
