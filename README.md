# 🤖 PR-Aware Exploration Agent

> **AI-powered tool that automatically detects which local app to test based on GitHub PR changes**

A hackathon project that intelligently analyzes GitHub PRs and performs automated exploration testing using Playwright and Ollama LLM. The key innovation: **it automatically knows which local application to test** by analyzing the files changed in your PR.

## 🎯 How It Knows Which App to Test

The magic happens through **intelligent app resolution**:

### 1. **App Mapping Configuration** (`config/app-mapping.json`)

```json
{
  "mappings": [
    {
      "id": "qei-dashboard",
      "name": "QEI Dashboard",
      "repository": {
        "owner": "browserstack",
        "name": "frontend",
        "paths": ["apps/quality-dashboard/**", "packages/design-stack/**"]
      },
      "localApp": {
        "baseUrl": "http://localhost:3000",
        "startCommand": "cd ../frontend && pnpm dev --filter quality-dashboard"
      }
    }
  ]
}
```

### 2. **Automatic Resolution Flow**

```
PR Files Changed → App Resolver → Local App Detection → Verification → Testing
```

**Real Example:**

- **PR changes:** `apps/quality-dashboard/src/Dashboard.jsx`
- **Agent matches:** pattern `apps/quality-dashboard/**`
- **Resolves to:** QEI Dashboard at `http://localhost:3000`
- **Verifies:** app is running and healthy
- **Executes:** comprehensive automated tests

### 3. **Smart Pattern Matching Algorithm**

The resolver uses intelligent scoring:

- **📂 Path specificity:** More specific paths get higher priority
- **📊 Change volume:** Files with more changes get higher weight
- **⭐ File importance:** `package.json`, `App.jsx` get bonus points
- **🔄 Change type:** New files > Modified > Deleted

### 4. **Multi-App Scenario Example**

When PR affects multiple apps:

```bash
Changed files:
- apps/quality-dashboard/src/Chart.jsx     (Score: 8.5) ✅ Winner
- apps/integrate/src/Setup.jsx             (Score: 6.2)
- packages/design-stack/Button.jsx         (Score: 4.1)

Result: Tests QEI Dashboard (highest confidence score)
```

## 🚀 Usage Modes

### 1. **🤖 Fully Automatic** (Recommended)

```bash
npm run dev -- --pr 1234
```

✅ Auto-detects app from PR changes
✅ Verifies app is running
✅ Executes comprehensive tests

### 2. **🎯 Manual App Selection**

```bash
npm run dev -- --pr 1234 --app qei-dashboard
```

🎯 Forces specific configured app

### 3. **🔗 Custom URL Testing**

```bash
npm run dev -- --pr 1234 --app-url http://localhost:3001
```

🔗 Tests any running application

### 4. **💬 Interactive Mode**

```bash
npm run dev
```

💬 Prompts for PR and options

## 📋 Complete Architecture

```
GitHub PR → File Analysis → App Resolution → Local App Testing → AI Analysis → Report
     ↓            ↓              ↓              ↓              ↓            ↓
  PR Details   Changed Files   Target App    Playwright     Ollama LLM   HTML + PR Comment
```

## ✨ Features

- 🔍 **Intelligent PR Analysis**: Uses LLM to understand PR changes and infer testing scope
- 🎯 **Automatic App Detection**: Matches PR changes to local applications
- 🤖 **Browser Automation**: Executes tests using Playwright with screenshot capture
- 🚨 **Multi-Layer Detection**: Console errors, network issues, visual regressions, performance
- 📊 **Comprehensive Reports**: Detailed HTML reports with AI-generated recommendations
- 💬 **GitHub Integration**: Posts findings as PR comments

## 🛠️ Prerequisites

- **Node.js** v18+
- **Playwright** browsers installed
- **Ollama** running locally with `gemma3:4b` model
- **GitHub token** for API access
- **Local frontend applications** running (e.g., your React/Vue apps)

## 📦 Installation & Setup

```bash
# 1. Clone and install
git clone <repository-url>
cd pr-agent
npm install

# 2. Install Playwright browsers
npx playwright install

# 3. Setup environment
npm run setup
cp .env.example .env
# Edit .env with your GitHub token

# 4. Start Ollama with gemma3 model
ollama pull gemma3:4b
ollama serve

# 5. Configure your apps in config/app-mapping.json
```

## ⚙️ Configuration

### Environment Variables (`.env`)

```bash
# GitHub Configuration
GITHUB_TOKEN=your_github_token_here

# Ollama Configuration (Local AI)
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:4b
OLLAMA_TIMEOUT=30000

# Testing Configuration
MAX_STEPS=20
MAX_DURATION_MINUTES=5
```

### App Mapping (`config/app-mapping.json`)

Map your repository paths to local applications:

```json
{
  "mappings": [
    {
      "id": "qei-dashboard",
      "name": "QEI Dashboard",
      "repository": {
        "paths": ["apps/quality-dashboard/**", "packages/design-stack/**"]
      },
      "localApp": {
        "baseUrl": "http://localhost:3000",
        "healthCheck": "/api/health",
        "startCommand": "cd ../frontend && pnpm dev --filter quality-dashboard"
      }
    },
    {
      "id": "test-management",
      "name": "Test Management Application",
      "repository": {
        "paths": ["apps/tcm/**", "packages/tm-shared/**"]
      },
      "localApp": {
        "baseUrl": "http://localhost:5173",
        "healthCheck": "/api/health",
        "startCommand": "cd ../frontend && pnpm dev --filter tcm"
      },
      "testConfig": {
        "routes": [
          { "path": "/", "name": "Home", "critical": true },
          { "path": "/test-cases", "name": "Test Cases", "critical": true },
          { "path": "/test-runs", "name": "Test Runs", "critical": true }
        ]
      }
    }
  ]
}
```

## 🎬 Real-World Examples

### Example 1: Dashboard Feature PR

```bash
# PR 1234 changes:
# - apps/quality-dashboard/src/Analytics.jsx (new component)
# - apps/quality-dashboard/src/Dashboard.jsx (updated)
# - packages/design-stack/Chart.jsx (modified)

npm run dev -- --pr 1234

# Output:
# 🎯 Resolving target application from PR changes...
# ✅ Target app resolved: QEI Dashboard (confidence: 87.3%)
# 🔗 URL: http://localhost:3000
# 🔍 Verifying app availability...
# ✅ App is available at http://localhost:3000 (status: 200)
# 🚀 Starting Playwright execution...
# ... (runs comprehensive tests)
# 📄 HTML report: artifacts/pr-1234-*/pr-exploration-report.html
```

### Example 2: Test Management PR

```bash
# PR 2345 changes:
# - apps/tcm/src/TestCaseEditor.jsx (new feature)
# - apps/tcm/src/components/TestRunner.jsx (updated)
# - packages/tm-shared/utils/testUtils.js (modified)

npm run dev -- --pr 2345

# Output:
# 🎯 Resolving target application from PR changes...
# ✅ Target app resolved: Test Management Application (confidence: 92.1%)
# 🔗 URL: http://localhost:5173
# 🔍 Verifying app availability...
# ✅ App is available at http://localhost:5173 (status: 200)
# 🚀 Testing test case management features...
# 📄 Report generated with test execution insights
```

### Example 3: Multi-App PR

```bash
# PR 5678 changes both apps - agent chooses highest confidence
npm run dev -- --pr 5678
# Automatically tests the most affected app
```

### Example 4: Manual Override

```bash
# Force test management app even if PR doesn't match patterns
npm run dev -- --pr 9999 --app test-management
# Tests specific app regardless of PR changes
```

## 🧪 What Gets Tested

### Automatic Test Generation

Based on PR analysis, the agent intelligently tests:

1. **🎯 Critical Routes**: Home, login, main application features
2. **🔧 Changed Components**: Components that were modified in the PR
3. **🔗 Integration Points**: API calls, form submissions, user flows
4. **⚠️ Edge Cases**: Error states, empty forms, invalid routes
5. **📱 Responsive Design**: Mobile and desktop viewport testing

### Issue Detection Layers

- **🔍 Console Errors**: JavaScript errors, warnings, deprecation notices
- **🌐 Network Issues**: Failed requests, slow responses, CORS errors
- **👁️ Visual Problems**: Layout shifts, rendering issues, viewport problems
- **⚡ Performance**: Core Web Vitals, load times, memory usage

## 📊 Output & Reports

### Generated Artifacts

```
artifacts/pr-1234-2024-09-13T10-30-45/
├── reports/
│   ├── pr-exploration-report.html     # 📋 Main HTML report
│   ├── execution-results.json         # 📊 Raw test results
│   └── analysis-results.json          # 🔍 Issue analysis
├── screenshots/                       # 📸 Step-by-step captures
├── videos/                           # 🎬 Test execution videos
├── network/                          # 🌐 HAR files
└── logs/                            # 📝 Console logs
```

### GitHub Integration

Auto-posts PR comments with:

- 📊 **Execution Summary**: Steps executed, timing, success rate
- 🚨 **Critical Issues**: Blocking problems that need attention
- 💡 **AI Recommendations**: Smart suggestions for improvements
- 🔗 **Artifact Links**: Direct links to detailed reports

## 🔧 Advanced Usage

### Custom Test Configuration

```bash
# Extended testing session
npm run dev -- --pr 1234 --max-steps 30 --headed --verbose

# Focus on specific detectors
npm run dev -- --pr 1234 --detector performance,network

# Quick validation (plan only)
npm run dry -- --pr 1234
```

### Workflow Integration

Add to your `package.json`:

```json
{
  "scripts": {
    "test:pr": "cd pr-agent && npm run dev -- --pr",
    "preview:pr": "cd pr-agent && npm run dry -- --pr"
  }
}
```

Usage:

```bash
npm run test:pr 1234     # Full testing
npm run preview:pr 1234  # Plan preview
```

## 📁 Project Structure

```
pr-agent/
├── src/
│   ├── core/                      # 🎯 Main orchestration
│   │   ├── PRAgent.js            # Main coordinator class
│   │   └── ExplorationPlanner.js # Test plan generator
│   ├── services/                  # 🔧 Business logic
│   │   └── AppResolver.js        # 🎯 App detection engine
│   ├── llm/                      # �� AI integration
│   │   ├── ScopeInferenceService.js
│   │   └── ReportGenerator.js
│   ├── automation/               # 🤖 Browser automation
│   │   └── PlaywrightRunner.js
│   ├── detectors/               # 🕵️ Issue detection
│   │   ├── DetectorManager.js
│   │   ├── console/            # JavaScript errors
│   │   ├── network/           # Request issues
│   │   ├── visual/           # Layout problems
│   │   └── performance/     # Speed & metrics
│   └── artifacts/          # 📄 Report management
├── config/
│   └── app-mapping.json   # 🗺️ App configuration
└── artifacts/            # 📊 Generated reports
```

## 🔧 Troubleshooting

### App Not Detected

```bash
# List configured apps
npm run dev -- --list-apps

# Check pattern matching (verbose mode)
npm run dev -- --pr 1234 --verbose

# Manual override
npm run dev -- --pr 1234 --app your-app-id
```

### Ollama Connection Issues

```bash
# Verify Ollama is running
curl http://127.0.0.1:11434/api/tags

# Install/start model
ollama pull gemma3:4b
ollama serve
```

### GitHub API Problems

- ✅ Verify token permissions: `repo`, `pull_requests:read`, `issues:write`
- 📊 Check rate limits in verbose output
- 🔐 Ensure repository access permissions

## 🤝 Contributing

The architecture is designed for extensibility:

- **🔧 Services**: Add new app resolution strategies
- **🕵️ Detectors**: Create custom issue detection modules
- **🧠 LLM**: Extend AI analysis capabilities
- **🤖 Automation**: Add new browser testing patterns

## 📄 License

MIT License - see LICENSE file for details

---

**🎯 The Key Innovation**: Instead of manually specifying what to test, the agent intelligently analyzes your PR changes and automatically determines the right local application and optimal test scope. Just point it at your PR number, and it handles everything else automatically!

**🚀 Perfect for**: Frontend developers who want fast, intelligent feedback on their PR changes without writing custom tests or manually specifying what to test.
