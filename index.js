'use strict';

let config = require('./config');
let http = require('http');
const { Client } = require('pg');
let url = require("url");
config.database.ssl = true;
const db = new Client(config.database);


db.connect((err) => {
    if (err) {
        console.error('error connecting', err.stack)
    } else {
        console.log('connected');
        db.query("SET search_path TO " + config.database.schema);
    }
});


function saveHandler(req, res, query) {
    console.log("Got request to save");
    if (req.method === "POST") {
        res.writeHead(200, "OK", {"Content-Type":"application/json"});
        res.end('{"success":true, "message":"We got your request"}');
    } else {
        res.writeHead(405, "Method Not Allowed", {"Allowed-Methods": "POST"});
        res.end();

    }
}

function loadHandler(req, res, query) {
    console.log("Got request to load");
    if (req.method === "GET") {
        if (!Object.prototype.hasOwnProperty.call(query, "user")) {
            res.writeHead(400, "Missing Parameter", {"Content-Type":"application/json"});
            res.end(JSON.stringify({"success":false, "error":'Missing query parameter "user"'}));
        } else {
            db.query("SELECT * FROM \"user\" WHERE \"user\".name = $1", [query.user], (err, result) => {
                if (err) {
                    res.writeHead(500, "OK", {"Content-Type":"application/json"});
                    res.end(JSON.stringify({"success":false, "message":"Error during database query. Contact an admin."}));
                    console.error(err);
                } else {
                    result = result.rows;
                    if (result.length > 0) {
                        let userinfo = result[0];
                        db.query("SELECT * FROM has_unit JOIN unit ON has_unit.unit_id = unit.id WHERE has_unit.user_id = $1", [userinfo.id], (err, result) => {
                            if (err) {
                                res.writeHead(500, "OK", {"Content-Type":"application/json"});
                                res.end(JSON.stringify({"success":false, "message":"Error during database query. Contact an admin."}));
                                console.error(err);
                            } else {
                                let units = result.rows;
                                db.query("SELECT * FROM has_skill JOIN skill ON has_skill.skill_id = skill.id WHERE has_skill.user_id = $1", [userinfo.id], (err, result) => {
                                    if (err) {
                                        res.writeHead(500, "OK", {"Content-Type":"application/json"});
                                        res.end(JSON.stringify({"success":false, "message":"Error during database query. Contact an admin."}));
                                        console.error(err);
                                    } else {
                                        let skills = result.rows;
                                        res.writeHead(200, "OK", {"Content-Type":"application/json"});
                                        res.end(JSON.stringify({"success":true, "message":"We got your request", "user":userinfo, "units":units, "skills":skills}));
                                    }
                                });
                            }
                        });
                    } else {
                        res.writeHead(404, "User Not Found", {"Content-Type":"application/json"});
                        res.end(JSON.stringify({"success":false, "message":"We got your request, but the requested user was not found.", "user":null}));
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
            saveHandler(req, res, q.query);
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
}).listen(8080);
