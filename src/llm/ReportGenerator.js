import axios from "axios";
import fetch from "node-fetch";
import chalk from "chalk";

/**
 * Progress tracker for real-time updates
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
      this.displayProgress();
    }
  }

  displayProgress() {
    console.clear();
    console.log(chalk.blue.bold("🚀 PR-Aware Exploration Progress\n"));

    const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(chalk.gray(`⏱️  Total Time: ${totalTime}s\n`));

    this.steps.forEach((step, index) => {
      const icons = {
        pending: "⏳",
        running: "🔄",
        completed: "✅",
        failed: "❌",
      };

      const colors = {
        pending: chalk.gray,
        running: chalk.yellow,
        completed: chalk.green,
        failed: chalk.red,
      };

      const duration = step.startTime
        ? `(${((step.endTime || Date.now()) - step.startTime) / 1000}s)`
        : "";

      console.log(
        colors[step.status](`${icons[step.status]} ${step.name} ${duration}`)
      );

      if (step.status === "running") {
        console.log(chalk.cyan(`   └── ${step.description}`));
      }
    });

    const completed = this.steps.filter((s) => s.status === "completed").length;
    const progress = ((completed / this.steps.length) * 100).toFixed(1);

    console.log(
      chalk.blue(
        `\n📊 Progress: ${completed}/${this.steps.length} (${progress}%)`
      )
    );
  }
}

/**
 * Enhanced artifact viewer for better debugging
 */
class ArtifactViewer {
  static displayArtifactSummary(artifacts) {
    if (!artifacts || Object.keys(artifacts).length === 0) {
      console.log(chalk.gray("📁 No artifacts generated"));
      return;
    }

    console.log(chalk.cyan("📁 Generated Artifacts:"));
    console.log(chalk.gray("─".repeat(50)));

    Object.entries(artifacts).forEach(([type, items]) => {
      if (Array.isArray(items) && items.length > 0) {
        console.log(
          chalk.blue(`📎 ${type.toUpperCase()}: ${items.length} files`)
        );
        items.slice(0, 3).forEach((item) => {
          console.log(chalk.gray(`   └── ${item.name || item.path || item}`));
        });
        if (items.length > 3) {
          console.log(chalk.gray(`   └── ... and ${items.length - 3} more`));
        }
      }
    });

    console.log(
      chalk.yellow("💡 View artifacts in the ./artifacts/ directory")
    );
  }

  static generateArtifactHTML(artifacts, prDetails) {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>PR ${prDetails.number} - Exploration Artifacts</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { background: #fff; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .artifact-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .artifact-card { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .screenshot { max-width: 100%; border-radius: 4px; }
        .timestamp { color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🤖 PR ${prDetails.number} Exploration Results</h1>
        <p><strong>Title:</strong> ${prDetails.title}</p>
        <p><strong>Author:</strong> ${prDetails.author}</p>
        <p class="timestamp">Generated: ${new Date().toLocaleString()}</p>
    </div>
    <div class="artifact-grid">
        ${Object.entries(artifacts)
          .map(
            ([type, items]) => `
            <div class="artifact-card">
                <h3>📎 ${type.toUpperCase()}</h3>
                ${
                  Array.isArray(items)
                    ? items
                        .map(
                          (item) => `
                    <div>
                        ${
                          type === "screenshots"
                            ? `<img src="${item.path}" alt="${item.name}" class="screenshot" />`
                            : `<p>${item.name || item.path || item}</p>`
                        }
                    </div>
                `
                        )
                        .join("")
                    : "<p>No items</p>"
                }
            </div>
        `
          )
          .join("")}
    </div>
</body>
</html>`;
    return html;
  }
}

/**
 * Generates human-readable reports using LLM
 */
export class ReportGenerator {
  constructor() {
    this.ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
    this.model = process.env.OLLAMA_MODEL || "gemma3:4b";
    this.timeout = parseInt(process.env.OLLAMA_TIMEOUT) || 30000;
  }

  /**
   * Calculate intelligent risk score
   */
  calculateRiskScore(detectedIssues, prDetails, executionResults) {
    let riskScore = 0;
    let riskFactors = [];

    // Issue severity scoring
    if (detectedIssues) {
      const errorCount = detectedIssues.filter(
        (i) => i.severity === "error"
      ).length;
      const warningCount = detectedIssues.filter(
        (i) => i.severity === "warning"
      ).length;

      riskScore += errorCount * 10;
      riskScore += warningCount * 5;

      if (errorCount > 0) riskFactors.push(`${errorCount} critical errors`);
      if (warningCount > 3)
        riskFactors.push(`High warning count (${warningCount})`);
    }

    // Execution success rate
    const successRate = executionResults?.successRate || 0;
    if (successRate < 50) {
      riskScore += 15;
      riskFactors.push("Low execution success rate");
    }

    // PR characteristics
    const titleRiskyWords = ["urgent", "hotfix", "critical", "emergency"];
    if (
      titleRiskyWords.some((word) =>
        prDetails.title?.toLowerCase().includes(word)
      )
    ) {
      riskScore += 10;
      riskFactors.push("Urgent PR characteristics");
    }

    // Determine risk level
    let riskLevel = "low";
    if (riskScore >= 20) riskLevel = "high";
    else if (riskScore >= 10) riskLevel = "medium";

    return { riskScore, riskLevel, riskFactors };
  }

  /**
   * Generate exploration report
   * @param {object} data - All exploration data
   * @returns {object} - Generated report
   */
  async generateReport(data) {
    const {
      prDetails,
      explorationScope,
      explorationPlan,
      executionResults,
      detectedIssues,
    } = data;

    console.log(chalk.cyan("📝 Generating exploration report..."));

    // Calculate enhanced risk assessment
    const riskAssessment = this.calculateRiskScore(
      data.detectedIssues,
      data.prDetails,
      data.executionResults
    );

    // Display artifact summary
    if (data.executionResults?.artifacts) {
      ArtifactViewer.displayArtifactSummary(data.executionResults.artifacts);
    }

    try {
      // Try Ollama first, fallback to template
      const report = await this.generateWithOllama(data);

      // Enhance report with risk assessment
      report.riskAssessment = riskAssessment;

      // Send webhook notification if configured
      await this.sendWebhookNotification(report, data);

      return report;
    } catch (error) {
      console.log(
        chalk.yellow(
          `⚠️  Ollama report generation failed (${error.message}), using template`
        )
      );
      return this.generateWithTemplate(data);
    }
  }

  /**
   * Generate report using Ollama with streaming
   */
  async generateWithOllama(data) {
    const prompt = this.buildReportPrompt(data);

    console.log(chalk.cyan("✍️  AI is writing your report..."));

    const response = await this.streamOllamaResponse({
      model: this.model,
      prompt: `You are an expert QA engineer writing concise exploration reports. Keep summaries under 180 words. Be specific about issues and fixes.\n\n${prompt}`,
      options: {
        temperature: 0.2,
        num_predict: 1500,
      },
    });

    console.log(); // New line after streaming
    return this.parseReportResponse(response, data);
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
            // Display the streaming text in real-time with green color for reports
            process.stdout.write(chalk.green(data.response));
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
   * Call OpenAI API
   */
  async callOpenAI(prompt) {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are an expert QA engineer writing concise exploration reports. Keep summaries under 180 words. Be specific about issues and fixes.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      },
      {
        headers: {
          Authorization: `Bearer ${this.openaiApiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices[0].message.content;
  }

  /**
   * Call Anthropic API
   */
  async callAnthropic(prompt) {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-3-haiku-20240307",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      },
      {
        headers: {
          "x-api-key": this.anthropicApiKey,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
      }
    );

    return response.data.content[0].text;
  }

  /**
   * Build report generation prompt
   */
  buildReportPrompt(data) {
    const { prDetails, explorationScope, executionResults, detectedIssues } =
      data;

    const issuesSummary = detectedIssues
      .map(
        (issue) =>
          `- ${issue.severity.toUpperCase()}: ${issue.type} - ${issue.message}`
      )
      .join("\n");

    const performanceIssues = detectedIssues.filter(
      (issue) => issue.category === "performance"
    );
    const perfSummary =
      performanceIssues.length > 0
        ? performanceIssues
            .map(
              (p) =>
                `- ${p.details?.function || "Unknown"}: ${
                  p.details?.duration || "N/A"
                }ms`
            )
            .join("\n")
        : "No performance issues detected";

    return `Generate a concise PR exploration report based on this data:

**PR Information:**
- Title: ${prDetails.title}
- Author: ${prDetails.author}
- Repository: ${prDetails.repository || "Unknown"}

**Exploration Scope:**
- Routes tested: ${explorationScope.routes?.length || 0}
- Components tested: ${explorationScope.components?.length || 0}
- Risk level: ${explorationScope.riskLevel || "Unknown"}

**Execution Results:**
- Steps completed: ${executionResults?.completedSteps || 0}/${
      executionResults?.totalSteps || 0
    }
- Duration: ${executionResults?.duration || "Unknown"}
- Success rate: ${executionResults?.successRate || 0}%

**Issues Detected (${detectedIssues?.length || 0} total):**
${issuesSummary || "No issues detected"}

**Performance Analysis:**
${perfSummary}

Generate a report with:
1. **Executive Summary** (max 180 words)
2. **Verdict** (PASS/WARN/FAIL)
3. **Top 3 Issues** with specific fixes
4. **Performance Insights** (if available)

Use this exact JSON format:
{
  "summary": "Brief executive summary...",
  "verdict": "PASS|WARN|FAIL",
  "topIssues": [
    {
      "title": "Issue title",
      "severity": "error|warning",
      "description": "What happened",
      "fix": "Specific fix suggestion"
    }
  ],
  "performanceInsights": [
    {
      "function": "functionName",
      "issue": "Description",
      "suggestion": "Optimization suggestion"
    }
  ],
  "recommendations": ["Action item 1", "Action item 2"],
  "confidence": "high|medium|low"
}`;
  }

  /**
   * Parse LLM report response
   */
  parseReportResponse(llmResponse, data) {
    try {
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in LLM response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and enhance report
      const report = {
        timestamp: new Date().toISOString(),
        prDetails: {
          number: data.prDetails.number,
          title: data.prDetails.title,
          author: data.prDetails.author,
        },
        summary: parsed.summary || "Report generated successfully",
        verdict: parsed.verdict || this.determineVerdict(data.detectedIssues),
        topIssues: parsed.topIssues || [],
        performanceInsights: parsed.performanceInsights || [],
        recommendations: parsed.recommendations || [],
        confidence: parsed.confidence || "medium",
        stats: {
          totalSteps: data.executionResults?.totalSteps || 0,
          completedSteps: data.executionResults?.completedSteps || 0,
          issuesFound: data.detectedIssues?.length || 0,
          duration: data.executionResults?.duration || "Unknown",
        },
      };

      console.log(chalk.green(`✅ LLM report generated: ${report.verdict}`));

      return report;
    } catch (error) {
      throw new Error(`Failed to parse LLM report: ${error.message}`);
    }
  }

  /**
   * Generate report using template (fallback)
   */
  generateWithTemplate(data) {
    const { prDetails, explorationScope, executionResults, detectedIssues } =
      data;

    const verdict = this.determineVerdict(detectedIssues);
    const errorCount =
      detectedIssues?.filter((issue) => issue.severity === "error").length || 0;
    const warningCount =
      detectedIssues?.filter((issue) => issue.severity === "warning").length ||
      0;

    const report = {
      timestamp: new Date().toISOString(),
      prDetails: {
        number: prDetails.number,
        title: prDetails.title,
        author: prDetails.author,
      },
      summary: this.generateTemplateSummary(data, errorCount, warningCount),
      verdict,
      topIssues: this.extractTopIssues(detectedIssues),
      performanceInsights: this.extractPerformanceInsights(detectedIssues),
      recommendations: this.generateRecommendations(
        verdict,
        errorCount,
        warningCount
      ),
      confidence:
        errorCount > 0 ? "high" : warningCount > 0 ? "medium" : "high",
      stats: {
        totalSteps: executionResults?.totalSteps || 0,
        completedSteps: executionResults?.completedSteps || 0,
        issuesFound: detectedIssues?.length || 0,
        duration: executionResults?.duration || "Unknown",
      },
    };

    console.log(chalk.green(`✅ Template report generated: ${report.verdict}`));

    return report;
  }

  /**
   * Determine verdict based on issues
   */
  determineVerdict(detectedIssues) {
    if (!detectedIssues || detectedIssues.length === 0) {
      return "PASS";
    }

    const hasErrors = detectedIssues.some(
      (issue) => issue.severity === "error"
    );
    const hasWarnings = detectedIssues.some(
      (issue) => issue.severity === "warning"
    );

    if (hasErrors) return "FAIL";
    if (hasWarnings) return "WARN";
    return "PASS";
  }

  /**
   * Generate template summary
   */
  generateTemplateSummary(data, errorCount, warningCount) {
    const { prDetails, explorationScope, executionResults } = data;

    return (
      `Automated exploration of PR #${prDetails.number} "${prDetails.title}" completed. ` +
      `Tested ${explorationScope.routes?.length || 0} routes and ${
        explorationScope.components?.length || 0
      } components. ` +
      `Executed ${executionResults?.completedSteps || 0} of ${
        executionResults?.totalSteps || 0
      } planned steps. ` +
      `Found ${errorCount} errors and ${warningCount} warnings. ` +
      `The changes appear to ${
        errorCount > 0
          ? "introduce critical issues"
          : warningCount > 0
          ? "have minor issues"
          : "be stable"
      } ` +
      `based on automated testing.`
    );
  }

  /**
   * Extract top issues from detected issues
   */
  extractTopIssues(detectedIssues) {
    if (!detectedIssues || detectedIssues.length === 0) {
      return [];
    }

    return detectedIssues
      .sort((a, b) => {
        const severityOrder = { error: 3, warning: 2, info: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      })
      .slice(0, 3)
      .map((issue) => ({
        title: issue.type || "Unknown Issue",
        severity: issue.severity,
        description: issue.message,
        fix: issue.suggestion || this.generateGenericFix(issue.type),
      }));
  }

  /**
   * Extract performance insights
   */
  extractPerformanceInsights(detectedIssues) {
    if (!detectedIssues) return [];

    return detectedIssues
      .filter((issue) => issue.category === "performance")
      .map((issue) => ({
        function: issue.details?.function || "Unknown Function",
        issue: issue.message,
        suggestion: issue.suggestion || "Consider optimizing this function",
      }));
  }

  /**
   * Generate recommendations based on verdict
   */
  generateRecommendations(verdict, errorCount, warningCount) {
    const recommendations = [];

    if (verdict === "FAIL") {
      recommendations.push("Fix critical errors before merging");
      recommendations.push("Run manual testing on affected features");
    } else if (verdict === "WARN") {
      recommendations.push("Review warnings and assess impact");
      recommendations.push("Consider additional testing for edge cases");
    } else {
      recommendations.push("PR appears stable for merge");
      recommendations.push("Monitor production metrics after deployment");
    }

    if (errorCount > 2) {
      recommendations.push("Consider breaking changes into smaller PRs");
    }

    return recommendations;
  }

  /**
   * Generate generic fix suggestion
   */
  generateGenericFix(issueType) {
    const fixes = {
      console: "Remove console.error() or add proper error handling",
      network: "Check API endpoint and add retry logic",
      visual: "Review CSS styling and layout constraints",
      performance: "Profile function execution and optimize bottlenecks",
      timeout: "Increase timeout or optimize loading performance",
    };

    return fixes[issueType] || "Review the issue and implement appropriate fix";
  }

  /**
   * Send webhook notification for report completion
   */
  async sendWebhookNotification(report, data) {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
      const payload = {
        type: "pr_exploration_complete",
        timestamp: new Date().toISOString(),
        pr: {
          number: data.prDetails.number,
          title: data.prDetails.title,
          author: data.prDetails.author,
          repository: data.prDetails.repository,
        },
        verdict: report.verdict,
        riskLevel: report.riskAssessment?.riskLevel || "unknown",
        issuesFound: data.detectedIssues?.length || 0,
        summary: report.summary.substring(0, 200) + "...",
      };

      console.log(chalk.cyan("📡 Sending webhook notification..."));

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log(chalk.green("✅ Webhook notification sent"));
      } else {
        console.log(chalk.yellow(`⚠️  Webhook failed: ${response.status}`));
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Webhook error: ${error.message}`));
    }
  }

  /**
   * Generate comprehensive report with all enhancements
   */
  async generateEnhancedReport(data, progressTracker) {
    if (progressTracker) {
      progressTracker.startStep(
        progressTracker.steps.findIndex((s) => s.name.includes("Report"))
      );
    }

    const report = await this.generateReport(data);

    // Generate artifact HTML viewer
    if (data.executionResults?.artifacts && data.prDetails) {
      const artifactHtml = ArtifactViewer.generateArtifactHTML(
        data.executionResults.artifacts,
        data.prDetails
      );

      // Save HTML report (would need file system access)
      console.log(chalk.blue("📊 Enhanced HTML report generated"));
    }

    if (progressTracker) {
      progressTracker.completeStep(
        progressTracker.steps.findIndex((s) => s.name.includes("Report"))
      );
    }

    return report;
  }
}
