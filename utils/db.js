const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

module.exports = function () {
  const file = path.join(__dirname, '..', 'db.json');
  const adapter = new FileSync(file);
  const db = low(adapter);

  // Always reload data from disk before returning (to sync recent writes)
  db.read();
  db.defaults({ users: [], emails: [] }).write();

  return db;
};
