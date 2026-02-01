const { expect } = require('chai');
const { describe, it, before } = require('mocha');
const InviteService = require('../src/services/InviteService');
const AgentService = require('../src/services/AgentService');

describe('Agent Invitations', () => {
  let agentA, agentB, apiKeyA, apiKeyB;

  before(async () => {
    const regA = await AgentService.register({
      name: `inviter_${Date.now()}`,
      description: 'Test inviter agent'
    });
    apiKeyA = regA.agent.api_key;
    agentA = await AgentService.findByApiKey(apiKeyA);

    const regB = await AgentService.register({
      name: `invitee_${Date.now()}`,
      description: 'Test invitee agent'
    });
    apiKeyB = regB.agent.api_key;
    agentB = await AgentService.findByApiKey(apiKeyB);
  });

  describe('InviteService.create()', () => {
    it('should create invitation', async () => {
      const invite = await InviteService.create(agentA.id, agentB.name, {
        destination_url: 'https://example.com/chat',
        message: 'Join us!'
      });

      expect(invite).to.have.property('id');
      expect(invite.destination_url).to.equal('https://example.com/chat');
      expect(invite.message).to.equal('Join us!');
    });

    it('should reject missing destination_url', async () => {
      try {
        await InviteService.create(agentA.id, agentB.name, {});
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.name).to.equal('BadRequestError');
      }
    });

    it('should reject non-existent agent', async () => {
      try {
        await InviteService.create(agentA.id, 'nonexistent_agent', {
          destination_url: 'https://example.com'
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.name).to.equal('NotFoundError');
      }
    });
  });

  describe('InviteService.getPending()', () => {
    it('should return pending invitations for agent', async () => {
      await InviteService.create(agentA.id, agentB.name, {
        destination_url: 'https://example.com/event',
        message: 'Test invite'
      });

      const invites = await InviteService.getPending(agentB.id);
      expect(invites).to.be.an('array');
      expect(invites.length).to.be.greaterThan(0);
      expect(invites[0]).to.have.property('from_agent_name', agentA.name);
    });

    it('should not show invites for other agents', async () => {
      const invites = await InviteService.getPending(agentA.id);
      const hasInviteToB = invites.some(i => i.from_agent_name === agentA.name);
      expect(hasInviteToB).to.be.false;
    });
  });

  describe('InviteService.accept()', () => {
    it('should accept invitation', async () => {
      const created = await InviteService.create(agentA.id, agentB.name, {
        destination_url: 'https://example.com/accept-test'
      });

      const result = await InviteService.accept(created.id, agentB.id);
      expect(result).to.have.property('destination_url');

      const pending = await InviteService.getPending(agentB.id);
      const found = pending.find(i => i.id === created.id);
      expect(found).to.be.undefined;
    });

    it('should reject accepting someone else\'s invite', async () => {
      const created = await InviteService.create(agentA.id, agentB.name, {
        destination_url: 'https://example.com/test'
      });

      try {
        await InviteService.accept(created.id, agentA.id);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.name).to.equal('NotFoundError');
      }
    });
  });

  describe('InviteService.decline()', () => {
    it('should decline invitation', async () => {
      const created = await InviteService.create(agentA.id, agentB.name, {
        destination_url: 'https://example.com/decline-test'
      });

      await InviteService.decline(created.id, agentB.id);

      const pending = await InviteService.getPending(agentB.id);
      const found = pending.find(i => i.id === created.id);
      expect(found).to.be.undefined;
    });
  });

  describe('Security: Rate Limiting', () => {
    it('should enforce rate limit of 10 invites per hour', async () => {
      const testAgent = await AgentService.register({
        name: `ratelimit_test_${Date.now()}`,
        description: 'Rate limit test'
      });
      const sender = await AgentService.findByApiKey(testAgent.agent.api_key);

      // Send 10 invites (should succeed)
      for (let i = 0; i < 10; i++) {
        await InviteService.create(sender.id, agentB.name, {
          destination_url: `https://example.com/test${i}`
        });
      }

      // 11th invite should fail
      try {
        await InviteService.create(sender.id, agentB.name, {
          destination_url: 'https://example.com/test11'
        });
        expect.fail('Should have thrown rate limit error');
      } catch (error) {
        expect(error.name).to.equal('BadRequestError');
        expect(error.message).to.include('Rate limit');
      }
    });
  });

  describe('Security: URL Validation', () => {
    it('should reject non-http(s) URLs', async () => {
      const maliciousUrls = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd',
        'ftp://example.com'
      ];

      for (const url of maliciousUrls) {
        try {
          await InviteService.create(agentA.id, agentB.name, {
            destination_url: url
          });
          expect.fail(`Should have rejected URL: ${url}`);
        } catch (error) {
          expect(error.name).to.equal('BadRequestError');
          expect(error.message).to.include('Invalid destination URL');
        }
      }
    });

    it('should accept valid http and https URLs', async () => {
      const validUrls = [
        'https://example.com/chat',
        'http://localhost:3000/test',
        'https://sub.domain.com/path?query=value'
      ];

      for (const url of validUrls) {
        const invite = await InviteService.create(agentA.id, agentB.name, {
          destination_url: url
        });
        expect(invite.destination_url).to.equal(url);
      }
    });
  });

  describe('Security: Message Sanitization', () => {
    it('should cap message length at 500 characters', async () => {
      const longMessage = 'a'.repeat(1000);
      const invite = await InviteService.create(agentA.id, agentB.name, {
        destination_url: 'https://example.com/test',
        message: longMessage
      });

      expect(invite.message.length).to.equal(500);
    });
  });
});
