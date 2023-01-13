'use strict';

const Homey = require('homey');
const HomeyAPI = require("athom-api").HomeyAPI;
const sql = require('mssql');
const luxon = require('luxon');
const Logger = require('./captureLogs.js');

var capabilityListeners = {}
var capabilityTimers = {}
var capabilitySchedulers = []
var sqlPool

class App extends Homey.App {

	log() {
		console.log.bind(this, "[log] " + luxon.DateTime.now().setZone(this.homey.clock.getTimezone()).toFormat('dd HH:mm:ss')).apply(this, arguments);
	}

	error() {
		console.error.bind(this, "[err] " + luxon.DateTime.now().setZone(this.homey.clock.getTimezone()).toFormat('dd HH:mm:ss')).apply(this, arguments);
	}

	async attachListener(params) {
		this.getDeviceById(params.id).then((device) => {
			this.log(`Attaching a listener on the ` + params.capability + ` capability of device "` + device.name + `".`);
			try {
				var DevCap = params.id.concat("-", params.capability)
				capabilityListeners[DevCap] = device.makeCapabilityInstance(params.capability, function (device, capabilityData) {
					this.logCapabilityData(device, params.capability, capabilityData, (0 + Number(params.update)))
				}.bind(this, device));
			} catch {
				this.error('Oeps, ging iets mis... ging om deze paramaters:')
				this.error(JSON.stringify(params))
			}
		});
		return true
	}

	async attachScheduler(params) {
		let allDevices = await this.getDevices();
		var self = this;

		Object.keys(capabilityTimers).forEach(function (timer, capabilities) {
			for (var i = 0; i < capabilityTimers[timer].length; i++) {
				if (capabilityTimers[timer][i].id === params.id && capabilityTimers[timer][i].capability === params.capability) {
					capabilityTimers[timer].splice(i, 1)
					if (capabilityTimers[timer].length == 0) {
						self.log(`Deleting scheduler for every ` + timer + ` seconds; no more capabilities`);
						self.homey.clearInterval(capabilitySchedulers[timer])
						delete capabilityTimers[timer]
						break
					}
				}
			}
		})
		if (!(capabilityTimers.hasOwnProperty(params.seconds))) {
			capabilityTimers[params.seconds] = [];
			self.log(`Adding new scheduler for logging devices every ` + params.seconds + ` seconds.`)
			capabilitySchedulers[params.seconds] = this.homey.setInterval(function () {
				for (const device in capabilityTimers[params.seconds]) {
					var id = capabilityTimers[params.seconds][device].id
					var capability = capabilityTimers[params.seconds][device].capability
					var update = capabilityTimers[params.seconds][device].update
					try {
						self.logCapabilityData(allDevices[id], capability, allDevices[id].capabilitiesObj[capability].value, (2 + Number(update)))
					} catch {
						self.log(`Failed scheduled logging for device with id ` + id + `. Device cleanup needed!`)
						self.error("self.logCapabilityData(" + allDevices[id] + "," + capability + "," + allDevices[id].capabilitiesObj[capability].value + "," + (2 + Number(update)) + ")")
					}
				}
			}, params.seconds * 1000); // 60 * 1000 milsec
		}
		try {
		this.log(`Attaching a schedule for the ` + params.capability + ` capability of device "` + allDevices[params.id].name + `".`);
		} catch {
			console.log(`Someting went wrong attaching the scheduler: "` + JSON.stringify(params));
		}
		var DevCap = params.id.concat("-", params.capability)
		if (!(DevCap in capabilityListeners)) {
			console.log('Also attaching a listener to update the values')
			this.getDeviceById(params.id).then((device) => {
				this.log(`Attaching a listener on the ` + params.capability + ` capability of device "` + device.name + `".`);
				try {
					var DevCap = params.id.concat("-", params.capability)
					capabilityListeners[DevCap] = device.makeCapabilityInstance(params.capability, function (device, capabilityData) {
						// Do absolutly nothing :)
					}.bind(this, device));
				} catch {
					this.error('Oeps, ging iets mis... ging om deze paramaters:')
					this.error(JSON.stringify(params))
				}
			});
		}
		capabilityTimers[params.seconds].push({ "id": params.id, "capability": params.capability, "update": params.update })
		return true
	}

	async destroyListener(params) {
		//var params = JSON.parse(args.listener)
		var DevCap = params.id.concat("-", params.capability)
		this.getDeviceById(params.id).then((device) => {
			this.log(`Detaching a listener from the ` + params.capability + ` capability of device "` + device.name + `".`);
			capabilityListeners[DevCap].destroy();
		});
		return true
	}

	async destroyScheduler(params) {
		if (capabilityTimers.hasOwnProperty(params.seconds)) {
			for (var i = 0; i < capabilityTimers[params.seconds].length; i++) {
				if (capabilityTimers[params.seconds][i].id === params.id && capabilityTimers[params.seconds][i].capability === params.capability) {
					capabilityTimers[params.seconds].splice(i, 1)
				}
			}
			if (capabilityTimers[params.seconds].length == 0) {
				this.log(`Deleting scheduler for every ` + params.seconds + ` seconds; no more capabilities`);
				this.homey.clearInterval(capabilitySchedulers[params.seconds])
				delete capabilityTimers[params.seconds]
			}
		}
		return true
	}

	async onInit() {
		// Dank aan Robin de Gruijter, Logger (via aangepaste captureLogs.js) initialiseren
		if (!this.logger) this.logger = new Logger({ name: 'insight2sql', length: 500, homey: Homey.app });

		this.log(`${Homey.manifest.id} V${Homey.manifest.version} is running...`);
		this.log(`Insights2SQL Started`)

		var sqlSettings = this.homey.settings.get('sqlSettings') || {};
		var sqlDevices = this.homey.settings.get('sqlDevices') || {};

		var self = this
		this.api = await HomeyAPI.forCurrentHomey(this.homey);
		let allDevices = await this.api.devices.getDevices()

		this.api.devices.setMaxListeners(9999); // Prevents MaxListenersExceededWarning error

		// Only initiate sqlPool is connection test has been passed earlier
		if (sqlSettings.sqlsvr_testPassed) {
			let sqlPool = await this.initSQLdb();
		}

		// Action Flowcard LogByFlowcard
		const LogByFlowcard = this.homey.flow.getActionCard("LogByFlowcard");
		LogByFlowcard.registerRunListener(
			async (args) => {
				try {
					return this.LogByFlowcard(args, Object.values(allDevices).reduce((r, b) => Object.assign(r, b.driverId === 'homey' ? b : ''), {}));
				} catch (error) {
					this.error(error)
					return Promise.resolve(false);
				}
			}
		)

		// Condition Flowcard AnySQLQuery
		const AnySQLQuery = this.homey.flow.getConditionCard("AnySQLQuery");
		AnySQLQuery.registerRunListener(
			async (args) => {
				try {
					let sqlResponse = await self.querySQL(args.sqlQuery)
					var operators = {
						'==': function (a, b) { return a == b },
						'!=': function (a, b) { return a != b },
						'>': function (a, b) { return a > b },
						'>=': function (a, b) { return a >= b },
						'<': function (a, b) { return a < b },
						'<=': function (a, b) { return a <= b },
						'===': function (a, b) { return a == b },
						'!==': function (a, b) { return a !== b }
					}
					if (operators[args.operator](Object.values(sqlResponse.recordset[0])[0], args.value2Check)) {
						return Promise.resolve(true);

					} else {
						return Promise.resolve(false);
					}
				} catch (error) {
					this.error(error)
					return Promise.resolve(false);
				}
			}
		)

		this.homey.settings.on('set', args => {
			if (args == 'sqlSettings') {
				this.initSQLdb();
			} else {
				sqlDevices = this.homey.settings.get('sqlDevices');
				this.deviceCleanup(sqlDevices)
			}
		})

		this.api.devices.on('device.delete', async (id) => {
			await this.log(`Device deleted (` + allDevices[id.id].name + `) so removing all logged capabilities`)
			delete sqlDevices[id.id]
			this.homey.settings.set('sqlDevices', sqlDevices)
		});

		this.homey.on('unload', () => {
			sqlPool.close(); //closing connection after request is finished.
			this.log(`${Homey.manifest.id} V${Homey.manifest.version} is stopping...`);
			this.logger.saveLogs();
		})

		this.homey.on('memwarn', () => {
			this.log(`memwarn!`);
		})

		this.homey.on('cpuwarn', () => {
			this.log(`cpu warning`);
		})

		// global crash handling
		process.on('uncaughtException', (err) => {
			this.error(`UnCaught exception: ${err}\n`);
		});

		// global error handling
		process.on('unhandledRejection', (reason, p) => {
			this.error(`Unhandled Rejection at:`, p, `reason:`, reason);
		});

		// Global Garbage Collection ieder 5 minuten
		this.intervalIdGc = this.homey.setInterval(() => {
			global.gc();
		}, 300 * 1000 /*ms*/);

		// Loop through sqlDevices after starting the app to see which devices needs a capabilityListener or a scheduler
		for (let [deviceID, capabilityNames] of Object.entries(sqlDevices)) {
			for (let [capabilityName, Logging] of Object.entries(sqlDevices[deviceID])) {
				var update = sqlDevices[deviceID][capabilityName]['update'] || false
				// Attach an eventlistener if necessary
				if (sqlDevices[deviceID][capabilityName]['event']) {
					this.attachListener({ id: deviceID, capability: capabilityName, update: update });
				}
				// Attach a scheduler if necessary
				if (sqlDevices[deviceID][capabilityName]['timed']) {
					this.attachScheduler({ id: deviceID, capability: capabilityName, seconds: sqlDevices[deviceID][capabilityName]['timed'], update: update });
				}
			}
		}
	}

	async LogByFlowcard(args, device) {
		this.logCapabilityData(device, args.CapabilityName, args.CapabilityData, 0)
	}

	async getDeviceById(id) {
		let device = await this.api.devices.getDevice({ id: id });
		device.setMaxListeners(9999) // Prevents MaxListenersExceededWarning error
		return device
	}

	deleteLogs() {
		return this.logger.deleteLogs();
	}

	getLogs() {
		return this.logger.logArray;
	}

	async deviceCleanup(sqlDevices) {
		await this.log(`Cleaning non-existing devices`)
		let allDevices = await this.getDevices();
		var deletedDevices = 0
		for (let id in sqlDevices) {
			if (!(id in allDevices)) {
				delete sqlDevices[id]
				await this.log(`Deleting device formerly known with id ` + id)
				deletedDevices = deletedDevices + 1
			}
		};
		if (deletedDevices != 0) {
			await this.log(`Found ` + deletedDevices + ` non existing devices. It is strongly advised te restart this app!`)
			this.homey.settings.set('sqlDevices', sqlDevices)
		} else {
			await this.log(`No non-existing devices found, system seems healthy!`)
		}
	}

	async testSQLConnection(sqlConfig) {
		this.log(`SQL Connection test started.`)
		if (sqlConfig.options.instanceName != '') { sqlConfig.server = sqlConfig.server + '\\' + sqlConfig.options.instanceName }
		if (sqlConfig.options.port != '') { sqlConfig.server = sqlConfig.server + ',' + sqlConfig.options.port }
		var config = 'Server=' + sqlConfig.server + ';Database=' + sqlConfig.database + ';User Id=' + sqlConfig.user + ';Password=' + sqlConfig.password + ';Encrypt=false'
		sql.close()
		return new Promise((resolve, reject) => {
			sql.connect(config).then(() => {
				this.log(`SQL Connected to server ` + sqlConfig.server)
				return sql.query("Insert into InsightsData (TimeStampSQL, TimeStampEvent, DeviceUri, DeviceName, CapabilityName, CapabilityData, LogType) VALUES (GETDATE(), '" + luxon.DateTime.now().setZone(this.homey.clock.getTimezone()).toFormat('yyyy-MM-dd HH:mm:ss.SSS') + "', '00000000-0000-0000-0000-000000000000', 'SQL Connection Test', 'insert into', 'InsightsData', 0)")
			}).then(result => {
				if (result.rowsAffected[0] == 1) {
					this.log(`SQL database write test succeeded.`)
					resolve(true);
				} else {
					this.error(`SQL database write failed, check your privileges.`)
					resolve(false);
				}
			}).catch(err => {
				this.error(`SQL Connection test failed: ` + err + ` (` + err.code + `)`)
				resolve(false);
			})
		})
	}

	// Get all devices function for API
	async getDevices() {
		return await this.api.devices.getDevices();
	}

	async initSQLdb() {
		var sqlSettings = this.homey.settings.get('sqlSettings');
		try {
			if (typeof sqlPool !== 'undefined') {
				sqlPool.close()
			}
		}
		catch (err) {
			this.error('could not close the pool')
		}
		sql.close()
		sqlPool = new sql.ConnectionPool({
			user: sqlSettings.sqlsvr_username,
			password: sqlSettings.sqlsvr_password,
			server: sqlSettings.sqlsvr_ip,
			database: sqlSettings.sqlsvr_db,
			debug: true,
			options: {
				trustedConnection: true,
				instanceName: sqlSettings.sqlsvr_instance || '',
				port: sqlSettings.sqlsvr_port,
				encrypt: false,
				stream: true
			}
		})

		try {
			this.log(`Connecting to the SQL Server`)
			await sqlPool.connect()
		} catch (err) {
			this.error(`Error connecting to SQL Server:` + err);
		}
		return sqlPool
	}

	async logCapabilityData(device, capabilityName, capabilityData, logType) {
		if (capabilityData != null) {
			try {
				if (logType % 2 == 0) {
					sqlPool.request().query("Insert into InsightsData (TimeStampSQL, TimeStampEvent, DeviceUri, DeviceName, CapabilityName, CapabilityData, LogType) VALUES (GETDATE(), '" + luxon.DateTime.now().setZone(this.homey.clock.getTimezone()).toFormat('yyyy-MM-dd HH:mm:ss.SSS') + "', '" + device.id + "', '" + device.name + "', '" + capabilityName + "', '" + capabilityData + "', " + logType + ")")
					//this.log("Insert into InsightsData (TimeStampSQL, TimeStampEvent, DeviceUri, DeviceName, CapabilityName, CapabilityData, LogType) VALUES (GETDATE(), '" + luxon.DateTime.now().setZone(this.homey.clock.getTimezone()).toFormat('yyyy-MM-dd HH:mm:ss.SSS') + "', '" + device.id + "', '" + device.name + "', '" + capabilityName + "', '" + capabilityData + "', " + logType + ")")
				} else {
					sqlPool.request().query("Update top(1) InsightsData Set TimeStampSQL = GETDATE(), TimeStampEvent = '" + luxon.DateTime.now().setZone(this.homey.clock.getTimezone()).toFormat('yyyy-MM-dd HH:mm:ss.SSS') + "', CapabilityData = '" + capabilityData + "', LogType = '" + logType + "' Where DeviceUri = '" + device.id + "' and CapabilityName = '" + capabilityName + "'")
					//this.log("Update top(1) InsightsData Set TimeStampSQL = GETDATE(), TimeStampEvent = '" + luxon.DateTime.now().setZone(this.homey.clock.getTimezone()).toFormat('yyyy-MM-dd HH:mm:ss.SSS') + "', CapabilityData = '" + capabilityData + "', LogType = '" + logType + "' Where DeviceUri = '" + device.id + "' and CapabilityName = '" + capabilityName + "'")
				}
			}
			catch (err) {
				console.log(`Error: function logCapabilityData(` + device.name + `,` + capabilityName + `,` + capabilityData + `,` + timedEvent + `,` + luxon.DateTime.now().setZone(this.homey.clock.getTimezone()).toFormat('yyyy-MM-dd HH:mm:ss.SSS') + `)`)
				console.log(err);
			}
		} else {
			console.log('capabilityData is null?')
			console.log(device.name)
			console.log(typeof capabilityData, ":", capabilityData)
			console.log(capabilityName, ":", logType)
		}
	}

	async querySQL(sqlQuery) {
		try {
			console.log(sqlQuery)
			let responseSQL = await sqlPool.request().query(sqlQuery)
			return responseSQL
			//this.log("Insert into InsightsData (TimeStampSQL, TimeStampEvent, DeviceUri, DeviceName, CapabilityName, CapabilityData, TimedData) VALUES (GETDATE(), '" + luxon.DateTime.now().setZone(this.homey.clock.getTimezone()).toFormat('yyyy-MM-dd HH:mm:ss.SSS') + "', '" + device.name + "', '" + capabilityName + "', '" + capabilityData + "', " + timedEvent + ")")
		}
		catch (err) {
			this.error(`Error: function logCapabilityData(` + device.name + `,` + capabilityName + `,` + capabilityData + `,` + timedEvent + `,` + luxon.DateTime.now().setZone(this.homey.clock.getTimezone()).toFormat('yyyy-MM-dd HH:mm:ss.SSS') + `)`)
			this.error(err);
		}
	}
}

module.exports = App;
