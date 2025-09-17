# 🤖 PR-Aware Exploration Agent

> **AI-assisted developer productivity & quality tool for contextual PR testing**

A hackathon project by **LazyDevs** that intelligently explores web applications based on GitHub PR changes, using AI to understand scope and Playwright for automated testing.

## 🎯 Problem Statement

QA automation is either too broad (naïve crawlers click everything) or too narrow (requires hand-written e2e). Developers want fast, context-aware feedback on UI issues specific to their PR, without writing new tests.

## ✨ Features

### Must-Have (MVP)

- 📋 **PR ingestion**: Fetch PR metadata, changed files, diffs from GitHub
- 🧠 **Scope inference**: LLM analyzes changes to identify routes, components, actions
- 📝 **Exploration planning**: Generate deterministic test plan (navigate, click, type, submit)
- 🚀 **Playwright execution**: Run plan on your app (local/staging) with browser automation
- 🔍 **Issue detection**: Console errors, network failures, visual issues, performance stalls
- 📊 **Artifacts**: Screenshots, HAR files, traces, CPU profiles per step
- 📄 **LLM reporting**: Markdown summary with verdict (PASS/WARN/FAIL) and top issues
- 🔧 **Performance hints**: Code-level suggestions via sourcemaps

### Nice-to-Have

- 💬 **Slack integration**: Post summaries to channels
- 🤖 **GitHub PR comments**: Auto-comment reports on PRs
- 🔄 **Flake handling**: Retry failed steps, downgrade to WARN if flaky
- 🗺️ **Auto-mapping**: Generate route/component maps from codebase
- 🏷️ **Label triggers**: Run only when PR has specific labels

## 🚀 Quick Start

### 1. Installation

```bash
# Clone and install
git clone <repo-url>
cd pr-agent
npm install

# Setup Playwright browsers
npx playwright install
```

### 2. Configuration

```bash
# Interactive setup (recommended)
npm run setup

# Or copy and edit manually
cp .env.example .env
# Edit .env with your GitHub token and settings
```

### 3. Usage

#### Development Mode (Interactive)

```bash
npm run dev
```

#### Command Line

```bash
# Using PR number and repo
npm run run -- --pr 123 --repo browserstack/frontend

# Using full PR URL
npm run run -- --pr-url https://github.com/browserstack/frontend/pull/123

# Dry run (plan only, no execution)
npm run dry -- --pr 123 --repo browserstack/frontend

# Headed mode (show browser)
npm run run -- --pr 123 --repo browserstack/frontend --headed
```

## 🛠️ Configuration

### Environment Variables (.env)

```bash
# Required
GITHUB_TOKEN=ghp_your_token_here

# Application
APP_URL=http://localhost:3000
DEFAULT_REPO=browserstack/frontend

# LLM (for scope inference and reporting)
OPENAI_API_KEY=sk-your_key_here
ANTHROPIC_API_KEY=sk-ant-your_key_here

# Playwright
HEADLESS=false
VIEWPORT_WIDTH=1280
VIEWPORT_HEIGHT=720

# Exploration
MAX_STEPS=20
MAX_DURATION_MINUTES=5
```

### GitHub Token Setup

1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Generate new token (classic) with these scopes:
   - `repo` - Full control of private repositories
   - `pull_requests` - Read pull requests
3. Add token to `.env` file

## 📋 Usage Examples

### Example 1: Test a Frontend PR

```bash
# Test PR #456 in browserstack/frontend
npm run dev
# Follow interactive prompts

# Or directly:
npm run run -- --pr 456 --repo browserstack/frontend --url http://localhost:3000
```

### Example 2: Dry Run for Planning

```bash
# Generate exploration plan without executing
npm run dry -- --pr-url https://github.com/browserstack/frontend/pull/456
```

### Example 3: Headed Mode for Debugging

```bash
# Watch the browser in action
npm run run -- --pr 456 --repo browserstack/frontend --headed --verbose
```

## 🏗️ Project Structure

```
pr-agent/
├── src/
│   ├── core/                 # Main orchestration
│   │   ├── PRAgent.js       # Main agent class
│   │   └── ExplorationPlanner.js
│   ├── llm/                 # AI/LLM services
│   │   ├── ScopeInferenceService.js
│   │   └── ReportGenerator.js
│   ├── runners/             # Execution engines
│   │   └── PlaywrightRunner.js
│   ├── detectors/           # Issue detection
│   │   ├── DetectorManager.js
│   │   ├── ConsoleDetector.js
│   │   ├── NetworkDetector.js
│   │   ├── VisualDetector.js
│   │   └── PerformanceDetector.js
│   ├── mappers/             # Route/component mapping
│   └── utils/               # Utilities
│       ├── github.js        # GitHub API
│       ├── validation.js    # Environment validation
│       ├── config.js        # Configuration setup
│       └── ArtifactManager.js
├── config/                  # Route/component maps
├── artifacts/               # Generated reports & files
├── docs/                    # Documentation
├── .env.example            # Environment template
├── index.js                # CLI entry point
├── dev-run.js             # Development runner
└── README.md              # This file
```

## 🔍 How It Works

1. **PR Analysis**: Agent fetches PR details and diff from GitHub API
2. **Scope Inference**: LLM analyzes changed files to identify:
   - Routes to test (`/dashboard`, `/settings`)
   - Key components (`RequirementFilter`, `TestPlanModal`)
   - Seed actions (clicks, form fills)
3. **Planning**: Generate deterministic exploration steps:
   - Navigate to routes
   - Interact with components
   - Test happy path + edge cases
4. **Execution**: Playwright runs the plan:
   - Takes screenshots at each step
   - Records network activity (HAR)
   - Captures console logs
   - Profiles CPU performance
5. **Detection**: Multiple detectors scan for issues:
   - Console errors (`TypeError`, `ChunkLoadError`)
   - Network failures (non-2xx responses)
   - Visual problems (overflow, CLS spikes)
   - Performance stalls (stuck spinners)
6. **Reporting**: LLM generates human-readable report:
   - Executive summary (≤180 words)
   - Verdict: PASS/WARN/FAIL
   - Top 3 issues with suggested fixes
   - Performance hints with function-level details

## 🎯 Success Metrics

- **Accuracy**: ≥80% of PRs → correct route/component inference
- **Coverage**: ≥1 happy path + 1 edge case per scoped feature
- **Detection**: Catch meaningful regressions in demo PRs
- **Performance**: End-to-end run < 5 minutes
- **Insights**: Show code-level performance improvements when sourcemaps available

## 🤝 Contributing

This is a hackathon project! Feel free to:

1. Fork the repository
2. Create feature branches
3. Add new detectors or LLM integrations
4. Improve the exploration planning
5. Submit pull requests

## 📄 License

MIT License - feel free to use and modify for your projects.

## 🔗 Links

- [Project PRD](docs/PRD.md)
- [API Documentation](docs/API.md)
- [Architecture Overview](docs/ARCHITECTURE.md)

---

**Built with ❤️ by LazyDevs for the AI-assisted developer productivity hackathon**
