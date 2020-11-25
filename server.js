require('dotenv').config();
const config = require('./config.json');
const express = require('express');
const app = express();
const axios = require('axios').default;
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const cors = require('cors');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(cors());

let CronJob = require('./models/cronjob.model');
const Agenda = require('agenda');
const mongoose = require('mongoose');
const connectionOptions = {
	useCreateIndex: true,
	useNewUrlParser: true,
	useUnifiedTopology: true,
	useFindAndModify: false,
};

const getAllCountries = async () => {
	const { data: countries } = await axios.get(
		`${process.env.COVID_DATASET_URI}/countries`
	);
	return countries;
};

mongoose.connect(
	process.env.MONGODB_URI || config.connectionString,
	connectionOptions
);
// mongoose.Promise = global.Promise;
const connection = mongoose.connection;
connection.once('open', () => {
	console.log('MongoDB database connection established');

	const agenda = new Agenda({
		db: { address: process.env.MONGODB_URI, collection: 'CronJob' },
	});
	agenda.define('save active cases by country', async (job) => {
		// console.log('job ', job);
		(async function () {
			try {
				const countryArr = await getAllCountries();
				const countries = countryArr.map((country) => country.Slug);
				for (country of countries) {
					const { data: countryDetailsArr } = await axios.get(
						`${process.env.COVID_DATASET_URI}/total/country/${country}`
					);
					const countryDetails =
						countryDetailsArr?.length > 0
							? countryDetailsArr[countryDetailsArr.length - 1]
							: { country, active: 0 };

					let record = new CronJob({
						country,
						active: countryDetails?.Active,
					});

					record.save(function (err, rec) {
						if (err) return console.error(err);
						else {
							console.log('country, active cases ', rec.country, rec.active);
						}
					});
				}
			} catch (error) {
				console.error(error);
				// await CronJob.deleteMany({});
			}
		})();
	});

	agenda.define('clear cronjob table', async (job) => {
		await CronJob.deleteMany({});
	});

	// execute cron job
	(async function () {
		// IIFE to give access to async/await
		await agenda.start();

		await agenda.every('1 hour', 'clear cronjob table');

		await agenda.every('2 minutes', 'save active cases by country');

		// Alternatively, you could also do:
		// await agenda.every('*/2 * * * *', 'save active cases by country');
	})();
});

// twilio config to send messages to whatsapp
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

const sendTextToWhatsapp = async (message, senderID) => {
	try {
		await client.messages
			.create({
				from: `whatsapp:${process.env.FROM_NUMBER}`,
				body: message,
				to: senderID,
			})
			.then((message) => console.log(message.sid));
	} catch (err) {
		console.log(`Error sending text : ${err}`);
	}
};

const calcOutput = async (value, source) => {
	if (source === 'TOTAL') {
		try {
			let {
				data: {
					TotalConfirmed: confirmed,
					TotalDeaths: deaths,
					TotalRecovered: recovered,
				},
			} = await axios.get(`${process.env.COVID_DATASET_URI}/world/total`);
			if (value === 'CASES') {
				return `Total Active Cases ${confirmed - (deaths + recovered)}`;
			} else if (value === 'DEATHS') {
				return `Total Deaths ${deaths}`;
			}
		} catch (err) {
			console.log(err);
		}
	} else if (source.length === 2) {
		try {
			const countries = await getAllCountries();
			const givenCountry = countries.find((c) => c.ISO2 === source);
			let { data: records } = await axios(
				`${process.env.COVID_DATASET_URI}/total/country/${givenCountry?.Slug}`
			);
			let { Active: active, Deaths: deaths } = records[records.length - 1];
			if (value === 'CASES') {
				return `${givenCountry?.ISO2} Active Cases ${active}`;
			} else if (value === 'DEATHS') {
				return `${givenCountry?.ISO2} Deaths ${deaths}`;
			}
		} catch (err) {
			console.log(err);
		}
	}
	return value + source;
};

app.post('/query-to-bot', async (req, res) => {
	let message = req.body.Body;
	let senderID = req.body.From;
	// console.log(message);
	let [value, source] = message.split(' ');
	let outputMsg;
	if (
		value !== 'CASES' &&
		value !== 'DEATHS' &&
		source.length > 2 &&
		source !== 'TOTAL'
	) {
		outputMsg = `
		Please choose following valid COVID queries: 
			1. CASES <ISO2 Country Code> => Active cases in given country
			2. DEATHS <ISO2 Country Code> => Deaths in given country
			3. CASES TOTAL => Total active cases in the world
			4. DEATHS TOTAL => Total deaths in the world
		`;
	} else {
		outputMsg = await calcOutput(value, source);
	}
	await sendTextToWhatsapp(outputMsg, senderID);
});

if (
	process.env.NODE_ENV === 'production' ||
	process.env.NODE_ENV === 'staging'
) {
	app.use(express.static('client/build'));
	app.get('*', (req, res) => {
		res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'));
	});
}

const port =
	process.env.NODE_ENV === 'production' ? process.env.PORT || 80 : 4000;
app.listen(port, () => {
	console.log('Server listening on port ' + port);
});
