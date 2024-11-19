const mysql = require('mysql2'); 

let connection
function conn() {
    try {
        connection = mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: 'root123',
            database: 'inventory_management',
        }).promise()
        console.log("db connected successfully")
    } catch (err) {
        console.log(err)
    }
}
conn()
module.exports = connection
