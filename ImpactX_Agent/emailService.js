const emailService = require('../emailService');
const nodemailer = require('nodemailer');

jest.mock('nodemailer');

describe('Email Service', () => {
    let mockSendMail;

    beforeEach(() => {
        mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
        nodemailer.createTransport.mockReturnValue({
            sendMail: mockSendMail,
        });
    });

    test('sendImpactEmail should configure transporter and send mail', async () => {
        const config = {
            EMAIL_HOST: 'smtp.test.com',
            EMAIL_USER: 'user',
            EMAIL_PASS: 'pass',
            EMAIL_TO: 'to@test.com'
        };
        const pr = {
            number: 123,
            title: 'Title',
            html_url: 'http://test.com',
            head: { ref: 'feature' },
            base: { ref: 'master', repo: { full_name: 'org/repo' } }
        };
        const analysis = { risk: { score: 'HIGH', reasoning: 'Reason' } };
        const testCases = { testCases: [] };

        await emailService.sendImpactEmail(config, pr, analysis, testCases);

        expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
            host: 'smtp.test.com'
        }));
        expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
            to: 'to@test.com',
            subject: expect.stringContaining('PR #123')
        }));
    });

    test('should skip email if config is incomplete', async () => {
        const incompleteConfig = { EMAIL_HOST: 'host' }; // Missing user/pass/to
        await emailService.sendImpactEmail(incompleteConfig, {}, {}, {});
        expect(mockSendMail).not.toHaveBeenCalled();
    });
});
