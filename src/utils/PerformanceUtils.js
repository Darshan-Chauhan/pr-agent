import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
// Web vitals will be loaded via CDN in browser context
import chalk from "chalk";

/**
 * Utility class for performance monitoring and Lighthouse inte  /**
   * Setup CDP session with performance monitoring
   * @param {CDPSession} cdpSession - Already created CDP session
   * @returns {CDPSession} - CDP session client
   */
  async setupCDPSession(cdpSession) {
    if (!cdpSession) {
      console.log(chalk.yellow('No CDP session provided - CDP metrics will be unavailable'));
      return null;
    }

    try {
      // Enable domains for performance monitoring
      await cdpSession.send("Performance.enable");
      await cdpSession.send("Runtime.enable");
      await cdpSession.send("Network.enable");

      this.cdpSession = cdpSession;
      return cdpSession;
    } catch (error) {
      console.log(chalk.yellow(`Could not enable CDP domains: ${error.message}`));
      return null;
    }
  }ort class PerformanceUtils {
  constructor(options = {}) {
    this.lighthouseConfig = {
      extends: "lighthouse:default",
      settings: {
        onlyCategories: ["performance", "accessibility", "best-practices"],
        chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"],
        ...options.lighthouse,
      },
    };
  }

  /**
   * Run Lighthouse audit on a URL
   * @param {string} url - URL to audit
   * @param {object} options - Lighthouse options
   * @returns {object} - Lighthouse results
   */
  async runLighthouseAudit(url, options = {}) {
    console.log(chalk.blue(`🔍 Running Lighthouse audit on ${url}...`));

    let chrome;
    try {
      // Launch Chrome
      const chrome = await launch({
        chromeFlags: this.lighthouseConfig.settings.chromeFlags,
      });

      // Run Lighthouse
      const result = await lighthouse(
        url,
        {
          port: chrome.port,
          ...options,
        },
        this.lighthouseConfig
      );

      console.log(chalk.green(`✅ Lighthouse audit completed`));
      return result;
    } catch (error) {
      console.log(chalk.red(`❌ Lighthouse audit failed: ${error.message}`));
      throw error;
    } finally {
      if (chrome) {
        await chrome.kill();
      }
    }
  }

  /**
   * Extract Core Web Vitals from Lighthouse results
   * @param {object} lighthouseResult - Lighthouse audit result
   * @returns {object} - Core Web Vitals metrics
   */
  extractCoreWebVitals(lighthouseResult) {
    const audits = lighthouseResult.lhr.audits;

    return {
      fcp: {
        value: audits["first-contentful-paint"]?.numericValue || null,
        score: audits["first-contentful-paint"]?.score || null,
        displayValue: audits["first-contentful-paint"]?.displayValue || null,
      },
      lcp: {
        value: audits["largest-contentful-paint"]?.numericValue || null,
        score: audits["largest-contentful-paint"]?.score || null,
        displayValue: audits["largest-contentful-paint"]?.displayValue || null,
      },
      cls: {
        value: audits["cumulative-layout-shift"]?.numericValue || null,
        score: audits["cumulative-layout-shift"]?.score || null,
        displayValue: audits["cumulative-layout-shift"]?.displayValue || null,
      },
      fid: {
        value: audits["max-potential-fid"]?.numericValue || null,
        score: audits["max-potential-fid"]?.score || null,
        displayValue: audits["max-potential-fid"]?.displayValue || null,
      },
      ttfb: {
        value: audits["server-response-time"]?.numericValue || null,
        score: audits["server-response-time"]?.score || null,
        displayValue: audits["server-response-time"]?.displayValue || null,
      },
      performanceScore:
        lighthouseResult.lhr.categories.performance?.score * 100 || null,
    };
  }

  /**
   * Extract performance recommendations from Lighthouse
   * @param {object} lighthouseResult - Lighthouse audit result
   * @returns {array} - Array of recommendations with impact and savings
   */
  extractRecommendations(lighthouseResult) {
    const audits = lighthouseResult.lhr.audits;
    const recommendations = [];

    // Key performance audits to check
    const performanceAudits = [
      "render-blocking-resources",
      "unused-css-rules",
      "unused-javascript",
      "modern-image-formats",
      "uses-optimized-images",
      "efficient-animated-content",
      "unminified-css",
      "unminified-javascript",
      "uses-text-compression",
      "uses-responsive-images",
      "offscreen-images",
      "reduce-unused-code",
    ];

    for (const auditKey of performanceAudits) {
      const audit = audits[auditKey];
      if (audit && audit.score < 1 && audit.details) {
        recommendations.push({
          id: auditKey,
          title: audit.title,
          description: audit.description,
          score: audit.score,
          displayValue: audit.displayValue,
          savings: audit.details.overallSavingsMs || 0,
          impact: this.calculateImpact(
            audit.score,
            audit.details.overallSavingsMs
          ),
          details: audit.details,
        });
      }
    }

    return recommendations.sort((a, b) => b.savings - a.savings);
  }

  /**
   * Calculate performance impact level
   */
  calculateImpact(score, savings) {
    if (score < 0.5 && savings > 1000) return "high";
    if (score < 0.7 && savings > 500) return "medium";
    return "low";
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    // Clean up any Chrome instances or CDP sessions
    if (this.cdpSession) {
      try {
        await this.cdpSession.detach();
      } catch (error) {
        // Ignore cleanup errors
      }
      this.cdpSession = null;
    }
  }

  /**
   * Setup Web Vitals collection in browser context
   * @param {Page} page - Playwright page object
   * @returns {Promise} - Promise that resolves when collection is setup
   */
  async setupWebVitalsCollection(page) {
    // Inject Web Vitals script with CDN version for browser compatibility
    await page.addInitScript(() => {
      window.webVitalsData = {
        cls: null,
        fid: null,
        fcp: null,
        lcp: null,
        ttfb: null,
      };

      // Load web-vitals from CDN for browser context
      const script = document.createElement("script");
      script.src = "https://unpkg.com/web-vitals@3/dist/web-vitals.iife.js";
      script.onload = () => {
        if (window.webVitals) {
          window.webVitals.onCLS((metric) => {
            window.webVitalsData.cls = metric;
          });
          window.webVitals.onFID((metric) => {
            window.webVitalsData.fid = metric;
          });
          window.webVitals.onFCP((metric) => {
            window.webVitalsData.fcp = metric;
          });
          window.webVitals.onLCP((metric) => {
            window.webVitalsData.lcp = metric;
          });
          window.webVitals.onTTFB((metric) => {
            window.webVitalsData.ttfb = metric;
          });
        }
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Collect Web Vitals from browser context
   * @param {Page} page - Playwright page object
   * @returns {object} - Web Vitals data
   */
  async collectWebVitals(page) {
    try {
      const webVitalsData = await page.evaluate(() => {
        return window.webVitalsData || {};
      });

      return webVitalsData;
    } catch (error) {
      console.log(
        chalk.yellow(`⚠️ Could not collect Web Vitals: ${error.message}`)
      );
      return {};
    }
  }



  /**
   * Collect performance metrics via CDP
   * @param {CDPSession} client - CDP session
   * @returns {object} - Performance metrics
   */
  async collectCDPMetrics(client) {
    if (!client) {
      console.log(chalk.gray('   📝 CDP client not available - returning empty metrics'));
      return {};
    }

    try {
      const [metrics, memoryUsage] = await Promise.all([
        client.send("Performance.getMetrics"),
        client.send("Runtime.getHeapUsage").catch(() => null),
      ]);

      const metricsMap = {};
      for (const metric of metrics.metrics) {
        metricsMap[metric.name] = metric.value;
      }

      return {
        timing: metricsMap,
        memory: memoryUsage
          ? {
              used: memoryUsage.usedJSHeapSize,
              total: memoryUsage.totalJSHeapSize,
              limit: memoryUsage.jsHeapSizeLimit,
            }
          : null,
      };
    } catch (error) {
      console.log(
        chalk.yellow(`⚠️ Could not collect CDP metrics: ${error.message}`)
      );
      return {};
    }
  }

  /**
   * Monitor long tasks via CDP
   * @param {CDPSession} client - CDP session
   * @returns {Promise} - Promise that sets up long task monitoring
   */
  async monitorLongTasks(client) {
    const longTasks = [];

    // Listen for console messages that might indicate long tasks
    client.on("Runtime.consoleAPICalled", (event) => {
      if (
        event.type === "warning" &&
        event.args.some((arg) => arg.value && arg.value.includes("long task"))
      ) {
        longTasks.push({
          timestamp: Date.now(),
          message: event.args.map((arg) => arg.value).join(" "),
        });
      }
    });

    return longTasks;
  }

  /**
   * Calculate performance budget compliance
   * @param {object} metrics - Performance metrics
   * @param {object} budget - Performance budget thresholds
   * @returns {object} - Budget compliance results
   */
  calculateBudgetCompliance(metrics, budget = {}) {
    const defaultBudget = {
      fcp: 1800,
      lcp: 2500,
      cls: 0.1,
      fid: 100,
      ttfb: 600,
      performanceScore: 90,
    };

    const activeBudget = { ...defaultBudget, ...budget };
    const compliance = {};

    for (const [metric, threshold] of Object.entries(activeBudget)) {
      if (metrics[metric] !== null && metrics[metric] !== undefined) {
        const value =
          typeof metrics[metric] === "object"
            ? metrics[metric].value
            : metrics[metric];
        compliance[metric] = {
          value,
          threshold,
          passed:
            metric === "performanceScore"
              ? value >= threshold
              : value <= threshold,
          difference:
            metric === "performanceScore"
              ? value - threshold
              : threshold - value,
        };
      }
    }

    return compliance;
  }

  /**
   * Generate performance summary
   * @param {object} lighthouseResult - Lighthouse results
   * @param {object} webVitals - Web Vitals data
   * @param {object} cdpMetrics - CDP metrics
   * @returns {object} - Performance summary
   */
  generatePerformanceSummary(lighthouseResult, webVitals, cdpMetrics) {
    const coreWebVitals = this.extractCoreWebVitals(lighthouseResult);
    const recommendations = this.extractRecommendations(lighthouseResult);
    const budgetCompliance = this.calculateBudgetCompliance(coreWebVitals);

    return {
      timestamp: new Date().toISOString(),
      performanceScore: coreWebVitals.performanceScore,
      coreWebVitals,
      webVitals,
      cdpMetrics,
      recommendations: recommendations.slice(0, 10), // Top 10 recommendations
      budgetCompliance,
      summary: {
        passedBudget: Object.values(budgetCompliance).filter((b) => b.passed)
          .length,
        totalBudgets: Object.keys(budgetCompliance).length,
        criticalIssues: recommendations.filter((r) => r.impact === "high")
          .length,
        totalRecommendations: recommendations.length,
      },
    };
  }
}

export default PerformanceUtils;
