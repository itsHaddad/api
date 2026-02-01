/**
 * Tests for agent deletion feature
 */

const { expect } = require('chai');
const { describe, it, before, after } = require('mocha');
const AgentService = require('../src/services/AgentService');
const { queryOne } = require('../src/config/database');

describe('Agent Deletion', () => {
  let testAgent;
  let testApiKey;

  before(async () => {
    // Create a test agent for deletion tests
    const registration = await AgentService.register({
      name: `test_delete_${Date.now()}`,
      description: 'Test agent for deletion'
    });

    testApiKey = registration.agent.api_key;

    // Get agent details
    testAgent = await AgentService.findByApiKey(testApiKey);
  });

  describe('AgentService.delete()', () => {
    it('should soft delete agent by default', async () => {
      // Create test agent
      const reg = await AgentService.register({
        name: `test_soft_${Date.now()}`,
        description: 'Test soft delete'
      });
      const agent = await AgentService.findByApiKey(reg.agent.api_key);

      // Soft delete
      const result = await AgentService.delete(agent.id);

      expect(result).to.have.property('deleted', true);
      expect(result).to.have.property('permanent', false);
      expect(result).to.have.property('message');
      expect(result).to.have.property('restorable_until');

      // Verify agent is marked inactive
      const deletedAgent = await AgentService.findById(agent.id);
      expect(deletedAgent).to.not.be.null;
      expect(deletedAgent.is_active).to.be.false;
      expect(deletedAgent.status).to.equal('deleted');

      // Verify API key is invalidated
      const agentByKey = await AgentService.findByApiKey(reg.agent.api_key);
      expect(agentByKey).to.be.null;
    });

    it('should hard delete agent when permanent=true', async () => {
      // Create test agent
      const reg = await AgentService.register({
        name: `test_hard_${Date.now()}`,
        description: 'Test hard delete'
      });
      const agent = await AgentService.findByApiKey(reg.agent.api_key);

      // Hard delete
      const result = await AgentService.delete(agent.id, { permanent: true });

      expect(result).to.have.property('deleted', true);
      expect(result).to.have.property('permanent', true);
      expect(result.message).to.include('permanently deleted');

      // Verify agent is completely removed
      const deletedAgent = await AgentService.findById(agent.id);
      expect(deletedAgent).to.be.null;

      // Verify API key is invalidated
      const agentByKey = await AgentService.findByApiKey(reg.agent.api_key);
      expect(agentByKey).to.be.null;
    });

    it('should throw NotFoundError for non-existent agent', async () => {
      try {
        await AgentService.delete('00000000-0000-0000-0000-000000000000');
        expect.fail('Should have thrown NotFoundError');
      } catch (error) {
        expect(error.name).to.equal('NotFoundError');
        expect(error.message).to.include('not found');
      }
    });
  });

  describe('AgentService.findById()', () => {
    it('should find agent by ID', async () => {
      const agent = await AgentService.findById(testAgent.id);

      expect(agent).to.not.be.null;
      expect(agent.id).to.equal(testAgent.id);
      expect(agent.name).to.equal(testAgent.name);
    });

    it('should return null for non-existent ID', async () => {
      const agent = await AgentService.findById('00000000-0000-0000-0000-000000000000');
      expect(agent).to.be.null;
    });
  });

  describe('Auth middleware with inactive agents', () => {
    it('should reject API requests from soft-deleted agents', async () => {
      // Create and soft delete an agent
      const reg = await AgentService.register({
        name: `test_auth_${Date.now()}`,
        description: 'Test auth with deleted agent'
      });
      const agent = await AgentService.findByApiKey(reg.agent.api_key);

      await AgentService.delete(agent.id); // Soft delete

      // Verify findByApiKey returns null (because api_key_hash is cleared)
      const authAttempt = await AgentService.findByApiKey(reg.agent.api_key);
      expect(authAttempt).to.be.null;
    });
  });

  describe('Soft delete preserves data integrity', () => {
    it('should keep agent record in database', async () => {
      const reg = await AgentService.register({
        name: `test_preserve_${Date.now()}`,
        description: 'Test data preservation'
      });
      const agent = await AgentService.findByApiKey(reg.agent.api_key);

      // Soft delete
      await AgentService.delete(agent.id);

      // Verify agent still exists in DB (via direct query)
      const dbAgent = await queryOne(
        'SELECT id, is_active, status FROM agents WHERE id = $1',
        [agent.id]
      );

      expect(dbAgent).to.not.be.null;
      expect(dbAgent.is_active).to.be.false;
      expect(dbAgent.status).to.equal('deleted');
    });
  });
});
