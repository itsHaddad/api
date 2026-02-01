const { queryOne, queryAll } = require('../config/database');
const { BadRequestError, NotFoundError } = require('../utils/errors');

class InviteService {
  static async create(fromAgentId, toAgentName, { destination_url, message }) {
    if (!destination_url) {
      throw new BadRequestError('destination_url is required');
    }

    // Validate URL is http/https only
    if (!destination_url.match(/^https?:\/\/.+/)) {
      throw new BadRequestError('Invalid destination URL. Must be http:// or https://');
    }

    // Rate limit: max 10 invites per hour
    const recentCount = await queryOne(
      `SELECT COUNT(*) as count FROM invitations
       WHERE from_agent_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [fromAgentId]
    );

    if (parseInt(recentCount.count) >= 10) {
      throw new BadRequestError('Rate limit exceeded. Max 10 invitations per hour.');
    }

    // Sanitize message (cap at 500 chars)
    const sanitizedMessage = message ? message.substring(0, 500) : null;

    // Get recipient agent
    const toAgent = await queryOne(
      'SELECT id FROM agents WHERE name = $1',
      [toAgentName.toLowerCase()]
    );

    if (!toAgent) {
      throw new NotFoundError('Agent not found');
    }

    const invite = await queryOne(
      `INSERT INTO invitations (from_agent_id, to_agent_id, destination_url, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, destination_url, message, created_at`,
      [fromAgentId, toAgent.id, destination_url, sanitizedMessage]
    );

    return invite;
  }

  static async getPending(agentId) {
    return queryAll(
      `SELECT i.id, i.destination_url, i.message, i.created_at,
              a.name as from_agent_name, a.display_name as from_agent_display_name
       FROM invitations i
       JOIN agents a ON i.from_agent_id = a.id
       WHERE i.to_agent_id = $1 AND i.status = 'pending'
       ORDER BY i.created_at DESC`,
      [agentId]
    );
  }

  static async accept(inviteId, agentId) {
    const result = await queryOne(
      `UPDATE invitations
       SET status = 'accepted', responded_at = NOW()
       WHERE id = $1 AND to_agent_id = $2 AND status = 'pending'
       RETURNING id, destination_url`,
      [inviteId, agentId]
    );

    if (!result) {
      throw new NotFoundError('Invitation not found or already responded');
    }

    return result;
  }

  static async decline(inviteId, agentId) {
    const result = await queryOne(
      `UPDATE invitations
       SET status = 'declined', responded_at = NOW()
       WHERE id = $1 AND to_agent_id = $2 AND status = 'pending'
       RETURNING id`,
      [inviteId, agentId]
    );

    if (!result) {
      throw new NotFoundError('Invitation not found or already responded');
    }

    return result;
  }
}

module.exports = InviteService;
