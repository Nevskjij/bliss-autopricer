const config = require('../config.json');
const createDb = require('./db');
const { db, pgp } = createDb(config);
module.exports = { db, pgp };
