import chalk from "chalk";

/**
 * Detects network-related issues like failed requests, slow responses, and suspicious patterns
 */
export class NetworkDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || {
      failureRate: 0.05, // 5% failure rate
      slowRequestMs: 5000,
      timeoutMs: 30000,
      retryThreshold: 3,
    };

    this.suspiciousPatterns = [
      /favicon\.ico/i,
      /\.map$/i,
      /analytics|tracking|telemetry/i,
      /ads|advertisement/i,
    ];
  }

  /**
   * Analyze network activity from execution results
   * @param {object} executionResults - Results from PlaywrightRunner
   * @returns {object} - Network analysis results
   */
  async analyze(executionResults) {
    console.log(chalk.blue("🌐 Analyzing network activity..."));

    const analysis = {
      detector: "network",
      timestamp: new Date().toISOString(),
      summary: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        timeoutRequests: 0,
        slowRequests: 0,
        averageResponseTime: 0,
        failureRate: 0,
      },
      issues: [],
      recommendations: [],
      requestDetails: [],
      domains: new Map(),
      statusCodes: new Map(),
      resourceTypes: new Map(),
    };

    // Collect all network data from execution steps
    const allNetworkData = [];

    for (const step of executionResults.steps) {
      if (step.artifacts) {
        for (const artifact of step.artifacts) {
          if (artifact.type === "network" && artifact.data) {
            allNetworkData.push({
              ...artifact.data,
              stepId: step.stepId,
              stepDescription: step.description,
            });
          }
        }
      }
    }

    // Process each network dataset
    for (const networkData of allNetworkData) {
      if (networkData.requests) {
        analysis.summary.totalRequests += networkData.requests.length;

        // Analyze each request
        for (const request of networkData.requests) {
          this.analyzeRequest(request, networkData, analysis);
        }
      }

      if (networkData.responses) {
        // Analyze responses
        for (const response of networkData.responses) {
          this.analyzeResponse(response, networkData, analysis);
        }
      }
    }

    // Calculate derived metrics
    this.calculateMetrics(analysis);

    // Generate issues based on analysis
    this.generateIssues(analysis);

    // Generate recommendations
    this.generateRecommendations(analysis);

    console.log(
      chalk.green(
        `✅ Network analysis completed: ${analysis.issues.length} issues found`
      )
    );

    return analysis;
  }

  /**
   * Analyze individual request
   */
  analyzeRequest(request, networkData, analysis) {
    const url = new URL(request.url);
    const domain = url.hostname;

    // Track domain usage
    if (!analysis.domains.has(domain)) {
      analysis.domains.set(domain, { requests: 0, failed: 0 });
    }
    analysis.domains.get(domain).requests++;

    // Determine resource type from URL
    const resourceType = this.getResourceType(request.url);
    if (!analysis.resourceTypes.has(resourceType)) {
      analysis.resourceTypes.set(resourceType, 0);
    }
    analysis.resourceTypes.set(
      resourceType,
      analysis.resourceTypes.get(resourceType) + 1
    );

    // Store request details
    analysis.requestDetails.push({
      url: request.url,
      method: request.method,
      timestamp: request.timestamp,
      domain,
      resourceType,
      stepId: networkData.stepId,
      stepDescription: networkData.stepDescription,
    });
  }

  /**
   * Analyze individual response
   */
  analyzeResponse(response, networkData, analysis) {
    const url = new URL(response.url);
    const domain = url.hostname;
    const status = response.status;

    // Track status codes
    if (!analysis.statusCodes.has(status)) {
      analysis.statusCodes.set(status, 0);
    }
    analysis.statusCodes.set(status, analysis.statusCodes.get(status) + 1);

    // Categorize response
    if (status >= 200 && status < 400) {
      analysis.summary.successfulRequests++;
    } else if (status >= 400) {
      analysis.summary.failedRequests++;

      // Track failed requests per domain
      if (analysis.domains.has(domain)) {
        analysis.domains.get(domain).failed++;
      }

      // Add to request details if this is a significant failure
      if (status >= 500 || (status >= 400 && status !== 404)) {
        const existingRequest = analysis.requestDetails.find(
          (r) => r.url === response.url
        );
        if (existingRequest) {
          existingRequest.status = status;
          existingRequest.failed = true;
        }
      }
    }

    // Check for slow requests (if timing data available)
    const responseTime =
      response.timing?.responseEnd - response.timing?.requestStart;
    if (responseTime && responseTime > this.threshold.slowRequestMs) {
      analysis.summary.slowRequests++;

      const existingRequest = analysis.requestDetails.find(
        (r) => r.url === response.url
      );
      if (existingRequest) {
        existingRequest.responseTime = responseTime;
        existingRequest.slow = true;
      }
    }
  }

  /**
   * Calculate derived metrics
   */
  calculateMetrics(analysis) {
    const total = analysis.summary.totalRequests;

    if (total > 0) {
      analysis.summary.failureRate = analysis.summary.failedRequests / total;

      // Calculate average response time if data available
      const requestsWithTiming = analysis.requestDetails.filter(
        (r) => r.responseTime
      );
      if (requestsWithTiming.length > 0) {
        analysis.summary.averageResponseTime =
          requestsWithTiming.reduce((sum, r) => sum + r.responseTime, 0) /
          requestsWithTiming.length;
      }
    }
  }

  /**
   * Generate issues based on analysis
   */
  generateIssues(analysis) {
    // High failure rate issue
    if (analysis.summary.failureRate > this.threshold.failureRate) {
      analysis.issues.push({
        id: `network-failure-rate-${Date.now()}`,
        severity: "major",
        type: "high_failure_rate",
        title: "High Network Failure Rate",
        description: `Network failure rate of ${(
          analysis.summary.failureRate * 100
        ).toFixed(1)}% exceeds threshold of ${(
          this.threshold.failureRate * 100
        ).toFixed(1)}%`,
        impact:
          "High - Network failures can break functionality and degrade user experience",
        evidence: {
          failureRate: analysis.summary.failureRate,
          threshold: this.threshold.failureRate,
          failedRequests: analysis.summary.failedRequests,
          totalRequests: analysis.summary.totalRequests,
        },
        recommendation: "Investigate and fix failing network requests",
      });
    }

    // Slow requests issue
    if (analysis.summary.slowRequests > 0) {
      const slowPercentage =
        (analysis.summary.slowRequests / analysis.summary.totalRequests) * 100;

      analysis.issues.push({
        id: `network-slow-requests-${Date.now()}`,
        severity: slowPercentage > 20 ? "major" : "minor",
        type: "slow_requests",
        title: "Slow Network Requests Detected",
        description: `Found ${analysis.summary.slowRequests} requests slower than ${this.threshold.slowRequestMs}ms`,
        impact:
          "Medium - Slow requests can impact page load times and user experience",
        evidence: {
          slowRequests: analysis.summary.slowRequests,
          threshold: this.threshold.slowRequestMs,
          percentage: slowPercentage,
        },
        recommendation: "Optimize slow network requests or implement caching",
      });
    }

    // Check for specific problematic status codes
    for (const [statusCode, count] of analysis.statusCodes) {
      if (statusCode >= 500 && count > 1) {
        analysis.issues.push({
          id: `network-server-errors-${statusCode}-${Date.now()}`,
          severity: "critical",
          type: "server_errors",
          title: `Multiple Server Errors (${statusCode})`,
          description: `Found ${count} requests with ${statusCode} server errors`,
          impact:
            "High - Server errors indicate backend issues that can break functionality",
          evidence: {
            statusCode,
            count,
            requests: analysis.requestDetails
              .filter((r) => r.status === statusCode)
              .slice(0, 5),
          },
          recommendation: "Investigate server-side issues causing these errors",
        });
      }

      if (statusCode === 404 && count > 5) {
        analysis.issues.push({
          id: `network-not-found-${Date.now()}`,
          severity: "minor",
          type: "missing_resources",
          title: "Multiple 404 Not Found Errors",
          description: `Found ${count} requests returning 404 errors`,
          impact:
            "Low - Missing resources may indicate broken links or outdated references",
          evidence: {
            count,
            requests: analysis.requestDetails
              .filter((r) => r.status === 404)
              .slice(0, 5),
          },
          recommendation: "Review and fix broken resource references",
        });
      }
    }

    // Check for domain-specific issues
    for (const [domain, stats] of analysis.domains) {
      const domainFailureRate = stats.failed / stats.requests;

      if (domainFailureRate > 0.3 && stats.requests > 2) {
        analysis.issues.push({
          id: `network-domain-issues-${domain.replace(
            /[^a-z0-9]/g,
            ""
          )}-${Date.now()}`,
          severity: "major",
          type: "domain_reliability",
          title: `High Failure Rate for ${domain}`,
          description: `Domain ${domain} has ${(
            domainFailureRate * 100
          ).toFixed(1)}% failure rate`,
          impact:
            "Medium - Domain reliability issues can affect specific features",
          evidence: {
            domain,
            failureRate: domainFailureRate,
            failedRequests: stats.failed,
            totalRequests: stats.requests,
          },
          recommendation: `Investigate issues with ${domain} or implement retry logic`,
        });
      }
    }
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(analysis) {
    // Performance recommendations
    if (analysis.summary.averageResponseTime > 2000) {
      analysis.recommendations.push({
        type: "performance",
        priority: "medium",
        title: "Optimize Network Performance",
        description:
          "Implement caching, CDN, or request optimization to improve response times",
        impact: "Improves page load times and user experience",
      });
    }

    // Reliability recommendations
    if (analysis.summary.failureRate > 0.01) {
      analysis.recommendations.push({
        type: "reliability",
        priority: "high",
        title: "Implement Network Error Handling",
        description:
          "Add retry logic and graceful error handling for network requests",
        impact: "Improves application reliability and user experience",
      });
    }

    // Resource optimization
    const totalRequests = analysis.summary.totalRequests;
    if (totalRequests > 50) {
      analysis.recommendations.push({
        type: "optimization",
        priority: "medium",
        title: "Reduce Number of Network Requests",
        description:
          "Bundle resources, use HTTP/2, or implement resource combination to reduce requests",
        impact: "Reduces network overhead and improves load times",
      });
    }

    // Security recommendations
    const hasInsecureRequests = analysis.requestDetails.some(
      (r) => r.url.startsWith("http://") && !r.url.includes("localhost")
    );

    if (hasInsecureRequests) {
      analysis.recommendations.push({
        type: "security",
        priority: "high",
        title: "Use HTTPS for All External Requests",
        description:
          "Ensure all external network requests use HTTPS for security",
        impact: "Prevents man-in-the-middle attacks and improves security",
      });
    }

    // Monitoring recommendations
    if (analysis.summary.failedRequests > 0) {
      analysis.recommendations.push({
        type: "monitoring",
        priority: "low",
        title: "Implement Network Request Monitoring",
        description:
          "Add logging and monitoring for network requests to detect issues early",
        impact: "Enables proactive issue detection and faster resolution",
      });
    }
  }

  /**
   * Determine resource type from URL
   */
  getResourceType(url) {
    const extension = url.split(".").pop()?.toLowerCase();

    if (["js", "jsx", "ts", "tsx"].includes(extension)) return "javascript";
    if (["css", "scss", "sass"].includes(extension)) return "stylesheet";
    if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(extension))
      return "image";
    if (["woff", "woff2", "ttf", "eot"].includes(extension)) return "font";
    if (["json", "xml"].includes(extension)) return "data";
    if (url.includes("/api/") || url.includes("/graphql")) return "api";

    return "other";
  }

  /**
   * Update detection thresholds
   */
  updateThresholds(newThresholds) {
    this.threshold = { ...this.threshold, ...newThresholds };
  }

  /**
   * Get detector configuration
   */
  getConfiguration() {
    return {
      threshold: this.threshold,
      suspiciousPatterns: this.suspiciousPatterns.map((p) => p.source),
    };
  }
}
