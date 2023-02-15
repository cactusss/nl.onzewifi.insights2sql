'use strict';

// const { HomeyAPI } = require('athom-api');
// const Homey = require('homey');

module.exports = {
    async getDevices({ homey }) {
        return homey.app.getDevices();
    },
    async getLogs({ homey }) {
        return homey.app.getLogs();
    },
    async deleteLogs({ homey }) {
        return homey.app.deleteLogs();
    },
    async testSQLConnection({ homey, query }) {
        return homey.app.testSQLConnection(JSON.parse(query.sqlConnectionSetting));
    },
    async attachListener({ homey, query }) {
        return homey.app.attachListener(JSON.parse(query.capabilityListener));
    },
    async attachScheduler({ homey, query }) {
        return homey.app.attachScheduler(JSON.parse(query.capabilityScheduler));
    },
    async destroyListener({ homey, query }) {
        return homey.app.destroyListener(JSON.parse(query.capabilityListener));
    },
    async destroyScheduler({ homey, query }) {
        return homey.app.destroyScheduler(JSON.parse(query.capabilityScheduler));
    },
    async deviceCleanup({ homey }) {
        return homey.app.deviceCleanup();
    },    
    async getLegacyMode({ homey }) {
        return homey.app.getLegacyMode();
    }
};