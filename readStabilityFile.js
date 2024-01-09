const express = require("express");
const multer = require("multer");
const csvParser = require("csv-parser");
const sql = require("mssql");
const ini = require("ini");
const fs = require("fs");
const config = require("config");

const app = express();
const port = 3000;

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const sqlConfig = {
  user: config.get("database.user"),
  password: config.get("database.password"),
  server: config.get("database.server"),
  database: config.get("database.database"),
  pool: config.get("database.pool"),
  options: config.get("database.options"),
};

app.post("/upload", upload.single("csvFile"), async (req, res) => {
  try {
    const buffer = req.file.buffer;

    // Establish a connection to the MSSQL server
    const pool = await sql.connect(sqlConfig);

    // Get the last existing ID in the table
    const lastID = await getLastID(pool);

    // Parse CSV data
    const csvData = buffer.toString();
    const results = [];

    // Process CSV data using csv-parser
    await new Promise((resolve, reject) => {
      require("stream")
        .Readable.from(csvData.split("\n"))
        .pipe(csvParser({ separator: ";" }))
        .on("data", (row) => {
          // Assuming that STARTTIME in CSV is in UNIX timestamp format
          const date = new Date(parseInt(row.STARTTIME));
          row.DATE = date.toISOString();
          results.push(row);
        })
        .on("end", resolve)
        .on("error", reject);
    });

    // Insert data into the existing table in the MSSQL database with proper ID values
    for (let i = 0; i < results.length; i++) {
      const {
        ProgramName,
        Feature,
        MonitoredSignals,
        SerialNr,
        StartTime,
        Duration,
        Completed,
        Stability,
        Comment,
        DATE,
      } = results[i];

      const currentID = lastID + i + 1;

      await pool.request().query(`
        INSERT INTO tblAicomErignisse
        (ID, ProgramName, Feature, MonitoredSignals, SerialNr, StartTime, Duration, Completed, Stability, Comment, Date)
        VALUES
        (${currentID}, '${ProgramName}', '${Feature}', '${MonitoredSignals}', ${SerialNr}, ${StartTime}, ${Duration}, ${Completed}, ${Stability}, '${Comment}', '${DATE}')
      `);
    }

    // Send a success response
    res.json({ message: "CSV data successfully inserted into the database" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

async function getLastID(pool) {
  try {
    const result = await pool.request().query(`
      SELECT TOP 1 ID
      FROM tblAicomErignisse
      ORDER BY ID DESC
    `);

    if (result.recordset.length > 0) {
      return result.recordset[0].ID;
    }

    return 0; // If the table is empty
  } catch (error) {
    throw error;
  }
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
