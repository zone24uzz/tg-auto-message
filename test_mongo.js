"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mongoose_1 = require("mongoose");
var dotenv = require("dotenv");
dotenv.config();
console.log('Connecting...');
mongoose_1.default.connect(process.env.MONGODB_URI).then(function () { console.log('Connected!'); process.exit(0); }).catch(function (e) { console.error('Error:', e); process.exit(1); });
