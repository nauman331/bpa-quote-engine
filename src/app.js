const express = require('express');
const { PORT } = require('./config/env');
const quoteRoutes = require('./routes/quoteRoutes');

const startApp = () => {
    const app = express();
    app.use(express.json());

    app.use('/api/quotes', quoteRoutes);

    app.listen(PORT, () => {
        console.log(`BPA Quote Engine running on port ${PORT}`);
    });
};

startApp();