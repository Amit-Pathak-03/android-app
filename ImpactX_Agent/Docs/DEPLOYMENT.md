# Deployment Guide: ImpactX Agent 🚀

The ImpactX Standalone Agent can be deployed in several ways depending on your infrastructure.

## Option 1: Vercel / Netlify (Serverless)

Since the agent is written in Node.js, you can easily deploy it as a Serverless Function.

1. **Create an API Route**: Wrap the `processAgentTask` in an Express or Serverless handler.
2. **Environment Variables**: Add all keys from `.env` to your Vercel Dashboard.
3. **Webhook URL**: Set the Vercel URL (e.g., `https://impactx.vercel.app/api/webhook`) as the Webhook URL in your GitHub Repository settings.

## Option 2: Docker Deployment

You can containerize the agent and run it on any cloud provider (AWS, GCP, DigitalOcean).

### Dockerfile Template:
```dockerfile
FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "agent.js"] # Assuming you add an express server wrapper
```

## Option 3: GitHub Actions (CI/CD)

You can run the agent directly within a GitHub Action as a post-merge step.

### workflow.yml Example:
```yaml
name: ImpactX Post-Merge
on:
  pull_request:
    types: [closed]
    branches: [master, main]

jobs:
  analyze:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18
      - name: Run ImpactX Agent
        run: |
          cd "agent new"
          npm install
          node -e "require('./agent').processAgentTask(JSON.parse(process.env.GH_EVENT))"
        env:
          GH_EVENT: ${{ toJson(github.event) }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          JIRA_URL: ${{ secrets.JIRA_URL }}
          JIRA_TOKEN: ${{ secrets.JIRA_TOKEN }}
          EMAIL_USER: ${{ secrets.EMAIL_USER }}
          EMAIL_PASS: ${{ secrets.EMAIL_PASS }}
```

## 🔒 Security Best Practices

1. **JIRA Tokens**: Always use API Tokens, never your actual password.
2. **Email**: Use "App Passwords" for SMTP (especially for Gmail).
3. **Webhook Secret**: If deploying as a public URL, implement X-Hub-Signature verification to ensure requests only come from GitHub.
4. 
