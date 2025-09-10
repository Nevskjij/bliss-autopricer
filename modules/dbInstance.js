const { getBaseConfigManager } = require('./baseConfigManager');
const createDb = require('./db');

const config = getBaseConfigManager().getConfig();
const { db, pgp } = createDb(config);
module.exports = { db, pgp };
