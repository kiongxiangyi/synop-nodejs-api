/* const databaseOptions = {
  user: "sa",
  password: "freebsd2022!",
  database: "GTMS_HOFFMANN",
  server: "localhost",
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  options: {
	instanceName: 'SQLEXPRESS',
    trustServerCertificate: true, // change to true for local dev / self-signed certs
  },
}; */

const databaseOptions = {
  user: "sa",
  password: "freebsd",
  database: "GTMS_Test",
  server: "localhost",
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  options: {
    instanceName: "SQL2016",
    trustServerCertificate: true, // change to true for local dev / self-signed certs
  },
};

module.exports = databaseOptions;
