# ImpactX Standalone Agent 🤖

The ImpactX Standalone Agent is an AI-powered automation tool designed to monitor GitHub merges to your production branch. It performs deep technical impact analysis, generates manual test cases, synchronizes findings with JIRA, and sends automated email reports.

## 🌟 Features

- **Automated Trigger**: Triggers as soon as a Pull Request is merged into `master` or `main`.
- **AI Impact Analysis**: Uses OpenAI or Groq to identify logic risks, API breaking changes, and architectural ripple effects.
- **Test Case Generation**: Automatically creates a list of manual test cases tailored to the specific changes.
- **JIRA Integration**: Auto-detects JIRA keys (e.g., `PROJ-123`) in PR metadata and posts reports as comments.
- **Email Notifications**: Sends beautiful HTML reports to stakeholders via SMTP.
- **Zero Dependencies**: Completely independent of the main project codebase.

## 📁 File Structure

- `agent.js`: The main orchestrator that handles the workflow.
- `impactLogic.js`: Core logic for GitHub, AI, and JIRA API interactions.
- `emailService.js`: Email formatting and SMTP communication.
- `.env`: Configuration file for API keys and credentials.
- `package.json`: Dependency management for the agent.

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v16+)
- A GitHub Personal Access Token (with `repo` scope)
- OpenAI or Groq API Key
- JIRA API Token (for JIRA sync)
- SMTP credentials (e.g., Gmail App Password)

### 2. Installation
```bash
cd "agent new"
npm install
```

### 3. Configuration
Copy the template in `.env` and fill in your actual credentials.

```bash
# Example .env snippet
GITHUB_TOKEN=ghp_your_token
OPENAI_API_KEY=sk-your-key
JIRA_URL=https://your-domain.atlassian.net
EMAIL_USER=your-email@gmail.com
```

### 4. Usage
The agent is designed to be called by a webhook handler or CI pipeline:

```javascript
const { processAgentTask } = require('./agent');

// Example payload from GitHub Webhook
const payload = {
  action: 'closed',
  pull_request: { merged: true, ... },
  repository: { ... }
};

processAgentTask(payload);
```

## 🧪 Testing
Run the unit tests to ensure everything is working correctly:
```bash
npm test
```

