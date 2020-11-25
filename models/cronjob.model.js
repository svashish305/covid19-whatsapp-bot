const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let CronJob = new Schema({
	country: {
		type: String,
	},
	active: {
		type: Number,
		default: 0,
	},
});

module.exports = mongoose.model('CronJob', CronJob);
