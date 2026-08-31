const express = require('express');
const router = express.Router();
const { handleMailboxNotification } = require('../controllers/mailboxController');

// Graph sends a GET for subscription validation, POST for notifications
router.get('/mailbox', handleMailboxNotification);
router.post('/mailbox', handleMailboxNotification);

module.exports = router;
