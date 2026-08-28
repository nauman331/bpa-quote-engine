const express = require('express');
const { PORT } = require('./config/env');
const quoteRoutes = require('./routes/quoteRoutes');

const startApp = () => {
    const app = express();
    app.use(express.json());

    app.use('/api/quotes', quoteRoutes);
    app.get('/', (req, res) => res.status(200).send('BPA Quote Engine API is running.'));

    if (process.env.NODE_ENV !== 'production') {
        app.listen(PORT, () => {
            console.log(`BPA Quote Engine running on port ${PORT}`);
        });
    }


    module.exports = app;
};

startApp();