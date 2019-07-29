'use strict';

let config = require('./config');
let http = require('http');
const {Client} = require('pg');
let url = require("url");
config.database.ssl = true;
let db = new Client(config.database);


db.connect((err) => {
    if (err) {
        console.error('error connecting', err.stack)
    } else {
        console.log('connected');
        db.query("SET search_path TO " + config.database.schema);
    }
});

function errorWithMessage(res, code, status, err, message) {
    console.error(err);
    res.writeHead(code, status, {"Content-Type": "application/json"});
    let retobject = {success: false, message: message};
    if (err.hasOwnProperty('detail')) {
        retobject.detail = err.detail;
    }
    res.end(JSON.stringify(retobject));
}

function saveHandler(req, res) {
    console.log("Got request to save");
    if (req.method === "PUT") {
        let body = '';
        let aborted = false;
        req.on('data', function (data) {
            body += data;

            // Too much POST data, kill the connection!
            // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
            if (body.length > 1e6) {
                errorWithMessage(res, 413, "POST Data Too Large", "Too much PUT Data", "You sent 1MB or more data, ignoring.");
                aborted = true;
            }

        });

        req.on('end', () => {
            if (aborted) {
                return
            }
            let newData;
            try {
                newData = JSON.parse(body);
            } catch (e) {
                console.error("Error during put data parsing as JSON:");
                errorWithMessage(res, 500, "Server Error", e, "Error while parsing your sent data. Aborting.");
                return
            }
            if (!newData.hasOwnProperty('id') || !newData.hasOwnProperty('currency') || !newData.hasOwnProperty('units') || !newData.hasOwnProperty('skills')) {
                errorWithMessage(res, 400, "Missing Required Data", "Missing required Data field for saving", "Missing required field id, currency, units or skills");
                return
            } else {
                db.query('BEGIN', (err) => {
                    const shouldAbort = (abortErr) => {
                        if (abortErr) {
                            db.query("ROLLBACK");
                            errorWithMessage(res, 500, "Server Error", abortErr, "Error in Transaction during save process. Aborting.");
                            return true
                        } else {
                            return false
                        }
                    };
                    if (!shouldAbort(err)) {
                        console.log("Transaction acquired successfully. Saving data...");
                        db.query("SELECT * FROM \"user\" WHERE id = $1 FOR UPDATE", [newData.id], (err, result) => {
                            if (!shouldAbort(err)) {
                                if (result.rows.length === 0) {
                                    db.query("ROLLBACK");
                                    errorWithMessage(res, 404, "User Not Found")
                                } else {
                                    try {
                                        let units = newData.units;
                                        let query = "INSERT INTO has_unit(user_id, unit_id, amount) VALUES ";
                                        let newUnits = [];
                                        let paramArray = [newData.id];
                                        let paramcounter = 1;
                                        let savedUnits = [];
                                        for (let unit of units) {
                                            newUnits.push("($1, $" + ++paramcounter + ", $" + ++paramcounter + ")");
                                            paramArray.push(unit.id);
                                            paramArray.push(unit.amount);
                                            savedUnits.push({id: unit.id, amount: unit.amount});
                                        }
                                        query = query + (newUnits.join(", ")) + " ON CONFLICT ON CONSTRAINT has_unit_pk DO UPDATE SET amount = excluded.amount";
                                        console.log("The full query will be:", query);
                                        console.log("The param Array is:", paramArray);
                                        db.query(query, paramArray, (err) => {
                                            if (!shouldAbort(err)) {
                                                try {
                                                    let skills = newData.skills;
                                                    let query = "INSERT INTO has_skill(user_id, skill_id, skill_level, last_activation) VALUES ";
                                                    let newSkills = [];
                                                    let paramArray = [newData.id];
                                                    let paramcounter = 1;
                                                    let savedSkills = [];
                                                    for (let skill of skills) {
                                                        newSkills.push("($1, $" + ++paramcounter + ", $" + ++paramcounter + ", $" + ++paramcounter + ")");
                                                        paramArray.push(skill.id);
                                                        paramArray.push(skill.skill_level);
                                                        paramArray.push(skill.last_activation);
                                                        savedSkills.push({
                                                            id: skill.id,
                                                            skill_level: skill.skill_level,
                                                            last_activation: skill.last_activation
                                                        });
                                                    }
                                                    query = query + (newSkills.join(", ")) + " ON CONFLICT ON CONSTRAINT has_skill_pk DO UPDATE SET last_activation = excluded.last_activation, skill_level = excluded.skill_level";
                                                    console.log("The full query will be:", query);
                                                    console.log("The param Array is:", paramArray);
                                                    db.query(query, paramArray, (err) => {
                                                        if (!shouldAbort(err)) {
                                                            console.log("Currency: ", newData.currency);
                                                            db.query("UPDATE \"user\" SET currency = $1 WHERE id = $2", [newData.currency, newData.id], (err) => {
                                                                if (!shouldAbort(err)) {
                                                                    db.query("COMMIT");
                                                                    res.writeHead(200, "OK", {"Content-Type": "application/json"});
                                                                    res.end(JSON.stringify({
                                                                        success: true,
                                                                        message: "Found your user, everything updated successfully.",
                                                                        savedData: {
                                                                            units: savedUnits,
                                                                            skills: savedSkills,
                                                                            user: {currency: newData.currency}
                                                                        }
                                                                    }));
                                                                }
                                                            });

                                                        }
                                                    });

                                                } catch (e) {
                                                    shouldAbort(e);
                                                }

                                            }
                                        });

                                    } catch (e) {
                                        shouldAbort(e);
                                    }


                                }
                            }
                        })
                    }
                });


            }

        });
    } else if (req.method === "POST") {
        let body = '';
        let aborted = false;
        req.on('data', function (data) {
            body += data;

            // Too much POST data, kill the connection!
            // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
            if (body.length > 1e6) {
                errorWithMessage(res, 413, "POST Data Too Large", "Too much POST Data", "You sent 1MB or more data, ignoring.");
                aborted = true;
            }

        });

        req.on('end', () => {
                if (aborted) {
                    return
                }
                let newData;
                try {
                    newData = JSON.parse(body);
                } catch (e) {
                    console.error("Error during post data parsing as JSON:");
                    console.error(JSON.stringify(body));
                    errorWithMessage(res, 500, "Server Error", e, "Error while parsing your sent data. Aborting.");
                    return
                }
                if (!newData.hasOwnProperty('name')) {
                    errorWithMessage(res, 400, "Missing Required Data", "Missing name in parsed data", "Missing name in parsed data");
                    return;
                }
                db.query("INSERT INTO \"user\"(name) VALUES ($1) RETURNING id", [newData.name], (err, result) => {
                    if (err) {
                        errorWithMessage(res, 500, "Server Error", err, "Error while adding new user");
                        return
                    }
                    res.writeHead(201, "Created", {"Content-Type": "application/json"});
                    res.end(JSON.stringify({
                        success: true,
                        message: "Added new user",
                        createdId: result.rows[0].id
                    }));
                });

            }
        );

    } else {
        res.writeHead(405, "Method Not Allowed", {"Allowed-Methods": "POST, PUT"});
        res.end();

    }
}

function loadHandler(req, res, query) {
    console.log("Got request to load");
    if (req.method === "GET") {
        if (!Object.prototype.hasOwnProperty.call(query, "user")) {
            res.writeHead(400, "Missing Parameter", {"Content-Type": "application/json"});
            res.end(JSON.stringify({"success": false, "error": 'Missing query parameter "user"'}));
        } else {
            db.query("SELECT * FROM \"user\" WHERE \"user\".id = $1", [query.user], (err, result) => {
                if (err) {
                    res.writeHead(500, "OK", {"Content-Type": "application/json"});
                    res.end(JSON.stringify({
                        "success": false,
                        "message": "Error during database query. Contact an admin."
                    }));
                    console.error(err);
                } else {
                    result = result.rows;
                    if (result.length > 0) {
                        let userinfo = result[0];
                        db.query("SELECT * FROM has_unit JOIN unit ON has_unit.unit_id = unit.id WHERE has_unit.user_id = $1", [userinfo.id], (err, result) => {
                            if (err) {
                                res.writeHead(500, "OK", {"Content-Type": "application/json"});
                                res.end(JSON.stringify({
                                    "success": false,
                                    "message": "Error during database query. Contact an admin."
                                }));
                                console.error(err);
                            } else {
                                let units = result.rows;
                                db.query("SELECT * FROM has_skill JOIN skill ON has_skill.skill_id = skill.id WHERE has_skill.user_id = $1", [userinfo.id], (err, result) => {
                                    if (err) {
                                        res.writeHead(500, "OK", {"Content-Type": "application/json"});
                                        res.end(JSON.stringify({
                                            "success": false,
                                            "message": "Error during database query. Contact an admin."
                                        }));
                                        console.error(err);
                                    } else {
                                        let skills = result.rows;
                                        res.writeHead(200, "OK", {"Content-Type": "application/json"});
                                        res.end(JSON.stringify({
                                            "success": true,
                                            "message": "We got your request",
                                            "user": userinfo,
                                            "units": units,
                                            "skills": skills
                                        }));
                                    }
                                });
                            }
                        });
                    } else {
                        res.writeHead(404, "User Not Found", {"Content-Type": "application/json"});
                        res.end(JSON.stringify({
                            "success": false,
                            "message": "We got your request, but the requested user was not found.",
                            "user": null
                        }));
                    }
                }
            });
        }
    } else {
        res.writeHead(405, "Method Not Allowed", {"Allowed-Methods": "GET"});
        res.end();

    }
}

http.createServer((req, res) => {
    let q = url.parse(req.url, true);
    switch (q.pathname) {
        case "/save": {
            saveHandler(req, res);
            break;
        }
        case "/load": {
            loadHandler(req, res, q.query);
            break;
        }
        case "/favicon.ico": {
            res.writeHead(410, "Gone");
            res.end();
            break;
        }
        default: {
            console.log("Unknown endpoint:", req.url);
            res.writeHead(404, "Not Found");
            res.end('{"error":"Endpoint Not Found"}');
        }

    }
}).listen(config.port);
