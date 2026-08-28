const express = require('express');
const router = express.Router();
const { handleHubspotWebhook } = require('../controllers/webhookController');

router.post('/hubspot', handleHubspotWebhook);

module.exports = router;