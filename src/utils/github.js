import { Octokit } from '@octokit/rest';
import chalk from 'chalk';

/**
 * Parse GitHub PR URL to extract repository and PR number
 * @param {string} prUrl - GitHub PR URL
 * @returns {object} - { repository, prNumber }
 */
export function parsePRUrl(prUrl) {
  try {
    const url = new URL(prUrl);
    const pathParts = url.pathname.split('/');
    
    // Expected format: /owner/repo/pull/123
    if (pathParts.length >= 5 && pathParts[3] === 'pull') {
      const owner = pathParts[1];
      const repo = pathParts[2];
      const prNumber = parseInt(pathParts[4]);
      
      if (isNaN(prNumber)) {
        throw new Error('Invalid PR number in URL');
      }
      
      return {
        repository: `${owner}/${repo}`,
        prNumber: prNumber.toString()
      };
    }
    
    throw new Error('Invalid GitHub PR URL format');
  } catch (error) {
    throw new Error(`Failed to parse PR URL: ${error.message}`);
  }
}

/**
 * Create authenticated Octokit instance
 * @returns {Octokit} - Authenticated Octokit instance
 */
export function createGitHubClient() {
  const token = process.env.GITHUB_TOKEN;
  
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }
  
  return new Octokit({
    auth: token,
    baseUrl: process.env.GITHUB_API_URL || 'https://api.github.com'
  });
}

/**
 * Fetch PR details from GitHub
 * @param {string} repository - Repository in owner/repo format
 * @param {string|number} prNumber - PR number
 * @returns {Promise<object>} - PR details
 */
export async function fetchPRDetails(repository, prNumber) {
  const octokit = createGitHubClient();
  const [owner, repo] = repository.split('/');
  
  try {
    console.log(chalk.cyan(`📡 Fetching PR #${prNumber} from ${repository}...`));
    
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: parseInt(prNumber)
    });
    
    console.log(chalk.green(`✅ PR fetched: "${pr.title}"`));
    
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      base: {
        ref: pr.base.ref,
        sha: pr.base.sha
      },
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha
      },
      author: pr.user.login,
      url: pr.html_url,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      labels: pr.labels.map(label => label.name)
    };
  } catch (error) {
    if (error.status === 404) {
      throw new Error(`PR #${prNumber} not found in ${repository}`);
    }
    if (error.status === 401) {
      throw new Error('GitHub authentication failed. Check your GITHUB_TOKEN');
    }
    throw new Error(`Failed to fetch PR details: ${error.message}`);
  }
}

/**
 * Fetch PR diff/changed files
 * @param {string} repository - Repository in owner/repo format
 * @param {string|number} prNumber - PR number
 * @returns {Promise<object>} - PR files and diff
 */
export async function fetchPRDiff(repository, prNumber) {
  const octokit = createGitHubClient();
  const [owner, repo] = repository.split('/');
  
  try {
    console.log(chalk.cyan(`📄 Fetching PR diff for #${prNumber}...`));
    
    // Get list of files changed in the PR
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: parseInt(prNumber)
    });
    
    // Get the raw diff
    const { data: diff } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: parseInt(prNumber),
      mediaType: {
        format: 'diff'
      }
    });
    
    console.log(chalk.green(`✅ Found ${files.length} changed files`));
    
    return {
      files: files.map(file => ({
        filename: file.filename,
        status: file.status, // added, modified, removed
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch
      })),
      rawDiff: diff
    };
  } catch (error) {
    throw new Error(`Failed to fetch PR diff: ${error.message}`);
  }
}

/**
 * Post comment to PR (for Nice-to-Have feature)
 * @param {string} repository - Repository in owner/repo format
 * @param {string|number} prNumber - PR number
 * @param {string} comment - Comment body (markdown)
 * @returns {Promise<object>} - Comment details
 */
export async function postPRComment(repository, prNumber, comment) {
  const octokit = createGitHubClient();
  const [owner, repo] = repository.split('/');
  
  try {
    console.log(chalk.cyan(`💬 Posting comment to PR #${prNumber}...`));
    
    const { data: commentData } = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: parseInt(prNumber),
      body: comment
    });
    
    console.log(chalk.green(`✅ Comment posted: ${commentData.html_url}`));
    
    return commentData;
  } catch (error) {
    throw new Error(`Failed to post PR comment: ${error.message}`);
  }
}

/**
 * Check if PR has specific labels (for Label-based triggers feature)
 * @param {object} prDetails - PR details from fetchPRDetails
 * @param {string[]} requiredLabels - Labels to check for
 * @returns {boolean} - True if PR has any of the required labels
 */
export function hasPRLabels(prDetails, requiredLabels) {
  if (!requiredLabels || requiredLabels.length === 0) {
    return true; // No label requirements
  }
  
  const prLabels = prDetails.labels || [];
  return requiredLabels.some(label => prLabels.includes(label));
}
