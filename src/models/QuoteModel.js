const Joi = require('joi');

const quoteSchema = Joi.object({
    brand: Joi.string().valid('BPA', 'GCPA').required(),
    productFamily: Joi.string().required(),
    tier: Joi.string().valid('DD', 'ED', 'FD', 'Ultra', 'Spider', 'Satellite').default('DD'),
    clientName: Joi.string().required(),
    projectName: Joi.string().required(),
    recipientEmail: Joi.string().email().required(),
    rates: Joi.object().optional()
});

const validateQuoteData = (data) => {
    const { error, value } = quoteSchema.validate(data, { abortEarly: false });
    if (error) {
        return {
            isValid: false,
            errors: error.details.map(d => d.message),
            data: null
        };
    }
    return { isValid: true, errors: null, data: value };
};

module.exports = {
    validateQuoteData
};