import chalk from "chalk";

/**
 * Enhanced Network Detector with CDP interception, security analysis, and resource optimization
 */
export class NetworkDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || {
      failureRate: 0.05, // 5% failure rate
      slowRequestMs: 5000,
      timeoutMs: 30000,
      retryThreshold: 3,
      largeResourceMB: 5, // Large resource threshold
      totalTransferMB: 50, // Total transfer threshold
      duplicateRequests: 3, // Duplicate request threshold
    };

    this.suspiciousPatterns = [
      /favicon\.ico/i,
      /\.map$/i,
      /analytics|tracking|telemetry/i,
      /ads|advertisement/i,
    ];

    this.securityPatterns = [
      /^http:\/\/(?!localhost|127\.0\.0\.1)/i, // Non-HTTPS external requests
      /api[._-]?key/i,
      /token/i,
      /password/i,
      /secret/i,
    ];

    this.cdpEnabled = options.enableCDP !== false;
    this.securityAnalysis = options.enableSecurity !== false;
    this.resourceOptimization = options.enableResourceOptimization !== false;

    // Enhanced monitoring data
    this.interceptedRequests = [];
    this.securityIssues = [];
    this.resourceAnalysis = {
      largeResources: [],
      unusedResources: [],
      duplicateRequests: [],
      compressionAnalysis: [],
    };
  }

  /**
   * Enhanced network analysis with CDP interception and security analysis
   * @param {object} executionResults - Results from PlaywrightRunner
   * @returns {object} - Comprehensive network analysis results
   */
  async analyze(executionResults) {
    console.log(
      chalk.blue("🌐 Analyzing network activity with enhanced monitoring...")
    );

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
        totalTransferSize: 0,
        largeResources: 0,
        securityIssues: 0,
        duplicateRequests: 0,
        compressionSavings: 0,
      },
      issues: [],
      recommendations: [],
      requestDetails: [],
      domains: new Map(),
      statusCodes: new Map(),
      resourceTypes: new Map(),
      securityAnalysis: {
        insecureRequests: [],
        mixedContent: [],
        sensitiveData: [],
        corsIssues: [],
      },
      resourceOptimization: {
        largeResources: [],
        unusedResources: [],
        duplicates: [],
        compressionOpportunities: [],
      },
      cdpData: null,
    };

    // Collect all network data from execution steps
    const allNetworkData = [];
    let page = null;

    for (const step of executionResults.steps) {
      // Extract page reference for CDP monitoring
      if (step.data && step.data.page) {
        page = step.data.page;
      }

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

    // Enhanced network monitoring with CDP
    if (page && this.cdpEnabled) {
      try {
        console.log(chalk.blue("🔧 Setting up CDP network monitoring..."));
        await this.setupCDPNetworkMonitoring(page, analysis);
      } catch (error) {
        console.log(
          chalk.yellow(`⚠️ CDP network monitoring failed: ${error.message}`)
        );
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

    // Generate traditional issues based on analysis
    this.generateIssues(analysis);

    // Generate enhanced security issues
    if (this.securityAnalysis) {
      this.generateSecurityIssues(analysis);
    }

    // Generate resource optimization issues
    if (this.resourceOptimization) {
      this.generateResourceOptimizationIssues(analysis);
    }

    // Generate recommendations
    this.generateRecommendations(analysis);

    // Enhanced recommendations
    this.generateEnhancedRecommendations(analysis);

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
   * Setup CDP network monitoring for enhanced analysis
   * @param {Page} page - Playwright page
   * @param {object} analysis - Analysis object to populate
   */
  async setupCDPNetworkMonitoring(page, analysis) {
    const client = await page.context().newCDPSession(page);

    // Enable network domain
    await client.send("Network.enable");
    await client.send("Security.enable");

    const requestMap = new Map();

    // Listen for network requests
    client.on("Network.requestWillBeSent", (event) => {
      const request = {
        requestId: event.requestId,
        url: event.request.url,
        method: event.request.method,
        headers: event.request.headers,
        postData: event.request.postData,
        timestamp: event.timestamp,
        initiator: event.initiator,
        priority: event.request.initialPriority,
        resourceType: event.type,
      };

      requestMap.set(event.requestId, request);
      this.interceptedRequests.push(request);

      // Security analysis
      if (this.securityAnalysis) {
        this.analyzeRequestSecurity(request, analysis);
      }
    });

    // Listen for network responses
    client.on("Network.responseReceived", (event) => {
      const request = requestMap.get(event.requestId);
      if (request) {
        request.response = {
          status: event.response.status,
          statusText: event.response.statusText,
          headers: event.response.headers,
          mimeType: event.response.mimeType,
          securityDetails: event.response.securityDetails,
          timing: event.response.timing,
          encodedDataLength: event.response.encodedDataLength,
          fromDiskCache: event.response.fromDiskCache,
          fromServiceWorker: event.response.fromServiceWorker,
        };

        // Resource optimization analysis
        if (this.resourceOptimization) {
          this.analyzeResourceOptimization(request, analysis);
        }
      }
    });

    // Listen for network failures
    client.on("Network.loadingFailed", (event) => {
      const request = requestMap.get(event.requestId);
      if (request) {
        request.failed = true;
        request.errorText = event.errorText;
        request.blockedReason = event.blockedReason;
        request.corsErrorStatus = event.corsErrorStatus;

        // Add to failed requests analysis
        analysis.securityAnalysis.corsIssues.push({
          url: request.url,
          error: event.errorText,
          blockedReason: event.blockedReason,
          corsErrorStatus: event.corsErrorStatus,
        });
      }
    });

    // Listen for security state changes
    client.on("Security.securityStateChanged", (event) => {
      if (event.securityState === "insecure") {
        analysis.securityAnalysis.mixedContent.push({
          securityState: event.securityState,
          explanations: event.explanations,
          timestamp: Date.now(),
        });
      }
    });

    analysis.cdpData = { client, requestMap };
  }

  /**
   * Analyze request for security issues
   * @param {object} request - Request object
   * @param {object} analysis - Analysis object to populate
   */
  analyzeRequestSecurity(request, analysis) {
    const url = request.url;
    const headers = request.headers;

    // Check for insecure requests (HTTP to external domains)
    for (const pattern of this.securityPatterns) {
      if (pattern.test(url)) {
        if (
          url.startsWith("http://") &&
          !url.includes("localhost") &&
          !url.includes("127.0.0.1")
        ) {
          analysis.securityAnalysis.insecureRequests.push({
            url,
            method: request.method,
            timestamp: request.timestamp,
            risk: "medium",
          });
          analysis.summary.securityIssues++;
        }
      }
    }

    // Check for sensitive data in requests
    const sensitivePatterns = [
      /api[._-]?key/i,
      /token/i,
      /password/i,
      /secret/i,
    ];
    const urlParams = new URL(url).search;
    const postData = request.postData || "";

    for (const pattern of sensitivePatterns) {
      if (pattern.test(urlParams) || pattern.test(postData)) {
        analysis.securityAnalysis.sensitiveData.push({
          url,
          method: request.method,
          dataLocation: pattern.test(urlParams) ? "url_params" : "post_data",
          risk: "high",
        });
        analysis.summary.securityIssues++;
      }
    }

    // Check for missing security headers in critical requests
    if (request.method === "POST" || url.includes("/api/")) {
      const missingHeaders = [];

      if (!headers["content-security-policy"])
        missingHeaders.push("Content-Security-Policy");
      if (!headers["x-frame-options"]) missingHeaders.push("X-Frame-Options");
      if (!headers["x-content-type-options"])
        missingHeaders.push("X-Content-Type-Options");

      if (missingHeaders.length > 0) {
        analysis.securityAnalysis.insecureRequests.push({
          url,
          issue: "missing_security_headers",
          missingHeaders,
          risk: "medium",
        });
      }
    }
  }

  /**
   * Analyze resource for optimization opportunities
   * @param {object} request - Request object with response
   * @param {object} analysis - Analysis object to populate
   */
  analyzeResourceOptimization(request, analysis) {
    const response = request.response;
    if (!response) return;

    const resourceSize = response.encodedDataLength || 0;
    const resourceType = request.resourceType;

    // Track total transfer size
    analysis.summary.totalTransferSize += resourceSize;

    // Check for large resources
    const sizeMB = resourceSize / (1024 * 1024);
    if (sizeMB > this.threshold.largeResourceMB) {
      analysis.resourceOptimization.largeResources.push({
        url: request.url,
        size: sizeMB,
        type: resourceType,
        threshold: this.threshold.largeResourceMB,
      });
      analysis.summary.largeResources++;
    }

    // Check for compression opportunities
    const contentEncoding = response.headers["content-encoding"];
    if (
      !contentEncoding &&
      resourceSize > 1024 &&
      (resourceType === "Document" ||
        resourceType === "Script" ||
        resourceType === "Stylesheet")
    ) {
      const estimatedSavings = resourceSize * 0.7; // Estimate 70% compression
      analysis.resourceOptimization.compressionOpportunities.push({
        url: request.url,
        size: sizeMB,
        estimatedSavings: estimatedSavings / (1024 * 1024),
        type: resourceType,
      });
      analysis.summary.compressionSavings += estimatedSavings;
    }

    // Check for duplicate requests
    const duplicates = this.interceptedRequests.filter(
      (r) => r.url === request.url && r.requestId !== request.requestId
    );

    if (duplicates.length >= this.threshold.duplicateRequests) {
      analysis.resourceOptimization.duplicates.push({
        url: request.url,
        count: duplicates.length + 1,
        totalSize: (duplicates.length + 1) * sizeMB,
        wastedTransfer: duplicates.length * sizeMB,
      });
      analysis.summary.duplicateRequests++;
    }

    // Check for unused resources (basic heuristic)
    if (response.fromDiskCache && !request.initiator.url) {
      analysis.resourceOptimization.unusedResources.push({
        url: request.url,
        size: sizeMB,
        reason: "loaded_but_not_initiated",
      });
    }
  }

  /**
   * Generate security-focused issues
   * @param {object} analysis - Analysis object to populate
   */
  generateSecurityIssues(analysis) {
    // Insecure requests
    if (analysis.securityAnalysis.insecureRequests.length > 0) {
      analysis.issues.push({
        id: `network-insecure-requests-${Date.now()}`,
        severity: "major",
        type: "insecure_network_requests",
        title: "Insecure Network Requests Detected",
        description: `Found ${analysis.securityAnalysis.insecureRequests.length} insecure network requests`,
        impact:
          "High - Insecure requests can be intercepted and pose security risks",
        evidence: {
          count: analysis.securityAnalysis.insecureRequests.length,
          requests: analysis.securityAnalysis.insecureRequests.slice(0, 5),
        },
        recommendation:
          "Use HTTPS for all external requests and implement proper security headers",
      });
    }

    // Sensitive data exposure
    if (analysis.securityAnalysis.sensitiveData.length > 0) {
      analysis.issues.push({
        id: `network-sensitive-data-${Date.now()}`,
        severity: "critical",
        type: "sensitive_data_exposure",
        title: "Sensitive Data in Network Requests",
        description: `Found ${analysis.securityAnalysis.sensitiveData.length} requests containing sensitive data`,
        impact:
          "Critical - Sensitive data exposure can lead to security breaches",
        evidence: {
          count: analysis.securityAnalysis.sensitiveData.length,
          requests: analysis.securityAnalysis.sensitiveData.slice(0, 3),
        },
        recommendation:
          "Remove sensitive data from URLs and use proper authentication headers",
      });
    }

    // CORS issues
    if (analysis.securityAnalysis.corsIssues.length > 0) {
      analysis.issues.push({
        id: `network-cors-issues-${Date.now()}`,
        severity: "major",
        type: "cors_issues",
        title: "CORS Issues Detected",
        description: `Found ${analysis.securityAnalysis.corsIssues.length} CORS-related network failures`,
        impact: "Medium - CORS issues can prevent proper API communication",
        evidence: {
          count: analysis.securityAnalysis.corsIssues.length,
          issues: analysis.securityAnalysis.corsIssues.slice(0, 3),
        },
        recommendation:
          "Configure proper CORS headers on the server and review cross-origin requests",
      });
    }
  }

  /**
   * Generate resource optimization issues
   * @param {object} analysis - Analysis object to populate
   */
  generateResourceOptimizationIssues(analysis) {
    // Large resources
    if (analysis.summary.largeResources > 0) {
      analysis.issues.push({
        id: `network-large-resources-${Date.now()}`,
        severity: "minor",
        type: "large_resources",
        title: "Large Resources Detected",
        description: `Found ${analysis.summary.largeResources} resources larger than ${this.threshold.largeResourceMB}MB`,
        impact:
          "Medium - Large resources can slow down page loading and increase bandwidth usage",
        evidence: {
          count: analysis.summary.largeResources,
          resources: analysis.resourceOptimization.largeResources.slice(0, 5),
          threshold: this.threshold.largeResourceMB,
        },
        recommendation:
          "Optimize, compress, or lazy-load large resources to improve performance",
      });
    }

    // Compression opportunities
    if (analysis.resourceOptimization.compressionOpportunities.length > 0) {
      const totalSavings = analysis.summary.compressionSavings / (1024 * 1024);

      analysis.issues.push({
        id: `network-compression-${Date.now()}`,
        severity: "minor",
        type: "missing_compression",
        title: "Missing Resource Compression",
        description: `Found ${
          analysis.resourceOptimization.compressionOpportunities.length
        } uncompressed resources with potential ${totalSavings.toFixed(
          2
        )}MB savings`,
        impact:
          "Medium - Uncompressed resources waste bandwidth and slow down loading",
        evidence: {
          count: analysis.resourceOptimization.compressionOpportunities.length,
          totalSavings,
          opportunities:
            analysis.resourceOptimization.compressionOpportunities.slice(0, 5),
        },
        recommendation:
          "Enable gzip/brotli compression for text-based resources",
      });
    }

    // Duplicate requests
    if (analysis.summary.duplicateRequests > 0) {
      analysis.issues.push({
        id: `network-duplicate-requests-${Date.now()}`,
        severity: "minor",
        type: "duplicate_requests",
        title: "Duplicate Network Requests",
        description: `Found ${analysis.summary.duplicateRequests} sets of duplicate requests`,
        impact:
          "Medium - Duplicate requests waste bandwidth and server resources",
        evidence: {
          count: analysis.summary.duplicateRequests,
          duplicates: analysis.resourceOptimization.duplicates.slice(0, 3),
        },
        recommendation:
          "Implement proper caching and deduplicate network requests",
      });
    }

    // High total transfer size
    const totalTransferMB = analysis.summary.totalTransferSize / (1024 * 1024);
    if (totalTransferMB > this.threshold.totalTransferMB) {
      analysis.issues.push({
        id: `network-high-transfer-${Date.now()}`,
        severity: "minor",
        type: "high_total_transfer",
        title: "High Total Transfer Size",
        description: `Total network transfer of ${totalTransferMB.toFixed(
          2
        )}MB exceeds ${this.threshold.totalTransferMB}MB threshold`,
        impact:
          "Medium - High transfer sizes increase loading times and bandwidth costs",
        evidence: {
          totalTransfer: totalTransferMB,
          threshold: this.threshold.totalTransferMB,
          largestResources: analysis.resourceOptimization.largeResources.slice(
            0,
            5
          ),
        },
        recommendation:
          "Optimize resources, implement lazy loading, and use CDN for better performance",
      });
    }
  }

  /**
   * Generate enhanced recommendations based on security and optimization analysis
   * @param {object} analysis - Analysis object
   */
  generateEnhancedRecommendations(analysis) {
    // Security recommendations
    if (analysis.summary.securityIssues > 0) {
      analysis.recommendations.push({
        type: "network_security",
        priority: "high",
        title: "Implement Network Security Best Practices",
        description:
          "Address security issues in network requests including HTTPS usage and sensitive data handling",
        impact: "Prevents security vulnerabilities and data breaches",
      });
    }

    // Performance optimization recommendations
    if (
      analysis.summary.largeResources > 0 ||
      analysis.summary.duplicateRequests > 0
    ) {
      analysis.recommendations.push({
        type: "resource_optimization",
        priority: "medium",
        title: "Optimize Network Resource Loading",
        description:
          "Implement resource optimization strategies including compression, caching, and lazy loading",
        impact: "Improves loading performance and reduces bandwidth usage",
      });
    }

    // Compression recommendations
    if (analysis.resourceOptimization.compressionOpportunities.length > 0) {
      analysis.recommendations.push({
        type: "compression",
        priority: "medium",
        title: "Enable Resource Compression",
        description:
          "Enable gzip/brotli compression for text-based resources to reduce transfer sizes",
        impact: `Could save approximately ${(
          analysis.summary.compressionSavings /
          (1024 * 1024)
        ).toFixed(2)}MB in transfer size`,
      });
    }

    // CDN recommendations
    const totalTransferMB = analysis.summary.totalTransferSize / (1024 * 1024);
    if (totalTransferMB > 20) {
      analysis.recommendations.push({
        type: "cdn_usage",
        priority: "low",
        title: "Consider Using CDN",
        description:
          "Implement a Content Delivery Network to reduce latency and improve loading times",
        impact: "Reduces server load and improves global performance",
      });
    }

    // Caching recommendations
    if (analysis.summary.duplicateRequests > 2) {
      analysis.recommendations.push({
        type: "caching_strategy",
        priority: "medium",
        title: "Improve Caching Strategy",
        description:
          "Implement proper HTTP caching headers and client-side caching to reduce duplicate requests",
        impact: "Reduces server load and improves repeat visit performance",
      });
    }
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
