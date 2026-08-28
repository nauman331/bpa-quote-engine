const express = require('express');
const { PORT } = require('./config/env');
const quoteRoutes = require('./routes/quoteRoutes');
const webhookRoutes = require('./routes/webhookRoutes');

const startApp = () => {
    const app = express();
    app.use(express.json());

    app.use('/api/quotes', quoteRoutes);
    app.use('/api/webhook', webhookRoutes);
    app.get('/', (req, res) => res.status(200).send('BPA Quote Engine API is running.'));

    app.listen(PORT, () => {
        console.log(`BPA Quote Engine running on port ${PORT}`);
    });


    module.exports = app;
};

startApp();