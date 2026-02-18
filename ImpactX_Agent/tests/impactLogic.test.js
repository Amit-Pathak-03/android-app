const impactLogic = require('../impactLogic');
const fetch = require('node-fetch');

jest.mock('node-fetch', () => jest.fn());

describe('Impact Logic Utility', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('getGitHubDiff should fetch diff from GitHub', async () => {
        fetch.mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('diff content'),
        });

        const diff = await impactLogic.getGitHubDiff('token', 'owner', 'repo', 'base', 'head');
        expect(diff).toBe('diff content');
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/compare/base...head'),
            expect.any(Object)
        );
    });

    test('getGitHubTree should fetch tree from GitHub', async () => {
        fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ tree: [{ path: 'file1.js', type: 'blob' }] }),
        });

        const tree = await impactLogic.getGitHubTree('token', 'owner', 'repo', 'branch');
        expect(tree).toHaveLength(1);
        expect(tree[0].path).toBe('file1.js');
    });

    test('summarizeImpact should call OpenAI/Groq API', async () => {
        // Mock OpenAI call
        fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                choices: [{ message: { content: '{"risk": {"score": "LOW"}}' } }]
            }),
        });

        const analysis = await impactLogic.summarizeImpact('openai-key', null, 'diff', []);
        expect(analysis).toContain('LOW');
        expect(fetch).toHaveBeenCalledWith(
            'https://api.openai.com/v1/chat/completions',
            expect.any(Object)
        );
    });

    test('postJiraComment should call JIRA API', async () => {
        fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ id: 'comment-123' }),
        });

        const jiraUrl = 'https://example.atlassian.net/browse/PROJ-123';
        const response = await impactLogic.postJiraComment(jiraUrl, 'email', 'token', 'comment');

        expect(response.id).toBe('comment-123');
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/rest/api/3/issue/PROJ-123/comment'),
            expect.objectContaining({ method: 'POST' })
        );
    });
});
