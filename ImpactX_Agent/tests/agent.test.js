const { processAgentTask } = require('../agent');
const impactLogic = require('../impactLogic');
const emailService = require('../emailService');

jest.mock('../impactLogic');
jest.mock('../emailService');

describe('Agent Orchestrator', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.GITHUB_TOKEN = 'test-token';
    });

    test('should skip task if action is not closed', async () => {
        const payload = { action: 'opened', pull_request: { merged: false } };
        const result = await processAgentTask(payload);
        expect(result.status).toBe('skipped');
        expect(impactLogic.getGitHubDiff).not.toHaveBeenCalled();
    });

    test('should skip task if target branch is not master/main', async () => {
        const payload = {
            action: 'closed',
            pull_request: { merged: true, base: { ref: 'develop' } }
        };
        const result = await processAgentTask(payload);
        expect(result.status).toBe('skipped');
    });

    test('should execute full workflow on merge to master', async () => {
        const payload = {
            action: 'closed',
            pull_request: {
                merged: true,
                number: 1,
                base: { ref: 'master', repo: { full_name: 'org/repo' } },
                head: { ref: 'feature' },
                title: 'PROJ-123 Fix something'
            },
            repository: { owner: { login: 'org' }, name: 'repo' }
        };

        impactLogic.getGitHubDiff.mockResolvedValue('diff');
        impactLogic.getGitHubTree.mockResolvedValue([]);
        impactLogic.summarizeImpact.mockResolvedValue('{"risk": {"score": "LOW"}}');
        impactLogic.generateTestCases.mockResolvedValue('{"testCases": []}');

        const result = await processAgentTask(payload);

        expect(result.status).toBe('success');
        expect(impactLogic.summarizeImpact).toHaveBeenCalled();
        expect(impactLogic.generateTestCases).toHaveBeenCalled();
        expect(emailService.sendImpactEmail).toHaveBeenCalled();
    });
});
