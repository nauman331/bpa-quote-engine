const isAutomationEnabled = () => {
    return process.env.ENABLE_AUTOMATION === 'true';
};

const isDryRun = () => {
    return process.env.DRY_RUN === 'true';
};

const canDispatchEmails = () => {
    return isAutomationEnabled() && process.env.DISPATCH_EMAILS === 'true' && !isDryRun();
};

const canWriteSharePoint = () => {
    return isAutomationEnabled() && !isDryRun();
};

module.exports = {
    isAutomationEnabled,
    isDryRun,
    canDispatchEmails,
    canWriteSharePoint
};
