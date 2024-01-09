const express = require("express");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const sql = require("mssql");
const databaseOptions = require("./databaseConfig"); // Update the path accordingly

const app = express();
const port = 8006;

// Configuration for MSSQL connection
const dbConfig = {
  user: databaseOptions.user,
  password: databaseOptions.password,
  server: databaseOptions.server,
  database: databaseOptions.database,
  options: databaseOptions.options,
};

let processCompleted = false;

app.get("/findFile", (req, res) => {
  const directoryPath =
    "C:\\Users\\kiong\\Documents\\Arbeit\\AICOM\\Synop\\synop_result"; // Update this with your actual directory path

  // Read the directory
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      return res.status(500).send("Error reading directory");
    }

    // Filter files starting with "synop_result"
    const matchingFiles = files.filter((file) =>
      file.startsWith("synop_result")
    );

    if (matchingFiles.length === 0) {
      return res.status(404).send("No matching files found");
    }

    // Return the first matching file found
    const firstMatchingFile = matchingFiles[0];
    const firstFilePath = path.join(directoryPath, firstMatchingFile);

    // Read the first line of synop_result.csv to get the PROGRAMNAME
    const fileStream = fs.createReadStream(firstFilePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let programName = "";

    rl.on("line", (line) => {
      rl.close();
      const columns = line.split(";");

      // Check if the expected number of columns is present
      if (columns.length >= 1) {
        programName = columns[0];
      } else {
        return res.status(500).send("Error reading PROGRAMNAME");
      }
    });

    rl.on("close", () => {
      // Look for a file starting with the obtained PROGRAMNAME
      const programMatchingFiles = files.filter((file) =>
        file.startsWith(programName)
      );

      if (programMatchingFiles.length === 0) {
        return res
          .status(404)
          .send(`No matching files found for ${programName}`);
      }

      // Return the first matching file with the obtained PROGRAMNAME
      const firstProgramFile = programMatchingFiles[0];
      const secondProgramFilePath = path.join(directoryPath, firstProgramFile);

      // Read the content of the second file
      const secondFileStream = fs.createReadStream(secondProgramFilePath);
      const secondFileRl = readline.createInterface({
        input: secondFileStream,
        crlfDelay: Infinity,
      });

      // Create an array to store the rows for database insertion
      const dataToInsert = [];

      // Flag to skip the header line
      let skipHeader = true;

      // Skip the header line and process the rest of the lines in the CSV
      secondFileRl.on("line", (line) => {
        if (skipHeader) {
          skipHeader = false;
          return;
        }

        const columns = line.split(";");

        // Check if the expected number of columns is present
        if (columns.length >= 2) {
          const serialNumber = columns[0];
          const zActTrq = columns[1];

          // Prepare data for insertion
          const rowData = {
            FeatureID: serialNumber, // Assuming SERIALNR maps to FeatureID
            StartTime: "", // You may need to replace this with the actual start time
            Date: null, // You may need to replace this with the actual date
            Duration: "", // You may need to replace this with the actual duration
            Completed: "", // You may need to replace this with the actual completion status
            Stability: null, // Assuming ZActTrq maps to Stability
            Comment: zActTrq, // You may need to replace this with the actual comment
          };

          dataToInsert.push(rowData);
        } else {
          return res.status(500).send("Error reading CSV file");
        }
      });

      secondFileRl.on("close", async () => {
        // Insert data into the MSSQL database
        try {
          await sql.connect(dbConfig);

          // Get the last ID from the table
          const lastIdResult = await sql.query(
            "SELECT MAX(ID) AS LastID FROM tblAicomEreignisse"
          );
          const lastId = lastIdResult.recordset[0].LastID || 0;

          // Prepare the SQL query
          const query =
            "INSERT INTO tblAicomEreignisse (ID, FeatureID, StartTime, Date, Duration, Completed, Stability, Comment) VALUES (@ID, @FeatureID, @StartTime, @Date, @Duration, @Completed, @Stability, @Comment)";

          // Execute the query for each row
          for (const [index, rowData] of dataToInsert.entries()) {
            // Manually add the ID value to the rowData
            rowData.ID = lastId + index + 1;

            // Create parameters for the query
            const parameters = new sql.Request();
            parameters.input("ID", sql.Int, rowData.ID);
            parameters.input("FeatureID", sql.NVarChar(50), rowData.FeatureID);
            parameters.input("StartTime", sql.BigInt, rowData.StartTime);
            parameters.input("Date", sql.DateTime, rowData.Date);
            parameters.input("Duration", sql.Int, rowData.Duration);
            parameters.input("Completed", sql.Bit, rowData.Completed);
            parameters.input(
              "Stability",
              sql.Decimal(18, 9),
              rowData.Stability
            );
            parameters.input("Comment", sql.NVarChar(100), rowData.Comment);

            // Execute the query with parameters
            await parameters.query(query);
          }

          processCompleted = true;

          res.status(200).send({
            processCompleted,
            message: "readSignalFile.js executed successfully",
            firstFilePath,
            secondProgramFilePath,
            programName,
            insertedData: dataToInsert,
          });
        } catch (error) {
          console.error("Error inserting data into the database", error);
          res.status(500).send("Error inserting data into the database");
        } finally {
          // Close the MSSQL connection
          await sql.close();
        }
      });
    });
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
