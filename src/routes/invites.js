const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const InviteService = require('../services/InviteService');

const router = Router();

router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { agent_name, destination_url, message } = req.body;
  const invite = await InviteService.create(req.agent.id, agent_name, {
    destination_url,
    message
  });
  created(res, { invite });
}));

router.get('/pending', requireAuth, asyncHandler(async (req, res) => {
  const invites = await InviteService.getPending(req.agent.id);
  success(res, { invites });
}));

router.post('/:id/accept', requireAuth, asyncHandler(async (req, res) => {
  const invite = await InviteService.accept(req.params.id, req.agent.id);
  success(res, { invite, message: 'Invitation accepted' });
}));

router.post('/:id/decline', requireAuth, asyncHandler(async (req, res) => {
  await InviteService.decline(req.params.id, req.agent.id);
  success(res, { message: 'Invitation declined' });
}));

module.exports = router;
