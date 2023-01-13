i2sqlSettings = {}
i2sqlDevices = {}

function hideLoader() {
	$('.splash').hide()
	$('#app').show()
	$('body').css('overflow','auto');
}

function showLogs() {
	Homey.api('GET', 'getlogs/', (err, result) => {
		if (!err) {
			$('#rtlog').html('');
			for (let i = (result.length - 1); i >= 0; i -= 1) {
				$('#rtlog').append(result[i]);
				$('#rtlog').append('<br/>');
			}
		} else {
			$('#rtlog').html(err);
			$('#rtlog').append('<br/>');
		}
	});
}

function deleteLogs() {
	Homey.api('GET', 'deletelogs/', (err) => {
		if (err) {
			Homey.alert(err.message, 'error'); 
		} else { 
			Homey.alert(`${Homey.__('logging.logsDeteleted')}`, 'info');
			$('#rtlog').html('');
			showLogs();
		}
	});
	showLogs();
}

function saveSettings() {
	i2sqlSettings.sqlsvr_ip 			= document.getElementById('sqlsvr_ip').value;
	i2sqlSettings.sqlsvr_instance 	= document.getElementById('sqlsvr_instance').value;
	i2sqlSettings.sqlsvr_port 		= document.getElementById('sqlsvr_port').value;
	i2sqlSettings.sqlsvr_db 			= document.getElementById('sqlsvr_db').value;
	i2sqlSettings.sqlsvr_username 	= document.getElementById('sqlsvr_username').value;
	i2sqlSettings.sqlsvr_password 	= document.getElementById('sqlsvr_password').value;
	Homey.set('sqlSettings', i2sqlSettings, (err) => {
		if (err) {
			Homey.alert(err, 'error');
		}
	});
	Homey.alert(`${Homey.__('Settings saved!')}`, 'info');
}
		
function hideKeyboard() {
	document.activeElement.blur();
	$("input").blur();
	$('body').animate({ scrollTop: top }, 0);
};

function sqlSettingsChanged() {
	i2sqlSettings.sqlsvr_testPassed = false;
	document.getElementById("cancel").style.display = "block";
	document.getElementById("save").style.display = "none";
}

function sqlSettingsReset() {
	document.getElementById('sqlsvr_ip').value			= i2sqlSettings.sqlsvr_ip
	document.getElementById('sqlsvr_instance').value	= i2sqlSettings.sqlsvr_instance
	document.getElementById('sqlsvr_port').value		= i2sqlSettings.sqlsvr_port
	document.getElementById('sqlsvr_db').value 			= i2sqlSettings.sqlsvr_db
	document.getElementById('sqlsvr_username').value	= i2sqlSettings.sqlsvr_username
	document.getElementById('sqlsvr_password').value	= i2sqlSettings.sqlsvr_password
	document.getElementById("cancel").style.display = "none";
	document.getElementById("save").style.display = "block";
}

function testSQLConnection() {
	i2sqlSettings.sqlsvr_ip 			= document.getElementById('sqlsvr_ip').value;
	i2sqlSettings.sqlsvr_instance 	= document.getElementById('sqlsvr_instance').value;
	i2sqlSettings.sqlsvr_port 		= document.getElementById('sqlsvr_port').value;
	i2sqlSettings.sqlsvr_db 			= document.getElementById('sqlsvr_db').value;
	i2sqlSettings.sqlsvr_username 	= document.getElementById('sqlsvr_username').value;
	i2sqlSettings.sqlsvr_password 	= document.getElementById('sqlsvr_password').value;

	var sqlTestConfig = {
		user:		i2sqlSettings.sqlsvr_username,
		password:	i2sqlSettings.sqlsvr_password,
		server:		i2sqlSettings.sqlsvr_ip,
		database:	i2sqlSettings.sqlsvr_db,
		debug: 		true,
		options: {
			trustedConnection: 	true,
			instanceName: 		i2sqlSettings.sqlsvr_instance || '',
			port: 				i2sqlSettings.sqlsvr_port,
			encrypt: 			false,
			stream: 			true
		}
	}
	Homey.api('GET', 'testSQLConnection/?sqlConnectionSetting=' + JSON.stringify(sqlTestConfig), {} , function (err, result) {
		if (err) {
			return Homey.alert(err, 'SQL Connection error');
		} else {
			if (result) {
				i2sqlSettings.sqlsvr_testPassed = true
				document.getElementById("cancel").style.display = "none";
				document.getElementById("save").style.display = "";
				return Homey.alert(`${Homey.__('SQL Connection succeeded. Yoy may save the settings now!')}`, 'info');
			} else {
				i2sqlSettings.sqlsvr_testPassed = false
				document.getElementById("save").style.display = "none";
				return Homey.alert(`${Homey.__('SQL Connection failed. Please check the log for futher information.')}`, 'error');
			}
		}
	});
}

function attachListener(parameters) {
	Homey.api('POST', 'attachListener/?capabilityListener=' + parameters, {} , function (err, result) {
		if (err) {
			return Homey.alert('attachListener error: ' + err);
		} 
	})	
}

function destroyListener(parameters) {
	Homey.api('POST', 'destroyListener/?capabilityListener=' + parameters, {} , function (err, result) {
		if (err) {
			return Homey.alert('destroyListener error: ' + err);
		} 
	})	
}

function attachScheduler(parameters) {
	Homey.api('POST', 'attachScheduler/?capabilityScheduler=' + parameters, {} , function (err, result) {
		if (err) {
			return Homey.alert('attachScheduler error: ' + err);
		} 
	})	
}

function destroyScheduler(parameters) {
	Homey.api('POST', 'destroyScheduler/?capabilityScheduler=' + parameters, {} , function (err, result) {
		if (err) {
			return Homey.alert('destroyScheduler error: ' + err);
		} 
	})	
}

function deviceCleanup() {
	Homey.api('GET', 'deviceCleanup/', {} , function (err, result) {
		if (err) {
			Homey.alert('deviceCleanup error: ' + err); 
		} else { Homey.alert(`Deleted all non-existing devices from logging`, 'info'); }
	});
}
