const cron = require("node-cron");
const csvParser = require("csv-parser");
const fs = require("fs");
const sql = require("mssql");
const path = require("path");
const { DateTime } = require("luxon");
const databaseOptions = require("./databaseConfig.js");

const date = DateTime.now();

//check how many valid data left, if zero, move file
const checkNumberOfData = (numberOfData) => {
  if (numberOfData === 0) {
    //const currentPath = path.join(__dirname, "demo_output.csv");
    const currentPath = csvPath[1]; //get the path
    let fileName = "oldFile.csv".split(".").join("-" + date + "."); //file name will be old file after copy

    const newPath = path.join(__dirname, "old", `${fileName}`);

    fs.rename(currentPath, newPath, function (err) {
      if (err) {
        throw err;
      } else {
        console.log("Die Datei wurde verschoben!");
        fs.appendFileSync("file.log", "Die Datei wurde verschoben!\n");
        fs.appendFileSync(
          "file.log",
          `------------------------------ENDE------------------------------------\n`
        );
      }
    });
  }
};
const csvData = [];
const fetchCSV = async (req, res) => {
  let pool;
  try {
    //read csv
    fs.createReadStream(csvPath[1])
      .pipe(csvParser({ separator: ";" }))
      .on("data", (data) => csvData.push(data))
      .on("end", () => {
        //console.log("csvData: ", csvData);
      })
      .on("error", function (error) {
        console.log(error.message);
      });

    // Function to filter out duplicates
    const filterDuplicates = (database, file) => {
      return file.filter((fileItem) => {
        return !database.some(
          (databaseItem) =>
            fileItem.FeatureID === databaseItem.FeatureID &&
            fileItem.STARTTIME === databaseItem.STARTTIME
        );
      });
    };

    // Connect to the SQL Server database
    try {
      pool = await sql.connect(databaseOptions);
      console.log("Connected to the SQL Server database");
      fs.appendFileSync("file.log", "Connected to the SQL Server database\n");
      let request = new sql.Request();
      let synopResults = [];
      let databaseResults = [];
      let uniqueFileArray = [];

      try {
        //get data from DB
        let getDataDB = await request.query(
          "SELECT FeatureID, StartTime FROM [tblAicomEreignisse]"
        );

        //push data from DB to Arr databaseResults
        for (let i = 0; i < getDataDB.recordset.length; i++) {
          databaseResults.push({
            FeatureID: getDataDB.recordset[i].FeatureID,
            STARTTIME: getDataDB.recordset[i].StartTime,
          });
        }

        //push data from CSV file to Arr synopResults
        for (let i = 0; i < csvData.length; i++) {
          synopResults.push({
            FeatureID: `${csvData[i].PROGRAMNAME}_${csvData[i].SERIALNR}_${csvData[i].FEATURE}`,
            STARTTIME: csvData[i].STARTTIME,
            DURATION: csvData[i].DURATION,
            COMPLETED: csvData[i].COMPLETED,
            STABILITY: csvData[i].STABILITY,
            COMMENT: csvData[i].COMMENT,
          });
        }

        // Filter duplicates
        uniqueFileArray = filterDuplicates(databaseResults, synopResults);

        console.log("Unique File Array:", uniqueFileArray);
      } catch (error) {
        console.log(error);
      }

      if (uniqueFileArray.length > 0) {
        // if (findNotDuplicate.length > 0) {
        //if there is csv data

        let count;
        let validatedID;
        let numberOfData = uniqueFileArray.length;

        try {
          //check if there is any data in DB
          let countID = await request.query(
            "SELECT COUNT(ID) AS id_count FROM [tblAicomEreignisse]"
          );
          count = countID.recordset[0].id_count;
          if (count) {
            try {
              //if there is data, find last ID to get new ID for insert new data record
              let findMax = await request.query(
                "SELECT MAX(ID) as id_max from [tblAicomEreignisse]"
              );

              validatedID = findMax.recordset[0].id_max;
            } catch (error) {
              console.log(error);
            }
          } else {
            validatedID = 0;
          }

          for (let i = 0; i < uniqueFileArray.length; i++) {
            try {
              await request.query(
                `INSERT INTO tblAicomEreignisse VALUES 
        ('${++validatedID}',
        '${uniqueFileArray[i].FeatureID}', 
        '${uniqueFileArray[i].STARTTIME}', 
        '${uniqueFileArray[i].DURATION}', 
        '${uniqueFileArray[i].COMPLETED}',
        '${uniqueFileArray[i].STABILITY}',
        '${uniqueFileArray[i].COMMENT}')`
              );

              fs.appendFileSync(
                "file.log",
                `${uniqueFileArray[i].FeatureID};${uniqueFileArray[i].STARTTIME};${uniqueFileArray[i].DURATION};${uniqueFileArray[i].COMPLETED};${uniqueFileArray[i].STABILITY};${uniqueFileArray[i].COMMENT} wurde in DB geschrieben.\n`
              );
              console.log(
                `${uniqueFileArray[i].FeatureID};${uniqueFileArray[i].STARTTIME};${uniqueFileArray[i].DURATION};${uniqueFileArray[i].COMPLETED};${uniqueFileArray[i].STABILITY};${uniqueFileArray[i].COMMENT} wurde in DB geschrieben.`
              );

              numberOfData--; //reduce count after every data record being read
              //when it is zero, run move file function
              //checkNumberOfData(numberOfData);
            } catch (error) {
              console.log(error);
            }
          }
        } catch (error) {
          console.log(error);
        }
      } else {
        console.log(
          "The CSV file is either empty or the data already exists in the database."
        );
        fs.appendFileSync(
          "file.log",
          "The CSV file is either empty or the data already exists in the database.\n"
        );
      }
    } catch (err) {
      console.log("Error connecting to the SQL Server database:", err);
      fs.appendFileSync(
        "file.log",
        "Error connecting to the SQL Server database\n"
      );
    }
  } catch (error) {
    console.log(error);
  }
};

//replace function with regex to remove Extra Spaces From a String to solve empty line in config.ini
const csvPath = fs
  .readFileSync("config.ini", "utf8")
  .replace(/\s+/g, "")
  .split("=");
fs.appendFileSync(
  "file.log",
  `\n--------------------${date}--------------------\n`
);
fs.appendFileSync("file.log", "Die CSV-Datei wird gesucht...\n");
console.log("Die CSV-Datei wird gesucht:", csvPath[1]);

//if found the file
if (fs.existsSync(csvPath[1])) {
  fs.appendFileSync("file.log", "Die CSV-Datei ist vorhanden.\n");
  console.log("Die CSV-Datei ist vorhanden.");
  fetchCSV();
} else {
  fs.appendFileSync(
    "file.log",
    "Die CSV-Datei wurde nicht gefunden. Bitte prüfen Sie, ob der Dateipfad in config.ini gültig ist.\n"
  );
  console.log("Die CSV-Datei wurde nicht gefunden!");
  fs.appendFileSync(
    "file.log",
    `------------------------------ENDE------------------------------------\n`
  );
  process.exit();
}

/* 
cron.schedule("*5 * * * * *", async () => {
console.log("running a task every 5 second");
await fetchCSV();
}); 
*/
