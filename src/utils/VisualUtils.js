import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import chalk from "chalk";

/**
 * Utility class for visual regression testing and image analysis
 */
export class VisualUtils {
  constructor(options = {}) {
    this.threshold = options.threshold || 0.1;
    this.includeAA = options.includeAA || false;
    this.diffColor = options.diffColor || [255, 0, 0]; // Red
    this.baselineDir = options.baselineDir || "artifacts/baselines";
  }

  /**
   * Compare two screenshots for visual differences
   * @param {string} baseline - Path to baseline image
   * @param {string} current - Path to current image
   * @param {string} diffPath - Path to save difference image
   * @returns {object} - Comparison results
   */
  async compareScreenshots(baseline, current, diffPath) {
    try {
      console.log(
        chalk.blue(
          `📸 Comparing screenshots: ${path.basename(
            baseline
          )} vs ${path.basename(current)}`
        )
      );

      // Read images
      const [baselineImg, currentImg] = await Promise.all([
        this.loadPNG(baseline),
        this.loadPNG(current),
      ]);

      // Ensure images have same dimensions
      if (
        baselineImg.width !== currentImg.width ||
        baselineImg.height !== currentImg.height
      ) {
        // Resize images to match
        const { resizedBaseline, resizedCurrent } = await this.resizeToMatch(
          baselineImg,
          currentImg
        );
        baselineImg.data = resizedBaseline;
        currentImg.data = resizedCurrent;
      }

      // Create diff image
      const { width, height } = baselineImg;
      const diff = new PNG({ width, height });

      // Compare pixels
      const numDiffPixels = pixelmatch(
        baselineImg.data,
        currentImg.data,
        diff.data,
        width,
        height,
        {
          threshold: this.threshold,
          includeAA: this.includeAA,
          diffColor: this.diffColor,
        }
      );

      // Save diff image
      await this.savePNG(diff, diffPath);

      const totalPixels = width * height;
      const diffPercentage = (numDiffPixels / totalPixels) * 100;

      console.log(
        chalk.green(
          `✅ Visual comparison completed: ${diffPercentage.toFixed(
            2
          )}% difference`
        )
      );

      return {
        totalPixels,
        diffPixels: numDiffPixels,
        diffPercentage,
        passed: diffPercentage < this.threshold * 100,
        baselinePath: baseline,
        currentPath: current,
        diffPath,
        dimensions: { width, height },
      };
    } catch (error) {
      console.log(chalk.red(`❌ Visual comparison failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Load PNG image
   * @param {string} imagePath - Path to image
   * @returns {PNG} - PNG object
   */
  async loadPNG(imagePath) {
    const buffer = await fs.readFile(imagePath);
    return PNG.sync.read(buffer);
  }

  /**
   * Save PNG image
   * @param {PNG} png - PNG object
   * @param {string} filePath - Path to save
   */
  async savePNG(png, filePath) {
    const buffer = PNG.sync.write(png);
    await fs.writeFile(filePath, buffer);
  }

  /**
   * Resize images to match dimensions
   * @param {PNG} img1 - First image
   * @param {PNG} img2 - Second image
   * @returns {object} - Resized image data
   */
  async resizeToMatch(img1, img2) {
    const targetWidth = Math.max(img1.width, img2.width);
    const targetHeight = Math.max(img1.height, img2.height);

    console.log(
      chalk.yellow(
        `⚠️ Resizing images to ${targetWidth}x${targetHeight} for comparison`
      )
    );

    const [resizedBaseline, resizedCurrent] = await Promise.all([
      this.resizeImageData(img1, targetWidth, targetHeight),
      this.resizeImageData(img2, targetWidth, targetHeight),
    ]);

    return { resizedBaseline, resizedCurrent };
  }

  /**
   * Resize image data to target dimensions
   * @param {PNG} img - PNG image
   * @param {number} width - Target width
   * @param {number} height - Target height
   * @returns {Buffer} - Resized image data
   */
  async resizeImageData(img, width, height) {
    const buffer = PNG.sync.write(img);
    const resized = await sharp(buffer)
      .resize(width, height, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toBuffer();

    return PNG.sync.read(resized).data;
  }

  /**
   * Take advanced screenshot with options
   * @param {Page} page - Playwright page
   * @param {string} filePath - Path to save screenshot
   * @param {object} options - Screenshot options
   * @returns {string} - Path to saved screenshot
   */
  async takeAdvancedScreenshot(page, filePath, options = {}) {
    const screenshotOptions = {
      fullPage: options.fullPage || false,
      animations: options.animations || "disabled",
      mask: options.mask || [],
      type: "png",
      path: filePath,
      ...options,
    };

    try {
      // Hide dynamic elements if specified
      if (options.hideDynamicElements) {
        await this.hideDynamicElements(page);
      }

      // Wait for images to load
      if (options.waitForImages) {
        await this.waitForImages(page);
      }

      // Take screenshot
      await page.screenshot(screenshotOptions);

      console.log(
        chalk.green(`📸 Advanced screenshot saved: ${path.basename(filePath)}`)
      );
      return filePath;
    } catch (error) {
      console.log(chalk.red(`❌ Advanced screenshot failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Hide dynamic elements that change frequently
   * @param {Page} page - Playwright page
   */
  async hideDynamicElements(page) {
    await page.evaluate(() => {
      // Common dynamic elements to hide
      const selectors = [
        '[data-testid*="timestamp"]',
        '[class*="timestamp"]',
        '[class*="date"]',
        ".loading",
        ".spinner",
        '[class*="animation"]',
        '[data-dynamic="true"]',
      ];

      selectors.forEach((selector) => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => {
          el.style.visibility = "hidden";
        });
      });
    });
  }

  /**
   * Wait for all images to load
   * @param {Page} page - Playwright page
   * @param {number} timeout - Timeout in ms
   */
  async waitForImages(page, timeout = 5000) {
    try {
      await page.waitForFunction(
        () => {
          const images = Array.from(document.querySelectorAll("img"));
          return images.every((img) => img.complete);
        },
        { timeout }
      );
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Image loading timeout: ${error.message}`));
    }
  }

  /**
   * Create baseline screenshot if it doesn't exist
   * @param {Page} page - Playwright page
   * @param {string} name - Screenshot name
   * @param {object} options - Screenshot options
   * @returns {string} - Path to baseline screenshot
   */
  async createOrGetBaseline(page, name, options = {}) {
    const baselinePath = path.join(this.baselineDir, `${name}.png`);

    try {
      await fs.access(baselinePath);
      console.log(chalk.blue(`📂 Using existing baseline: ${name}.png`));
      return baselinePath;
    } catch (error) {
      // Baseline doesn't exist, create it
      await fs.mkdir(this.baselineDir, { recursive: true });
      await this.takeAdvancedScreenshot(page, baselinePath, options);
      console.log(chalk.green(`📸 Created new baseline: ${name}.png`));
      return baselinePath;
    }
  }

  /**
   * Perform visual regression test
   * @param {Page} page - Playwright page
   * @param {string} name - Test name
   * @param {object} options - Test options
   * @returns {object} - Visual regression results
   */
  async performVisualRegressionTest(page, name, options = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const currentPath = path.join(
      "artifacts",
      "screenshots",
      `${name}-${timestamp}.png`
    );
    const diffPath = path.join(
      "artifacts",
      "diffs",
      `${name}-diff-${timestamp}.png`
    );

    // Ensure directories exist
    await fs.mkdir(path.dirname(currentPath), { recursive: true });
    await fs.mkdir(path.dirname(diffPath), { recursive: true });

    // Get or create baseline
    const baselinePath = await this.createOrGetBaseline(page, name, options);

    // Take current screenshot
    await this.takeAdvancedScreenshot(page, currentPath, options);

    // Compare with baseline
    const comparison = await this.compareScreenshots(
      baselinePath,
      currentPath,
      diffPath
    );

    return {
      name,
      timestamp,
      baselinePath,
      currentPath,
      diffPath,
      ...comparison,
      options,
    };
  }

  /**
   * Analyze layout shifts from screenshots
   * @param {array} screenshots - Array of screenshot paths
   * @returns {array} - Layout shift analysis
   */
  async analyzeLayoutShifts(screenshots) {
    if (screenshots.length < 2) return [];

    const shifts = [];

    for (let i = 1; i < screenshots.length; i++) {
      const prev = screenshots[i - 1];
      const curr = screenshots[i];

      try {
        const comparison = await this.compareScreenshots(
          prev.path,
          curr.path,
          curr.path.replace(".png", "-diff.png")
        );

        if (comparison.diffPercentage > 5) {
          // Significant change
          shifts.push({
            from: prev,
            to: curr,
            shift: comparison,
            severity: comparison.diffPercentage > 20 ? "major" : "minor",
          });
        }
      } catch (error) {
        console.log(
          chalk.yellow(`⚠️ Could not analyze layout shift: ${error.message}`)
        );
      }
    }

    return shifts;
  }

  /**
   * Generate visual testing report
   * @param {array} results - Array of visual test results
   * @returns {object} - Visual testing report
   */
  generateVisualReport(results) {
    const passed = results.filter((r) => r.passed);
    const failed = results.filter((r) => !r.passed);

    const avgDiffPercentage =
      results.reduce((sum, r) => sum + r.diffPercentage, 0) / results.length;

    return {
      timestamp: new Date().toISOString(),
      summary: {
        total: results.length,
        passed: passed.length,
        failed: failed.length,
        passRate: (passed.length / results.length) * 100,
        avgDiffPercentage,
      },
      results,
      failedTests: failed.map((f) => ({
        name: f.name,
        diffPercentage: f.diffPercentage,
        diffPixels: f.diffPixels,
        diffPath: f.diffPath,
      })),
      recommendations: this.generateVisualRecommendations(failed),
    };
  }

  /**
   * Generate visual testing recommendations
   * @param {array} failures - Array of failed visual tests
   * @returns {array} - Array of recommendations
   */
  generateVisualRecommendations(failures) {
    const recommendations = [];

    if (failures.length > 0) {
      recommendations.push({
        type: "visual_regression",
        priority: "high",
        title: "Fix Visual Regressions",
        description: `${failures.length} visual tests failed. Review and fix visual changes.`,
        impact: "Prevents visual bugs from reaching production",
      });
    }

    const highDiffTests = failures.filter((f) => f.diffPercentage > 10);
    if (highDiffTests.length > 0) {
      recommendations.push({
        type: "major_visual_changes",
        priority: "critical",
        title: "Major Visual Changes Detected",
        description: `${highDiffTests.length} tests show major visual changes (>10% difference)`,
        impact: "Significant visual changes may affect user experience",
      });
    }

    return recommendations;
  }

  /**
   * Update visual testing threshold
   * @param {number} threshold - New threshold (0-1)
   */
  updateThreshold(threshold) {
    this.threshold = Math.max(0, Math.min(1, threshold));
  }

  /**
   * Clean up old visual artifacts
   * @param {number} maxAge - Maximum age in days
   */
  async cleanupOldArtifacts(maxAge = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAge);

    const dirs = ["artifacts/screenshots", "artifacts/diffs"];

    for (const dir of dirs) {
      try {
        const files = await fs.readdir(dir);

        for (const file of files) {
          const filePath = path.join(dir, file);
          const stats = await fs.stat(filePath);

          if (stats.mtime < cutoffDate) {
            await fs.unlink(filePath);
            console.log(chalk.gray(`🗑️ Cleaned up old artifact: ${file}`));
          }
        }
      } catch (error) {
        // Directory might not exist, ignore
      }
    }
  }
}

export default VisualUtils;
